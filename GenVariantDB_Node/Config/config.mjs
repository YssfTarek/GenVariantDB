import { MongoClient } from 'mongodb';
import dotenv from 'dotenv';

dotenv.config();

const mongoURL = process.env.DB_URL;
const dbName = process.env.DB;

let db, patientCollection, variantCollection, qualityCollection, infoCollection, formatCollection;

const connectToMongoDB = async () => {
    try {
        const client = await MongoClient.connect(mongoURL);
        db = client.db(dbName);
        patientCollection = db.collection('patients');
        variantCollection = db.collection('variants');
        qualityCollection = db.collection('qualities');
        infoCollection = db.collection('infos');
        formatCollection = db.collection('formats');
        console.log('Connected to MongoDB');
    } catch (err) {
        console.error('Failed to connect to MongoDB:', err);
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
