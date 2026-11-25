
from django.urls import path

from .views import (
    BookingView,
    CancelBookingView,
    VerifyTicketView,
    CreatePaymentOrderView,
    VerifyPaymentView,
    PaymentFailedView,
)

urlpatterns = [
    # Booking history
    path('', BookingView.as_view(), name='bookings'),

    # Razorpay payment
    path(
        'create-order/',
        CreatePaymentOrderView.as_view(),
        name='create-payment-order'
    ),
    path(
        'verify-payment/',
        VerifyPaymentView.as_view(),
        name='verify-payment'
    ),
    path(
        'payment-failed/',
        PaymentFailedView.as_view(),
        name='payment-failed'
    ),

    # Ticket verification and cancellation
    path(
        'verify/',
        VerifyTicketView.as_view(),
        name='verify-ticket'
    ),
    path(
        '<int:booking_id>/cancel/',
        CancelBookingView.as_view(),
        name='cancel-booking'
    ),
]
