
from rest_framework.routers import DefaultRouter
from .views import EventViewSet, CategoryViewSet, TicketTypeViewSet

router = DefaultRouter()

router.register('events', EventViewSet, basename='events')
router.register('categories', CategoryViewSet, basename='categories')
router.register('ticket-types', TicketTypeViewSet, basename='ticket-types')

urlpatterns = router.urls
