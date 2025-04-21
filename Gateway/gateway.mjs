import express from 'express';
import { createProxyMiddleware } from 'http-proxy-middleware';
import cors from 'cors';

const app = express();

app.use(cors());

app.use('/node-api', createProxyMiddleware({
    target:'http://localhost:3000',
    changeOrigin: true,
    pathRewrite: {
        '^/node-api': '',
    },
}));

app.use('/django-api', createProxyMiddleware({
    target:'http://127.0.0.1:8000',
    changeOrigin: true,
    pathRewrite: {
        '^/django-api': '',
    },
}));

app.use((err, req, res, next) => {
    console.error('Error occured:', err);
    res.status(500).json({message: "An internal error occured."});
});

const PORT = process.env.PORT || 6000;

app.listen(PORT, () => {
    console.log(`API Gateway running on port ${PORT}`)
});