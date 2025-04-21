import { getCollections } from '../Config/config.mjs';

// Use patientId to gather variants in chunks
const gatherChunks = async (patientId) => {
    const { variantCollection, ops_meta } = getCollections();

    try {
        console.log('Gathering relevant variants...');
        const startTime = Date.now();

        const chunkSize = 1000;
        const totalDocuments = await variantCollection.countDocuments();

        for (let skipCount = 0; skipCount < totalDocuments; skipCount += chunkSize) {
            // Search for variants matching patientId
            const variants = await variantCollection.find({ patients: patientId })
                .skip(skipCount)
                .limit(chunkSize)
                .toArray();

            if (variants.length === 0) {
                break; // No more variants to process
            }

            const bulkOps = [{
                insertOne: {
                    document: {
                        patient_id: patientId,
                        status: "pending",
                        processedBy: null,
                        varIds: variants.map(variant => variant._id),
                        createdAt: new Date(),
                        startedAt: null,
                        completedAt: null,
                    }
                }
            }];

            await ops_meta.bulkWrite(bulkOps);
            const endTime = Date.now();
            console.log(`Gathered and chunked ${variants.length} variants in ${endTime - startTime} ms.`);
        }
    } catch (error) {
        console.error('Error creating chunks:', error);
    }
};

const assignJob = async() => {
    const { ops_meta } = getCollections();

    try {
        const job = await ops_meta.findOneAndUpdate(
            { status: "pending" },
            { $set: { status: "processing", startedAt: new Date() } },
            { returnDocument: 'after' }
        );

        if (job) {
            console.log(`Instance ${process.pid} assigned job: ${job._id}`);
            await processJob(job._id);
        } else {
            console.log(`No available jobs for instance ${instanceId}`);
        }
    } catch (error) {
        console.error('Error assigning Job:', error);
    };
};

const processJob = async(jobId) => {
    const { ops_meta } = getCollections();


    console.log('Processing job');

    try {
        await ops_meta.updateOne(
            { _id: jobId },
            { $set: {status: "processed", completedAt: new Date(), processedBy: process.pid } }
        );
    } catch(error) {
        console.error("Error processing job:", error);
        await ops_meta.updateOne(
            { _id: jobId },
            { $set: {status: "failed", processedBy: process.pid } }
        );
    }
}

// Delete variants, info, qual, format

const pollForJobs = () => {
    setInterval(assignJob, 10000);
}

export { gatherChunks, pollForJobs }