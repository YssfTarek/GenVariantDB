import redisClient from '../Config/redisClient.mjs';
import { getCollections } from '../Config/config.mjs';

const incrementCounter = async (key) => {
    await redisClient.incr(key);
};

// Update counters based on task status
const updateMetrics = async (taskId, status) => {
    if (status === 'completed') {
        await incrementCounter('tasks:completed');
    } else if (status === 'failed') {
        await incrementCounter('tasks:failed');
    }
};

const updateTaskStatus = async (taskId, status, details = {}) => {
    await redisClient.hSet(`task_status:${taskId}`, {
        status,
        ...details,
        updated_at: new Date().toISOString(),
    });
};

// Retry failed tasks by requeuing them
const retryTask = async (task) => {
    console.log(`Retrying task: ${task.task_id}`);
    await redisClient.rPush('vcf_tasks', JSON.stringify(task));
};

const processTask = async (task) => {
    const { variantCollection, qualityCollection, infoCollection, formatCollection } = getCollections();
    const { task_id, patient_id, chunk } = JSON.parse(task);

    try {
        console.log(`Processing task: ${task_id}`);
        await updateTaskStatus(task_id, 'in-progress');

        const bulkOpsVariants = [];
        const bulkOpsQuality = [];
        const bulkOpsInfo = [];
        const bulkOpsFormat = [];

        for (const entry of chunk) {
            const { variant, qual, info, format } = entry;

            bulkOpsVariants.push({
                insertOne: {
                    document: {
                        ...variant,
                        patients: [patient_id],
                    },
                },
            });

            bulkOpsQuality.push({
                insertOne: {
                    document: {
                        ...qual,
                        variant_id: null,
                        patient_id,
                    },
                },
            });

            bulkOpsInfo.push({
                insertOne: {
                    document: {
                        ...info,
                        variant_id: null,
                        patient_id,
                    },
                },
            });

            bulkOpsFormat.push({
                insertOne: {
                    document: {
                        ...format,
                        variant_id: null,
                        patient_id,
                    },
                },
            });
        }

        // Execute bulk writes
        await variantCollection.bulkWrite(bulkOpsVariants, { ordered: false });
        await qualityCollection.bulkWrite(bulkOpsQuality, { ordered: false });
        await infoCollection.bulkWrite(bulkOpsInfo, { ordered: false });
        await formatCollection.bulkWrite(bulkOpsFormat, { ordered: false });

        console.log(`Task ${task_id} processed successfully.`);
        await updateTaskStatus(task_id, 'completed')
        await updateMetrics(task_id, 'completed')
    } catch (error) {
        console.error(`Error processing task ${task_id}:`, error);
        await updateTaskStatus(task_id, 'failed', { error: error.message });
        await updateMetrics(task_id, 'failed');
        await retryTask(JSON.parse(task)); // Requeue the failed task
    }
};

const listenForTasks = async () => {
    const subscriber = redisClient.duplicate(); // Use a duplicate client for Pub/Sub
    await subscriber.connect();

    subscriber.subscribe("tasks_ready_channel", async (message) => {
        console.log("Received Pub/Sub notification:", message);
        await consumeTasks(); // Start consuming tasks when notified
    });

    console.log("Subscribed to tasks_ready_channel for notifications.");
};

const consumeTasks = async () => {
    while (true) {
        try {
            // Blocking pop to fetch tasks
            const task = await redisClient.lPop('vcf_tasks');
            if (task) {
                await processTask(task);
            } else {
                console.log('No tasks in queue. Waiting...');
                await new Promise((resolve) => setTimeout(resolve, 1000));
            }
        } catch (error) {
            console.error('Error consuming tasks:', error);
        }
    }
};

export { listenForTasks };