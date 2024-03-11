from django.shortcuts import render
from django.http import HttpResponse
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
        return HttpResponse("Successfully connected to Mongodb", status=200)
    else:
        return HttpResponse("Invalid Request", status=400)