import { MongoClient } from 'mongodb';
import dotenv from 'dotenv';

dotenv.config();

const mongoURL = process.env.DB_URL;
const dbName = process.env.DB;
const pool = process.env.POOL_SIZE;

let db, patientCollection, variantCollection, qualityCollection, infoCollection, formatCollection;

let client;

const connectToMongoDB = async () => {
    if (client) return;

    try {
        if (!client) {
            client = new MongoClient(mongoURL, {
                maxPoolSize:pool,
            });
            await client.connect();
            db = client.db(dbName);
            patientCollection = db.collection('patients');
            variantCollection = db.collection('variants');
            qualityCollection = db.collection('qualities');
            infoCollection = db.collection('infos');
            formatCollection = db.collection('formats');
            console.log(`Connected to MongoDB with ${pool} connections`);
        }
    } catch (err) {
        console.log('Failed to connect to MongoDB:', err);
    }
};

const getCollections = () => {
    if (!db){
        throw new Error ('Database not connected. Call connectToMongoDB() first!');
    }
    
    return {
        patientCollection,
        variantCollection,
        qualityCollection,
        infoCollection,
        formatCollection
    };
};

export { connectToMongoDB, getCollections };
