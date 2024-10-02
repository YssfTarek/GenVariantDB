from django.urls import path
from .views import connect, uploadReferencedDocs, delete_patient_and_records, get_all_patients_by_name

urlpatterns = [
    path("connect/", connect, name="connect"),
    path("uploadReferencedDocs/", uploadReferencedDocs, name="uploadReferencedDocs"),
    path("delete_patient_and_records/", delete_patient_and_records, name = "delete_patient_and_records"),
    path("get_all_patients_by_name/", get_all_patients_by_name, name="get_all_patients_by_name")
]