from django.views.decorators.csrf import csrf_exempt
from django.http import HttpResponse, JsonResponse
from pymongo import InsertOne, UpdateOne
from .utils import mongoConnect, read_vcf, extract_var_info, extract_format
from bson import ObjectId
import json

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

        # Get patient data from form data
        patient_name = request.POST.get('patient_name')
        accession_number = request.POST.get('accession_number')
        hpo_terms = request.POST.get('hpo_terms')

        # Connect to MongoDB
        try:
            collections = mongoConnect()
            if not collections:
                raise ValueError("Failed to retrieve MongoDB collections")
            
            patient_collection, variant_collection, quality_collection, info_collection, format_collection = collections

            # Insert or find the patient record
            patient = patient_collection.find_one({"accession_number": accession_number})

            if not patient:
                patient_record = {
                    "name": patient_name,
                    "accession_number": accession_number,
                    "hpo_terms": hpo_terms
                }
                patient_id = patient_collection.insert_one(patient_record).inserted_id
            else:
                patient_id = patient["_id"]  # Get existing patient ID

            # Prepare bulk operations for variants, quality, info, and format
            bulk_operations = {
                "variants": [],
                "quality": [],
                "info": [],
                "format": []
            }
            existing_variant_map = { 
                (variant["chrom"], variant["pos"], variant["ref"], variant["alt"]): variant 
                for variant in variant_collection.find({
                    "$or": [
                        {
                            "chrom": variant["#CHROM"], 
                            "pos": variant["POS"], 
                            "ref": variant["REF"], 
                            "alt": variant["ALT"]
                        } 
                        for variant in variants_data
                    ]
                })
            }

            for idx, variant_data in enumerate(variants_data):
                variant_key = (variant_data["#CHROM"], variant_data["POS"], variant_data["REF"], variant_data["ALT"])
                
                if variant_key in existing_variant_map:
                    # Variant exists, update the patient reference
                    variant_id = existing_variant_map[variant_key]["_id"]
                    bulk_operations["variants"].append(
                        UpdateOne({"_id": variant_id}, {"$addToSet": {"patients": patient_id}})
                    )
                else:
                    # Create a new variant
                    variant_record = {
                        "chrom": variant_data["#CHROM"],
                        "pos": variant_data["POS"],
                        "ref": variant_data["REF"],
                        "alt": variant_data["ALT"],
                        "patients": [patient_id]
                    }
                    variant_id = variant_collection.insert_one(variant_record).inserted_id
                    
                    # Prepare bulk operations for quality, info, and format records
                    bulk_operations["variants"].append(InsertOne(variant_record))
                
                # Prepare quality, info, and format records
                quality_record = {
                    "qual": qual_data[idx]["QUAL"],
                    "filter": qual_data[idx]["FILTER"],
                    "variant_id": variant_id,
                    "patient_id": patient_id
                }
                bulk_operations["quality"].append(InsertOne(quality_record))

                info_record = {
                    "variant_id": variant_id,
                    "patient_id": patient_id,
                    "info": info_data[idx]
                }
                bulk_operations["info"].append(InsertOne(info_record))

                format_record = {
                    "variant_id": variant_id,
                    "patient_id": patient_id,
                    "format": format_data[idx]
                }
                bulk_operations["format"].append(InsertOne(format_record))

            # Execute bulk operations for variants, quality, info, and format
            if bulk_operations["variants"]:
                variant_collection.bulk_write(bulk_operations["variants"])
            if bulk_operations["quality"]:
                quality_collection.bulk_write(bulk_operations["quality"])
            if bulk_operations["info"]:
                info_collection.bulk_write(bulk_operations["info"])
            if bulk_operations["format"]:
                format_collection.bulk_write(bulk_operations["format"])

        except Exception as e:
            return HttpResponse(f"Error saving patient data: {str(e)}", status=500)

        response = HttpResponse(f"Patient data saved with ID: {patient_id}", status=201)
        response["Access-Control-Allow-Origin"] = "http://localhost:3000"
        response["Access-Control-Allow-Headers"] = "Content-Type"
        response["Access-Control-Allow-Methods"] = "GET, POST, PUT, DELETE, OPTIONS"

        return response

    else:
        return HttpResponse("Invalid request", status=400)

