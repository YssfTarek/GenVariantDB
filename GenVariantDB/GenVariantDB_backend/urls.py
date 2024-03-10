from django.urls import path
from .views import connect

urlpatterns = [
    path("connect/", connect, name="connect")
]