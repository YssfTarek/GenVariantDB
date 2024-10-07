import dotenv from 'dotenv';
import express from 'express';
import cors from 'cors';
import { MongoClient, ServerApiVersion } from 'mongodb';
import connect from './Routes/ParseRoutes.mjs';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

const uri = process.env.DB_URL;
const dbName = process.env.DB;

const client = new MongoClient(uri, {
    serverApi: {
        version: ServerApiVersion.v1,
        strict: true,
        deprecationErrors:true
    },
});

app.use(express.json());
app.use(cors());

app.use((req, res, next) => {
    console.log(req.path, req.method);
    next();
});

app.use('/api', connect);

try {
    await client.connect();
    await client.db(dbName).command({ping: 1});
    console.log(
        "Pinged your deployment. You successfully connected to MongoDB!"
    );
} catch(err) {
    console.error(err);
}

app.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
});
