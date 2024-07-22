from django.views.decorators.csrf import csrf_exempt
#from django.shortcuts import render
from django.http import HttpResponse, JsonResponse
import os
from dotenv import load_dotenv
from .utils import MongoConnect
import pandas as pd
import json
from .vcf_tojson import vcf_to_json
from .makeManifest import makeManifest
from datetime import datetime

load_dotenv()

DB_URL = os.getenv("DB_URL")
DB = os.getenv("DB")
collection = os.getenv("Collection")

# Create your views here.

def get_var_stats(request):
    db_handle = MongoConnect(DB_URL, DB, collection)

    pipeline = [
        {
            '$project': {
                'synonymous': {
                    '$size': {
                        '$filter': {
                            'input': '$variants.INFO', 
                            'as': 'info', 
                            'cond': {
                                '$regexMatch': {
                                    'input': '$$info.FC', 
                                    'regex': '.*synonymous.*', 
                                    'options': 'i'
                                }
                            }
                        }
                    }
                }, 
                'missense': {
                    '$size': {
                        '$filter': {
                            'input': '$variants.INFO', 
                            'as': 'info', 
                            'cond': {
                                '$regexMatch': {
                                    'input': '$$info.FC', 
                                    'regex': '.*missense.*', 
                                    'options': 'i'
                                }
                            }
                        }
                    }
                }, 
                'nonsense': {
                    '$size': {
                        '$filter': {
                            'input': '$variants.INFO', 
                            'as': 'info', 
                            'cond': {
                                '$regexMatch': {
                                    'input': '$$info.FC', 
                                    'regex': '.*nonsense.*', 
                                    'options': 'i'
                                }
                            }
                        }
                    }
                }, 
                'insertion': {
                    '$size': {
                        '$filter': {
                            'input': '$variants.INFO', 
                            'as': 'info', 
                            'cond': {
                                '$regexMatch': {
                                    'input': '$$info.FC', 
                                    'regex': '.*insertion.*', 
                                    'options': 'i'
                                }
                            }
                        }
                    }
                }, 
                'deletion': {
                    '$size': {
                        '$filter': {
                            'input': '$variants.INFO', 
                            'as': 'info', 
                            'cond': {
                                '$regexMatch': {
                                    'input': '$$info.FC', 
                                    'regex': '.*deletion.*', 
                                    'options': 'i'
                                }
                            }
                        }
                    }
                }, 
                'silent': {
                    '$size': {
                        '$filter': {
                            'input': '$variants.INFO', 
                            'as': 'info', 
                            'cond': {
                                '$regexMatch': {
                                    'input': '$$info.FC', 
                                    'regex': '.*silent.*', 
                                    'options': 'i'
                                }
                            }
                        }
                    }
                }, 
                'frameshift': {
                    '$size': {
                        '$filter': {
                            'input': '$variants.INFO', 
                            'as': 'info', 
                            'cond': {
                                '$regexMatch': {
                                    'input': '$$info.FC', 
                                    'regex': '.*frameshift.*', 
                                    'options': 'i'
                                }
                            }
                        }
                    }
                }
            }
        }, {
            '$group': {
                '_id': None, 
                'totalSynonymous': {
                    '$sum': '$synonymous'
                }, 
                'totalMissense': {
                    '$sum': '$missense'
                }, 
                'totalNonsense': {
                    '$sum': '$nonsense'
                }, 
                'totalInsertion': {
                    '$sum': '$insertion'
                }, 
                'totalDeletion': {
                    '$sum': '$deletion'
                }, 
                'totalSilent': {
                    '$sum': '$silent'
                }, 
                'totalFrameshift': {
                    '$sum': '$frameshift'
                }
            }
        }
    ]
    
    if request.method == "GET":
        var_stats = list(db_handle.aggregate(pipeline))
        response = JsonResponse(var_stats, status = 200, safe=False)
        response["Access-Control-Allow-Origin"] = "http://localhost:3000"
        response["Access-Control-Allow-Headers"] = "Content-Type"
        response["Access-Control-Allow-Methods"] = "GET, POST, PUT, DELETE, OPTIONS"
        return response
    else:
        return HttpResponse("Invalid request", status = 400)


def getDocCount(request):
    db_handle = MongoConnect(DB_URL, DB, collection)
    
    if request.method == "GET":
        doc_count = db_handle.count_documents({})
        response = JsonResponse({"total_documents": doc_count}, status=200)
        response["Access-Control-Allow-Origin"] = "http://localhost:3000"
        response["Access-Control-Allow-Headers"] = "Content-Type"
        response["Access-Control-Allow-Methods"] = "GET, POST, PUT, DELETE, OPTIONS"
        return response
    else:
        return HttpResponse("Invalid request", status=400)

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
            dt = datetime.now()
            data["Timestamp"] = dt
            db_handle = MongoConnect(DB_URL, DB, collection)
            db_handle.insert_one(data)

        return HttpResponse("Data has been submitted and saved", status=201)
    
    else:
        return HttpResponse("Invalid request", status=400)


def connect(request):
    db_handle = MongoConnect(DB_URL, DB, collection)

    if request.method == "GET":
        return HttpResponse("Successfully connected to Mongodb", status=200)
    else:
        return HttpResponse("Invalid Request", status=400)