
from decimal import Decimal

import razorpay

from django.conf import settings
from django.db import transaction
from django.shortcuts import get_object_or_404

from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import status
from rest_framework.permissions import IsAuthenticated, IsAdminUser
from rest_framework.authentication import (
    TokenAuthentication,
    SessionAuthentication
)

from events.models import TicketType
from .models import Booking


def get_razorpay_client():
    if not settings.RAZORPAY_KEY_ID or not settings.RAZORPAY_KEY_SECRET:
        raise ValueError("Razorpay API credentials are not configured.")

    return razorpay.Client(
        auth=(
            settings.RAZORPAY_KEY_ID,
            settings.RAZORPAY_KEY_SECRET
        )
    )


class BookingView(APIView):
    authentication_classes = [
        TokenAuthentication,
        SessionAuthentication
    ]
    permission_classes = [IsAuthenticated]

    # GET: View booking history
    def get(self, request):
        bookings = Booking.objects.filter(
            user=request.user
        ).select_related(
            'ticket_type__event'
        ).order_by('-booking_date')

        data = []

        for booking in bookings:
            data.append({
                "id": booking.id,
                "event": booking.ticket_type.event.title,
                "ticket": booking.ticket_type.name,
                "quantity": booking.quantity,
                "total_amount": str(booking.total_amount),
                "status": booking.status,
                "booking_date": booking.booking_date,
                "ticket_code": str(booking.ticket_code),
                "qr_code": (
                    request.build_absolute_uri(booking.qr_code.url)
                    if booking.qr_code else None
                )
            })

        return Response(data)


class CreatePaymentOrderView(APIView):
    authentication_classes = [
        TokenAuthentication,
        SessionAuthentication
    ]
    permission_classes = [IsAuthenticated]

    def post(self, request):
        ticket_type_id = request.data.get("ticket_type_id")
        quantity = request.data.get("quantity")

        if not ticket_type_id:
            return Response(
                {"error": "ticket_type_id is required"},
                status=status.HTTP_400_BAD_REQUEST
            )

        try:
            quantity = int(quantity)
            if quantity <= 0:
                raise ValueError
        except (TypeError, ValueError):
            return Response(
                {"error": "Quantity must be a positive integer"},
                status=status.HTTP_400_BAD_REQUEST
            )

        try:
            with transaction.atomic():
                ticket = get_object_or_404(
                    TicketType.objects.select_for_update(),
                    id=ticket_type_id
                )

                if ticket.available_quantity < quantity:
                    return Response(
                        {"error": "Not enough tickets available"},
                        status=status.HTTP_400_BAD_REQUEST
                    )

                total = ticket.price * quantity
                amount_in_paise = int(total * Decimal("100"))

                booking = Booking.objects.create(
                    user=request.user,
                    ticket_type=ticket,
                    quantity=quantity,
                    total_amount=total,
                    status="PENDING"
                )

                client = get_razorpay_client()

                order = client.order.create({
                    "amount": amount_in_paise,
                    "currency": "INR",
                    "receipt": f"booking-{booking.id}"
                })

                booking.razorpay_order_id = order["id"]
                booking.save(update_fields=["razorpay_order_id"])

                ticket.available_quantity -= quantity
                ticket.save(update_fields=["available_quantity"])

            return Response({
                "message": "Payment order created",
                "booking_id": booking.id,
                "razorpay_order_id": order["id"],
                "razorpay_key_id": settings.RAZORPAY_KEY_ID,
                "amount": amount_in_paise,
                "currency": "INR",
                "event": ticket.event.title,
                "ticket": ticket.name,
                "quantity": quantity
            }, status=status.HTTP_201_CREATED)

        except Exception as error:
            return Response(
                {"error": str(error)},
                status=status.HTTP_400_BAD_REQUEST
            )


class VerifyPaymentView(APIView):
    authentication_classes = [
        TokenAuthentication,
        SessionAuthentication
    ]
    permission_classes = [IsAuthenticated]

    def post(self, request):
        booking_id = request.data.get("booking_id")
        order_id = request.data.get("razorpay_order_id")
        payment_id = request.data.get("razorpay_payment_id")
        signature = request.data.get("razorpay_signature")

        if not all([booking_id, order_id, payment_id, signature]):
            return Response(
                {"error": "All payment details are required"},
                status=status.HTTP_400_BAD_REQUEST
            )

        booking = get_object_or_404(
            Booking,
            id=booking_id,
            user=request.user
        )

        if booking.razorpay_order_id != order_id:
            return Response(
                {"error": "Payment order does not match this booking"},
                status=status.HTTP_400_BAD_REQUEST
            )

        try:
            client = get_razorpay_client()

            client.utility.verify_payment_signature({
                "razorpay_order_id": order_id,
                "razorpay_payment_id": payment_id,
                "razorpay_signature": signature
            })

        except Exception as e:
            print("RAZORPAY VERIFICATION ERROR:", repr(e))

            return Response(
                {
                    "error": "Payment verification failed",
                    "details": str(e)
                },
                status=status.HTTP_400_BAD_REQUEST
            )

        with transaction.atomic():
            booking = get_object_or_404(
                Booking.objects.select_for_update(),
                id=booking_id,
                user=request.user
            )

            if booking.status == "CONFIRMED":
                return Response({
                    "message": "Payment already verified",
                    "booking_id": booking.id
                })

            if booking.status != "PENDING":
                return Response(
                    {"error": "This booking is no longer pending"},
                    status=status.HTTP_400_BAD_REQUEST
                )

            booking.razorpay_payment_id = payment_id
            booking.status = "CONFIRMED"
            booking.save(update_fields=[
                "razorpay_payment_id",
                "status"
            ])

            booking.generate_qr_code()

        return Response({
            "message": "Payment successful! Booking confirmed.",
            "booking_id": booking.id,
            "ticket_code": str(booking.ticket_code),
            "qr_code": (
                request.build_absolute_uri(booking.qr_code.url)
                if booking.qr_code else None
            )
        })


