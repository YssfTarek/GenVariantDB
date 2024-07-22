from django.urls import path
from .views import connect, writeManifest, getDocCount, get_var_stats

urlpatterns = [
    path("connect/", connect, name="connect"),
    path("writeManifest/", writeManifest, name="writeManifest"),
    path("getDocCount/", getDocCount, name="getDocCount"),
    path ("get_var_stats/", get_var_stats, name="get_var_stats")
]