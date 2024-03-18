from django.urls import path
from .views import connect, writeManifest

urlpatterns = [
    path("connect/", connect, name="connect"),
    path("writeManifest/", writeManifest, name="writeManifest"),
]