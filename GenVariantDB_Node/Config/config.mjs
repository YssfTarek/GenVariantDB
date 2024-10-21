import { MongoClient } from 'mongodb';
import dotenv from 'dotenv';

dotenv.config();

const mongoURL = process.env.DB_URL;
const dbName = process.env.DB;
const pool = parseInt(process.env.POOL_SIZE) || 1

let db, patientCollection, variantCollection, qualityCollection, infoCollection, formatCollection;
let client;
let currentSession = null;

const connectToMongoDB = async () => {
    if (client) return;

    try {
        client = new MongoClient(mongoURL, {
            maxPoolSize:pool,
            serverSelectionTimeoutMS: 30000
        });
        await client.connect()
        console.log(`Connected to MongoDB with ${pool} connections`);
        db = client.db(dbName);
        patientCollection = db.collection('patients');
        variantCollection = db.collection('variants');
        qualityCollection = db.collection('qualities');
        infoCollection = db.collection('infos');
        formatCollection = db.collection('formats');
    } catch (err) {
        console.error('Failed to connect to MongoDB:', err.message);
        if (retries > 0) {
            setTimeout(() => connectToMongoDB(retries - 1), 5000);
        }
    }

    return db
};

const getCollections = () => {
    if (!client || !db){
        throw new Error ('Database not connected. Call connectToMongoDB() first!');
    }
    
    return {
        patientCollection,
        variantCollection,
        qualityCollection,
        infoCollection,
        formatCollection,
        client
    };
};

const startSession = async () => {
    await connectToMongoDB();

    if (!currentSession) {
        currentSession = client.startSession
    }

    return currentSession
};

const endSession = async() => {
    if (currentSession) {
        await currentSession.endSession();
        currentSession = null;
    }
};

const gracefulShutdown = async () => {
    try {
        console.log('Closing MongoDB connection...');
        await client.close();
        console.log('MongoDB connection closed.');
    } catch (error) {
        console.error('Error closing MongoDB connection:', err.message);
    } finally {
        process.exit(0); // Exit the process
    }
};

export { connectToMongoDB, getCollections, gracefulShutdown, startSession, endSession };
