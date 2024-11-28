from django.urls import path
from .views import upload_referenced_docs, connect, trigger_task

urlpatterns = [
    path("connect/", connect, name="connect"),
    path("upload_referenced_docs/", upload_referenced_docs, name="upload_referenced_docs"),
    path("trigger_app/", trigger_task, name="trigger_node_app")
]