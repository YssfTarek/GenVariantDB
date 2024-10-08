from django.views.decorators.csrf import csrf_exempt
from django.http import HttpResponse, JsonResponse
from .utils import read_vcf, extract_var_info, extract_format
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
            return HttpResponse("Missing 'vcf_file' or 'patient_name'", status=400)
        
        # Parse the VCF file
        trimmed_vcf = read_vcf(vcf_file)
        variants_data = trimmed_vcf.loc[:, :"ALT"].to_dict(orient="records")
        qual_data = trimmed_vcf[['QUAL', 'FILTER']].to_dict(orient="records")
        info_data = extract_var_info(trimmed_vcf)
        format_data = extract_format(trimmed_vcf)

        node_url = "http://localhost:3000/api/addPatient"

        patient_data = {
            "patient_name": request.POST.get('patient_name'),
            "accession_number": request.POST.get('accession_number'),
            "hpo_terms": request.POST.get('hpo_terms')
        }

        data_payload = {
            "patient" : patient_data,
            "variants": variants_data,
            "qual": qual_data,
            "info": info_data,
            "format": format_data
        }
        
        try:
            response =  requests.post(node_url, json=data_payload)
            if response.status_code == 201:
                return JsonResponse({"message": "Data successfully uploadeded"}, status=201)
            else:
                return JsonResponse({"error": response.json()}, status = response.status_code)
        except requests.exceptions.RequestException as e:
            return JsonResponse({"error": f"Node.js service error: {str(e)}"}, status=500)
        
    return HttpResponse("Invalid request method", status=400)