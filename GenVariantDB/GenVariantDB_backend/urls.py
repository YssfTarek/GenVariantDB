from django.urls import path
from .views import connect, write, writeManifest

urlpatterns = [
    path("connect/", connect, name="connect"),
    path("write/", write, name="write"),
    path("writeManifest/", writeManifest, name="writeManifest"),
]