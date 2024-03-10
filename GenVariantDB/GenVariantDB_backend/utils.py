from pymongo import MongoClient

def MongoConnect(DB_URL, DB, Collection):
    try:
        client = MongoClient(DB_URL)
        dbName = client[DB]
        db_handle = dbName[Collection]
        print("Successfully connected to MongoDB")
        return(db_handle)
    except Exception as e:
        print("An error has occured while attempting to connect to Mongodb: ", e)