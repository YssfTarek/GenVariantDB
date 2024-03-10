from django.shortcuts import render
from django.http import JsonResponse
import os
from dotenv import load_dotenv
from .utils import MongoConnect

load_dotenv()

DB_URL = os.getenv("DB_URL")
DB = os.getenv("DB")
collection = os.getenv("Collection")

# Create your views here.

def connect(request):
    db_handle = MongoConnect(DB_URL, DB, collection)

    if request.method == "GET":
        return JsonResponse({"message":"Hello, you are connected to Mongodb."})
    else:
        return JsonResponse({"message":"Invalid request."})