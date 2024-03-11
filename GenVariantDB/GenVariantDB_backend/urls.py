from django.urls import path
from .views import connect, write

urlpatterns = [
    path("connect/", connect, name="connect"),
    path("write/", write, name="write")
]