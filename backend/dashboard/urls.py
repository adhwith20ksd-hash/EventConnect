from django.urls import path
from .views import OrganizerDashboardView, AdminDashboardView

urlpatterns = [
    path('organizer/', OrganizerDashboardView.as_view(), name='organizer-dashboard'),
    path('admin/', AdminDashboardView.as_view(), name='admin-dashboard'),
    
]