from django.urls import path
from .views import uploadReferencedDocs, connect

urlpatterns = [
    path("connect/", connect, name="connect"),
    path("uploadReferencedDocs/", uploadReferencedDocs, name="uploadReferencedDocs")
]