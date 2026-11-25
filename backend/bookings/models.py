
import uuid
import io
import qrcode

from django.db import models
from django.contrib.auth.models import User
from django.core.files.base import ContentFile
from events.models import TicketType


class Booking(models.Model):
    STATUS_CHOICES = [
        ("PENDING", "Pending"),
        ("CONFIRMED", "Confirmed"),
        ("CANCELLED", "Cancelled"),
    ]

    user = models.ForeignKey(User, on_delete=models.CASCADE)
    ticket_type = models.ForeignKey(
        TicketType, on_delete=models.CASCADE
    )
    quantity = models.PositiveIntegerField()
    total_amount = models.DecimalField(
        max_digits=10, decimal_places=2
    )
    status = models.CharField(
        max_length=20,
        choices=STATUS_CHOICES,
        default="PENDING"
    )
    booking_date = models.DateTimeField(auto_now_add=True)

    ticket_code = models.UUIDField(
        default=uuid.uuid4,
        unique=True,
        editable=False
    )

    qr_code = models.ImageField(
        upload_to="qr_codes/",
        blank=True,
        null=True
    )

    razorpay_order_id = models.CharField(
        max_length=100,
        blank=True,
        null=True
    )
    razorpay_payment_id = models.CharField(
        max_length=100,
        blank=True,
        null=True
    )

    def generate_qr_code(self):
        qr = qrcode.make(str(self.ticket_code))

        buffer = io.BytesIO()
        qr.save(buffer, format="PNG")

        filename = f"ticket_{self.ticket_code}.png"

        self.qr_code.save(
            filename,
            ContentFile(buffer.getvalue()),
            save=False
        )

        self.save(update_fields=["qr_code"])

    def __str__(self):
        return f"Booking #{self.id}"
