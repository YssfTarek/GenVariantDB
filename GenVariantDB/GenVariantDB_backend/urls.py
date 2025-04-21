from django.urls import path
from .views import upload_referenced_docs, connect

urlpatterns = [
    path("connect/", connect, name="connect"),
    path("upload_vcf/", upload_referenced_docs, name="upload_vcf"),]