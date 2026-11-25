
from django.contrib.auth.models import User
from django.db.models import Sum

from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.authentication import TokenAuthentication, SessionAuthentication
from rest_framework.permissions import IsAuthenticated, IsAdminUser

from events.models import Event
from bookings.models import Booking

class OrganizerDashboardView(APIView):
    authentication_classes = [TokenAuthentication, SessionAuthentication]
    permission_classes = [IsAuthenticated]

    def get(self, request):
        events = Event.objects.filter(organizer=request.user)

        bookings = Booking.objects.filter(
            ticket_type__event__organizer=request.user
        )

        return Response({
            "total_events": events.count(),
            "total_bookings": bookings.count(),
            "confirmed_bookings": bookings.filter(
                status="CONFIRMED"
            ).count(),
            "pending_bookings": bookings.filter(
                status="PENDING"
            ).count(),
            "cancelled_bookings": bookings.filter(
                status="CANCELLED"
            ).count(),
        })


class AdminDashboardView(APIView):
    authentication_classes = [TokenAuthentication, SessionAuthentication]
    permission_classes = [IsAdminUser]

    def get(self, request):

        bookings = Booking.objects.all()

        confirmed_bookings = bookings.filter(status="CONFIRMED")

        total_revenue = confirmed_bookings.aggregate(
            total=Sum("total_amount")
        )["total"] or 0

        return Response({
            "total_users": User.objects.count(),
            "total_events": Event.objects.count(),
            "total_bookings": bookings.count(),
            "confirmed_bookings": confirmed_bookings.count(),
            "pending_bookings": bookings.filter(status="PENDING").count(),
            "cancelled_bookings": bookings.filter(status="CANCELLED").count(),
            "total_revenue": total_revenue,
        })