class PaymentFailedView(APIView):
    authentication_classes = [
        TokenAuthentication,
        SessionAuthentication
    ]
    permission_classes = [IsAuthenticated]

    def post(self, request):
        booking_id = request.data.get("booking_id")

        if not booking_id:
            return Response(
                {"error": "booking_id is required"},
                status=status.HTTP_400_BAD_REQUEST
            )

        with transaction.atomic():
            booking = get_object_or_404(
                Booking.objects.select_for_update(),
                id=booking_id,
                user=request.user
            )

            if booking.status == "CANCELLED":
                return Response({
                    "message": "Booking is already cancelled"
                })

            if booking.status != "PENDING":
                return Response(
                    {"error": "Only pending bookings can be cancelled here"},
                    status=status.HTTP_400_BAD_REQUEST
                )

            ticket = TicketType.objects.select_for_update().get(
                id=booking.ticket_type_id
            )

            ticket.available_quantity += booking.quantity
            ticket.save(update_fields=["available_quantity"])

            booking.status = "CANCELLED"
            booking.save(update_fields=["status"])

        return Response({
            "message": "Pending booking cancelled and tickets restored",
            "booking_id": booking.id
        })


class CancelBookingView(APIView):
    authentication_classes = [
        TokenAuthentication,
        SessionAuthentication
    ]
    permission_classes = [IsAuthenticated]

    def post(self, request, booking_id):
        with transaction.atomic():
            booking = get_object_or_404(
                Booking.objects.select_for_update(),
                id=booking_id,
                user=request.user
            )

            if booking.status == "CANCELLED":
                return Response(
                    {"error": "Booking is already cancelled"},
                    status=status.HTTP_400_BAD_REQUEST
                )

            if booking.status == "PENDING":
                return Response(
                    {"error": "Complete or cancel the payment first"},
                    status=status.HTTP_400_BAD_REQUEST
                )

            if booking.status == "CONFIRMED":
                return Response(
                    {"error": "Refunds are not configured yet. Paid bookings cannot be cancelled through this endpoint."},
                    status=status.HTTP_400_BAD_REQUEST
                )

            ticket = TicketType.objects.select_for_update().get(
                id=booking.ticket_type_id
            )

            ticket.available_quantity += booking.quantity
            ticket.save(update_fields=["available_quantity"])

            booking.status = "CANCELLED"
            booking.save(update_fields=["status"])

        return Response({
            "message": "Booking cancelled successfully",
            "booking_id": booking.id,
            "available_quantity": ticket.available_quantity
        })


class VerifyTicketView(APIView):
    authentication_classes = [
        TokenAuthentication,
        SessionAuthentication
    ]
    permission_classes = [IsAdminUser]

    def post(self, request):
        ticket_code = request.data.get("ticket_code")

        if not ticket_code:
            return Response(
                {"error": "ticket_code is required"},
                status=status.HTTP_400_BAD_REQUEST
            )

        booking = Booking.objects.filter(
            ticket_code=ticket_code
        ).select_related(
            "user", "ticket_type__event"
        ).first()

        if not booking:
            return Response({
                "valid": False,
                "message": "Invalid ticket"
            }, status=status.HTTP_404_NOT_FOUND)

        if booking.status != "CONFIRMED":
            return Response({
                "valid": False,
                "message": "Ticket is not confirmed or has been cancelled"
            }, status=status.HTTP_400_BAD_REQUEST)

        return Response({
            "valid": True,
            "message": "Valid ticket",
            "booking_id": booking.id,
            "event": booking.ticket_type.event.title,
            "ticket": booking.ticket_type.name,
            "customer": booking.user.username,
            "quantity": booking.quantity,
            "ticket_code": str(booking.ticket_code),
            "qr_code": (
                request.build_absolute_uri(booking.qr_code.url)
                if booking.qr_code else None
            )
        })
