
from django.db import models
from django.contrib.auth.models import User


class Category(models.Model):
    name = models.CharField(max_length=100)

    def __str__(self):
        return self.name


class Event(models.Model):
    organizer = models.ForeignKey(
        User, on_delete=models.CASCADE
    )
    category = models.ForeignKey(
        Category, on_delete=models.SET_NULL, null=True
    )
    title = models.CharField(max_length=200)
    description = models.TextField()
    location = models.CharField(max_length=200)
    date = models.DateTimeField()
    poster = models.ImageField(
        upload_to="event_posters/", blank=True, null=True
    )
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return self.title


class TicketType(models.Model):
    event = models.ForeignKey(
        Event, on_delete=models.CASCADE,
        related_name="ticket_types"
    )
    name = models.CharField(max_length=100)
    price = models.DecimalField(max_digits=10, decimal_places=2)
    total_quantity = models.PositiveIntegerField()
    available_quantity = models.PositiveIntegerField()

    def __str__(self):
        return f"{self.event.title} - {self.name}"
