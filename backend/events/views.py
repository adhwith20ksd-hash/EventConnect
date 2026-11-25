
from rest_framework import viewsets
from rest_framework.permissions import (
    IsAuthenticatedOrReadOnly,
    BasePermission
)
from rest_framework.authentication import (
    TokenAuthentication,
    SessionAuthentication
)

from .serializers import (
    EventSerializer,
    CategorySerializer,
    TicketTypeSerializer
)

from .models import Event, Category
from .serializers import EventSerializer, CategorySerializer
from .models import Event, Category, TicketType


class IsEventOrganizer(BasePermission):
    def has_object_permission(self, request, view, obj):
        if request.method in ['GET', 'HEAD', 'OPTIONS']:
            return True

        return obj.organizer == request.user


class EventViewSet(viewsets.ModelViewSet):
    queryset = Event.objects.all().order_by('-created_at')
    serializer_class = EventSerializer

    authentication_classes = [
        TokenAuthentication,
        SessionAuthentication
    ]

    permission_classes = [
        IsAuthenticatedOrReadOnly,
        IsEventOrganizer
    ]

    def perform_create(self, serializer):
        serializer.save(organizer=self.request.user)

    
def get_queryset(self):
    queryset = Event.objects.all().order_by('-created_at')

    search = self.request.query_params.get('search')
    location = self.request.query_params.get('location')
    category = self.request.query_params.get('category')

    if search:
        queryset = queryset.filter(title__icontains=search)

    if location:
        queryset = queryset.filter(location__icontains=location)

    if category:
        queryset = queryset.filter(category_id=category)

    return queryset



class CategoryViewSet(viewsets.ModelViewSet):
    queryset = Category.objects.all()
    serializer_class = CategorySerializer

    authentication_classes = [
        TokenAuthentication,
        SessionAuthentication
    ]

    permission_classes = [
        IsAuthenticatedOrReadOnly
    ]


class TicketTypeViewSet(viewsets.ReadOnlyModelViewSet):
    serializer_class = TicketTypeSerializer

    def get_queryset(self):
        queryset = TicketType.objects.all()
        event_id = self.request.query_params.get('event')

        if event_id:
            queryset = queryset.filter(event_id=event_id)

        return queryset

