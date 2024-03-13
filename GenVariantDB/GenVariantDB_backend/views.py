from django.views.decorators.csrf import csrf_exempt
from django.shortcuts import render
from django.http import HttpResponse, JsonResponse
import os
from dotenv import load_dotenv
from .utils import MongoConnect
import pandas as pd
import json
from .vcf_tojson import vcf_to_json
from .makeManifest import makeManifest

load_dotenv()

DB_URL = os.getenv("DB_URL")
DB = os.getenv("DB")
collection = os.getenv("Collection")

# Create your views here.

@csrf_exempt
def writeManifest(request):
    if request.method == "POST":
        path_unicode  = request.body.decode("UTF-8")
        path_data = json.loads(path_unicode)
        path = path_data["path"]

        manifest = makeManifest(path)

        for i in range(len(manifest)):
            item = manifest[i]
            print("You will now process file: ",i)
            data = json.loads(vcf_to_json(item))
            db_handle = MongoConnect(DB_URL, DB, collection)
            db_handle.insert_one(data)

        return HttpResponse("Data has been submitted and saved", status=201)
    
    else:
        return HttpResponse("Invalid request", status=400)


def write(request):
    if request.method == "POST":
        file = request.FILES["file"]
        df = pd.read_csv(file, header=None)
        manifest = df.squeeze()
        
        for i in range(len(manifest)):
            item = manifest[i]
            print("You will now process file: ",i)
            data = json.loads(vcf_to_json(item))
            db_handle = MongoConnect(DB_URL, DB, collection)
            db_handle.insert_one(data)

        return HttpResponse("Successfully uploaded samples to MongoDB", status=201)
    else:
        return HttpResponse("Invalid request", status=400)

def connect(request):
    db_handle = MongoConnect(DB_URL, DB, collection)

    if request.method == "GET":
        return HttpResponse("Successfully connected to Mongodb", status=200)
    else:
        return HttpResponse("Invalid Request", status=400)