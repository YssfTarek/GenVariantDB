from django.http import JsonResponse, HttpResponse
from .utils import prepare_variant_data
from .tasks import process_vcf_data_and_send_batches, trigger_node_app
from django.views.decorators.csrf import csrf_exempt
from celery.result import GroupResult
import requests

def connect(request):
    if request.method == "GET":
        return HttpResponse("You are successfully connected to the Django Backend!")
    return HttpResponse("Invalid request method.")

@csrf_exempt
def upload_referenced_docs(request):
    if request.method == 'POST':
        vcf_file = request.FILES.get('vcf_file')
        
        if not vcf_file:
            print("Missing VCF_file")
            return JsonResponse({"error": "Missing 'vcf_file'"}, status=400)
        
        patient_data = {
            "patient_name": request.POST.get('patient_name'),
            "accession_number": request.POST.get('accession_number'),
            "hpo_terms": request.POST.get('hpo_terms')
        }
        
        node_url_patient = "http://localhost:3000/api/addPatient"
        
        try:
            print(f"Sending patient data: {patient_data}")
            patient_response = requests.post(node_url_patient, json={"patient": patient_data})
            if patient_response.status_code != 201:
                print(f"Error adding patient: {patient_response.json()}")
                return JsonResponse({"error": patient_response.json()}, status = patient_response.status_code)
            
            patient_id = patient_response.json().get('patient_id')
            print(f"Successfully added patient, ID: {patient_id}")
        except requests.exceptions.RequestException as e:
            print(f"Node.js service error when adding patient: {str(e)}")
            return JsonResponse({"error": f"Nodejs service error when adding patient: {str(e)}"}, status=500)
        
        combined_data = prepare_variant_data(vcf_file)
        print(f"Prepared variant data for patient ID: {patient_id}")
        
        max_concurrent_requests = 16 #set the max number of concurrent requests
        
        print("Begin processing...")
        task_group_id = process_vcf_data_and_send_batches.delay(combined_data, patient_id, max_concurrent_requests)
        
        return JsonResponse({"task_group_id": task_group_id.id}, status=202)
    
    return JsonResponse({"error": "Invalid request method"}, status=405)

def check_task_status(request, task_group_id):
    group_result = GroupResult.restore(task_group_id)

    if not group_result:
        return JsonResponse({"error": "Task group not found"}, status=404)
    
    if group_result.ready():
        errors = [result for result in group_result.results if result.status != 'SUCCESS']
        return JsonResponse({"status": "completed", "errors": errors}, status=200)

    return JsonResponse({"status": "in-progress"}, status=202)

def trigger_task(request):
    # Trigger the Celery task asynchronously
    task = trigger_node_app.delay()
    
    # Wait for the task result (get the result of the task execution)
    result = task.get(timeout=10)  # Optional timeout for how long to wait for task completion

    # Return the task result as a JSON response
    return JsonResponse(result)