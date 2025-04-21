from django.http import JsonResponse, HttpResponse
from .utils import prepare_variant_data, publish_tasks_to_redis
from django.views.decorators.csrf import csrf_exempt
import requests

def connect(request):
    if request.method == "GET":
        return HttpResponse("You are successfully connected to the Django Backend!")
    return HttpResponse("Invalid request method.")

@csrf_exempt
def upload_referenced_docs(request):
    if request.method == 'POST':
        vcf_file = request.FILES.get('vcf_file')
        patient_id = request.POST.get('patient_id')
        chunk_size = 1000
        vcf_data = prepare_variant_data(vcf_file)
        publish_tasks_to_redis(vcf_data, chunk_size, patient_id)
        return JsonResponse({"message": "Tasks published to Redis"}, status=202)
    return JsonResponse({"error": "Invalid request method"}, status=405)