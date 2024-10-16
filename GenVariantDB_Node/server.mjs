import dotenv from 'dotenv';
import express from 'express';
import cors from 'cors';
import parseRoutes from './Routes/ParseRoutes.mjs';
import { connectToMongoDB, gracefulShutdown } from './Config/config.mjs';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json({ limit: '1gb' }));
app.use(express.urlencoded({ limit: '1gb', extended: true}));

app.use(cors());

const startServer = async () => {
    await connectToMongoDB(); // Ensure the database connection is established

    app.use((req, res, next) => {
        console.log(req.path, req.method);
        next();
    });

    app.use('/api', parseRoutes);

    const server = app.listen(PORT, () => {
        console.log(`Server is running on http://localhost:${PORT}`);
        process.send('ready');
    });
    

    const shutdown = async() => {
        console.log('Received SIGINT. Shutting down gracefully...');
        await gracefulShutdown();
        server.close(() => {
            console.log('HTTP server closed.');
            process.exit(0);
        });
    };

    process.on('SIGINT', shutdown);
    process.on('SIGTERM', shutdown);
};

startServer().catch(err => {
    console.error('Error starting server:', err);
});