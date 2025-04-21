import express from 'express';
import redisClient from '../Config/redisClient.mjs';

const router = express.Router();

router.get('/metrics', async (req, res) => {
    const completed = await redisClient.get('tasks:completed') || 0;
    const failed = await redisClient.get('tasks:failed') || 0;

    res.json({
        completed: parseInt(completed, 10),
        failed: parseInt(failed, 10),
    });
});

export default router;
