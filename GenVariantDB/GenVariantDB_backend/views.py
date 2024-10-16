from django.views.decorators.csrf import csrf_exempt
from django.http import HttpResponse, JsonResponse
from .utils import chunk_data, prepare_variant_data
import requests

def connect(request):
    if request.method == "GET":
        return HttpResponse("You are secceddfully connected to Django Backend!")
    return HttpResponse("Invalid request method.")

@csrf_exempt
def uploadReferencedDocs(request):
    if request.method == 'POST':
        vcf_file = request.FILES.get('vcf_file')
        
        if not vcf_file:
            return HttpResponse("Missing 'vcf_file'", status=400)

        # Get patient data from the request
        patient_data = {
            "patient_name": request.POST.get('patient_name'),
            "accession_number": request.POST.get('accession_number'),
            "hpo_terms": request.POST.get('hpo_terms')
        }

        # First send the patient data and get the patient ID from the Node.js backend
        node_url_patient = "http://localhost:3000/api/addPatient"
        try:
            patient_response = requests.post(node_url_patient, json={"patient": patient_data})
            if patient_response.status_code != 201:
                return JsonResponse({"error": patient_response.json()}, status=patient_response.status_code)

            # Extract patient ID from the response
            patient_id = patient_response.json().get('patient_id')
        except requests.exceptions.RequestException as e:
            return JsonResponse({"error": f"Node.js service error when adding patient: {str(e)}"}, status=500)

        # Prepare variant data and send in chunks
        combined_data = prepare_variant_data(vcf_file)
        chunk_size = 50
        node_url_variant = "http://localhost:3000/api/addVariants"
        errors = []

        for chunk in chunk_data(combined_data, chunk_size):
            data_payload = {
                "patient_id": patient_id,
                "data": chunk
            }
            try:
                response = requests.post(node_url_variant, json=data_payload)
                if response.status_code != 201:
                    errors.append({
                        "status": response.status_code,
                        "message": response.json()
                    })
            except requests.exceptions.RequestException as e:
                errors.append({"error": f"Node.js service error when adding variants: {str(e)}"})

        if errors:
            return JsonResponse({"errors": errors}, status=500)

        return JsonResponse({"message": "Data successfully uploaded"}, status=201)
    
    return HttpResponse("Invalid request method", status=400)