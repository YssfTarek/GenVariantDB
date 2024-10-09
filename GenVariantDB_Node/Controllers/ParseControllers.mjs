import { getCollections } from '../config/config.mjs';
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
                        $addToSet: { patients: patientId },
                        $setOnInsert: { variantData }
                    },
                    upsert: true
                }
            });

            if (bulkOpsVariants.length === batchSize || i === variants.length - 1) {
                // Perform bulk write for variants
                const variantWriteResult = await variantCollection.bulkWrite(bulkOpsVariants);

                // Collect variant IDs from the upserted results
                const variantIds = variantWriteResult.upsertedIds.map((id, index) => {
                    return { variantKey: bulkOpsVariants[index].updateOne.filter, variantId: id };
                });

                // Prepare bulk operations for quality, info, and format collections
                const bulkOpsQuality = [];
                const bulkOpsInfo = [];
                const bulkOpsFormat = [];

                variantIds.forEach((variantData, index) => {
                    const variantId = variantData.variantId;

                    // Push quality document if present
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

                    // Push info document if present
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

                    // Push format document if present
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

                // Perform bulk writes concurrently
                await Promise.all([
                    qualityCollection.bulkWrite(bulkOpsQuality),
                    infoCollection.bulkWrite(bulkOpsInfo),
                    formatCollection.bulkWrite(bulkOpsFormat)
                ]);

                // Clear the bulk operations for the next batch
                bulkOpsVariants.length = 0;

                console.log(`Processed ${variantWriteResult.matchedCount} variants.`);
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