@csrf_exempt
def delete_patient_and_records(request):
    if request.method == "DELETE":
        try:
            body = json.loads(request.body.decode('utf-8'))
            patient_id = body.get('patient_id')

            if not patient_id:
                return HttpResponse({"patient_id is required"}, status=400)
            
            collections = mongoConnect()
            if not collections:
                raise ValueError("Could not get MongoDB collections.")
            
            patient_collection, variant_collection, quality_collection, info_collection, format_collection = collections

            #find patient to be deleted
            patient = patient_collection.find_one({"_id": ObjectId(patient_id)})
            if not patient:
                return HttpResponse({"Patient not found"}, status=404)
            
            #find all variants associated with patient
            variants = variant_collection.find({"patients": ObjectId(patient_id)})
            variants_to_delete = []
            for variant in variants:
                #count variants linked to patient
                if len(variant.get("patients", [])) == 1:
                    #only one patient linked to variant
                    variants_to_delete.append(variant["_id"])
                else:
                    #remove patient reference from variant
                    variant_collection.update_one(
                        {"_id": variant["_id"]},
                        {"$pull": {"patients": ObjectId(patient_id)}}
                    )

                #delete references linked to the patient. Ensure that they are deleted even when variant is shared
                quality_collection.delete_many({
                    "variant_id": variant["_id"],
                    "patient_id": ObjectId(patient_id)
                })
                info_collection.delete_many({
                    "variant_id": variant["_id"],
                    "patient_id": ObjectId(patient_id)
                })
                format_collection.delete_many({
                    "variant_id": variant["_id"],
                    "patient_id": ObjectId(patient_id)
                })

            #delete all orphaned variants linked to the deleted patient
            if variants_to_delete:
                variant_collection.delete_many(
                    {"_id": {"$in": variants_to_delete}}
                )

            #delete the patient
            patient_collection.delete_one({"_id": ObjectId(patient_id)})

            return HttpResponse({"Patient and associated data deleted successfully!"}, status=204)
        
        except json.JSONDecodeError:
            return JsonResponse({"error": "Invalid data or format entered"}, status=400)
        except Exception as e:
            return HttpResponse({f"Error deleteing patient: {str(e)}"}, status=500)
        
    else:
        return HttpResponse({"Invalid request method"}, status=400)


def get_all_patients_by_name(request):
    if request.method == "GET":
        try:
            collections = mongoConnect()
            if not collections:
                raise ValueError("Failed to retrieve collections from MongoDB")
            
            patient_collection, _, _, _, _ = collections

            pipeline = [
                {
                    "$group": {
                        "_id": "$name",
                        "patients": {
                            "$push": {
                                "_id": {"$toString": "$_id"}, #convert objectID to string
                                "accession_number": "$accession_number",
                                "hpo_terms": "$hpo_terms"
                            }
                        }
                    }
                },
                {
                    "$project": {
                        "_id": 0,
                        "name": "$_id",
                        "patients": 1
                    }
                }
            ]

            grouped_patients = list(patient_collection.aggregate(pipeline))

            return JsonResponse({"Patients_grouped_by_name": grouped_patients}, status=200)
        
        except Exception as e:
            return JsonResponse({"error": f"Error fetching patients: {str(e)}"}, status=500)
        

    else:
        return HttpResponse("Invalid request method. Only GET is allowed.", status=405)

def connect(request):
    if request.method == "GET":
        try:
            connection = mongoConnect()
            return HttpResponse("Successfully connected to MongoDB through Django backend, through Gateway!", status=200)
        
        except Exception as e:
            return HttpResponse({f"Could not connect to MongoDB: {str(e)}"}, status=500)
    else:
        return HttpResponse("Invalid Request Method", status=400)