import { getCollections } from '../Config/config.mjs';
import dotenv from 'dotenv';

dotenv.config();

const connect = async (req, res) => {
    res.status(200).send('You are connected to your parse (node) backend, through the gateway!');
};

const addPatient = async (req, res) => {
    const { patient, variants, qual, info, format } = req.body;
    const { patientCollection, variantCollection, qualityCollection, infoCollection, formatCollection } = getCollections();

    try {
        let existingPatient = await patientCollection.findOne({
            patient_name: patient.patient_name,
            accession_number: patient.accession_number
        });

        let patientId;

        if (!existingPatient) {
            const result = await patientCollection.insertOne(patient);
            patientId = result.insertedId;
        } else {
            patientId = existingPatient._id;
            return res.status(400).json({ error: "Patient already exists" });
        }

        const bulkOpsVariants = [];
        const batchSize = Number(process.env.BATCH_SIZE) || 500;

        console.log(`Total variants to process: ${variants.length}`);
        
        for (let i = 0; i < variants.length; i++) {
            const variantData = variants[i];
            const variantKey = {
                '#CHROM': variantData['#CHROM'],
                'POS': variantData['POS'],
                'REF': variantData['REF'],
                'ALT': variantData['ALT']
            };

            bulkOpsVariants.push({
                updateOne: {
                    filter: variantKey,
                    update: {
                        $addToSet: { patients: patientId }
                    },
                    upsert: true
                }
            });

            // Log each time we reach a batch size or end of variants
            if (bulkOpsVariants.length === batchSize || i === variants.length - 1) {
                console.log(`Processing batch with ${bulkOpsVariants.length} variants...`);

                // Perform bulk write for variants
                const variantWriteResult = await variantCollection.bulkWrite(bulkOpsVariants);
                console.log(`Processed ${variantWriteResult.matchedCount} variants. Upserted IDs: ${JSON.stringify(variantWriteResult.upsertedIds)}`);

                const variantIds = variantWriteResult.upsertedIds
                    ? Object.entries(variantWriteResult.upsertedIds).map(([_, id]) => id)
                    : [];  // Default to an empty array if undefined

                // Prepare bulk operations for quality, info, and format collections
                const bulkOpsQuality = [];
                const bulkOpsInfo = [];
                const bulkOpsFormat = [];

                variantIds.forEach((variantId, index) => {
                    console.log(`Processing variantId: ${variantId}, index: ${index}`);

                    if (qual[index]) {
                        bulkOpsQuality.push({
                            insertOne: {
                                document: {
                                    qual: qual[index].QUAL,
                                    filter: qual[index].FILTER,
                                    variant_id: variantId,
                                    patient_id: patientId
                                }
                            }
                        });
                    }

                    if (info[index]) {
                        bulkOpsInfo.push({
                            insertOne: {
                                document: {
                                    info: info[index],
                                    variant_id: variantId,
                                    patient_id: patientId
                                }
                            }
                        });
                    }

                    if (format[index]) {
                        bulkOpsFormat.push({
                            insertOne: {
                                document: {
                                    format: format[index],
                                    variant_id: variantId,
                                    patient_id: patientId
                                }
                            }
                        });
                    }
                });

                // Perform bulk writes only if there are operations to execute
                const bulkWritePromises = [];

                if (bulkOpsQuality.length > 0) {
                    bulkWritePromises.push(qualityCollection.bulkWrite(bulkOpsQuality));
                }

                if (bulkOpsInfo.length > 0) {
                    bulkWritePromises.push(infoCollection.bulkWrite(bulkOpsInfo));
                }

                if (bulkOpsFormat.length > 0) {
                    bulkWritePromises.push(formatCollection.bulkWrite(bulkOpsFormat));
                }

                // Execute bulk writes concurrently
                try {
                    await Promise.all(bulkWritePromises);
                } catch (bulkWriteError) {
                    console.error('Bulk Write Error:', bulkWriteError);
                    return res.status(500).json({ error: "Failed to write quality, info, or format data." });
                }

                // Clear the bulk operations for the next batch
                bulkOpsVariants.length = 0;

                console.log(`Finished processing batch of variants. Total processed so far: ${i + 1}`);
            }
        }

        res.status(201).json({ message: 'Data uploaded successfully.' });

    } catch (error) {
        console.error('Error:', error);
        if (error.writeErrors) {
            console.error('Write Errors:', error.writeErrors);
        }
        res.status(500).json({ error: "Internal server error" });
    }
};

export { connect, addPatient };