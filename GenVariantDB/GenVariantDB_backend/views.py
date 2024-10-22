import logging
from django.views.decorators.csrf import csrf_exempt
from django.http import HttpResponse, JsonResponse
from .utils import chunk_data, prepare_variant_data
import requests
import httpx
import asyncio

# Set up logging
logger = logging.getLogger(__name__)

def connect(request):
    if request.method == "GET":
        return HttpResponse("You are successfully connected to the Django Backend!")
    return HttpResponse("Invalid request method.")


@csrf_exempt
async def async_send_chunk(chunk, patient_id, semaphore):
    node_url_variant = "http://localhost:3000/api/addVariants"
    data_payload = {
        "patient_id": patient_id,
        "data": chunk
    }

    async with semaphore:
        async with httpx.AsyncClient(timeout=60.0) as client:
            logger.debug(f"Sending chunk to Node.js: {data_payload}")
            try:
                response = await client.post(node_url_variant, json=data_payload)
                logger.debug(f"Response from Node.js for patient {patient_id}: {response.status_code}, {response.json()}")
                return response
            except httpx.RequestError as e:
                logger.error(f"Request error sending chunk to Node.js for patient {patient_id}: {str(e)}")
                return None  # Return None to indicate failure
            except Exception as e:
                logger.error(f"Error sending chunk to Node.js for patient {patient_id}: {str(e)}")
                return None


@csrf_exempt
async def upload_variants_concurrently(combined_data, patient_id, max_concurrent_requests):
    tasks = []
    chunk_size = 200
    semaphore = asyncio.Semaphore(max_concurrent_requests)
    for chunk in chunk_data(combined_data, chunk_size):
        tasks.append(async_send_chunk(chunk, patient_id, semaphore))

    responses = await asyncio.gather(*tasks)

    # Collect errors where the response is None or status_code is not 201
    errors = []
    for response in responses:
        if response is None:
            errors.append({
                "status": "Request failed",
                "message": "No response from the server"
            })
        elif response.status_code != 201:
            errors.append({
                "status": response.status_code,
                "message": response.json()  # Ensure to handle this in case of malformed JSON
            })
            logger.error(f"Error uploading variant: {response.status_code}, {response.json()}")

    return errors  # Return the list of errors to be handled later

@csrf_exempt
def uploadReferencedDocs(request):
    if request.method == 'POST':
        vcf_file = request.FILES.get('vcf_file')
        
        if not vcf_file:
            logger.warning("Missing 'vcf_file'")
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
            logger.debug(f"Sending patient data: {patient_data}")
            patient_response = requests.post(node_url_patient, json={"patient": patient_data})
            if patient_response.status_code != 201:
                logger.error(f"Error adding patient: {patient_response.json()}")
                return JsonResponse({"error": patient_response.json()}, status=patient_response.status_code)

            # Extract patient ID from the response
            patient_id = patient_response.json().get('patient_id')
            logger.info(f"Successfully added patient, ID: {patient_id}")
        except requests.exceptions.RequestException as e:
            logger.error(f"Node.js service error when adding patient: {str(e)}")
            return JsonResponse({"error": f"Node.js service error when adding patient: {str(e)}"}, status=500)

        # Prepare variant data and send in chunks
        combined_data = prepare_variant_data(vcf_file)
        logger.info(f"Prepared variant data for patient ID: {patient_id}")

        max_concurrent_requests = 16
        responses = asyncio.run(upload_variants_concurrently(combined_data, patient_id, max_concurrent_requests))

        errors = []
        for response in responses:
            if response and response.status_code != 201:
                errors.append({
                    "status": response.status_code,
                    "message": response.json()
                })
                logger.error(f"Error uploading variant: {response.status_code}, {response.json()}")

        if errors:
            logger.warning(f"Errors occurred during upload: {errors}")
            return JsonResponse({'errors': errors}, status=500)

        logger.info("Data successfully uploaded for patient ID: {patient_id}")
        return JsonResponse({"message": "Data successfully uploaded"}, status=201)
    
    logger.warning("Invalid request method")
    return HttpResponse("Invalid request method", status=400)