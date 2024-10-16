import { ObjectId } from 'mongodb';
import { getCollections } from '../Config/config.mjs';
import dotenv from 'dotenv';

dotenv.config();

const connect = async (req, res) => {
    
    const { patientCollection, variantCollection, qualityCollection, infoCollection, formatCollection, client } = getCollections();
    if (patientCollection, variantCollection, qualityCollection, infoCollection, formatCollection, client){
        res.status(200).send('You are connected to MongoDB through your Nodejs backend!');
    } else {
        res.status(500).send('No connections were made to Mongodb')
    }
};

const addPatient = async (req, res) => {
    const { patient } = req.body;

    if (!patient) {
        return res.status(400).json({ error: 'Missing patient data.' });
    }

    const { patientCollection } = getCollections();

    try {
        // Check if patient already exists
        const existingPatient = await patientCollection.findOne({
            patient_name: patient.patient_name,
            accession_number: patient.accession_number
        });

        if (existingPatient) {
            return res.status(400).json({ error: "Patient already exists", patient_id: existingPatient._id });
        }

        // Insert new patient
        const result = await patientCollection.insertOne(patient);
        const patientId = result.insertedId;
        console.log(`Inserted new patient with ID: ${patientId}`);
        res.status(201).json({ message: 'Patient successfully added', patient_id: patientId });

    } catch (error) {
        console.error('Error during patient insertion:', error);
        res.status(500).json({ error: 'Error inserting patient into MongoDB.' });
    }
};


const addVariants = async (req, res) => {
    const { patient_id, data } = req.body;

    if (!patient_id || !data) {
        return res.status(400).json({ error: 'Missing patient ID or variant data.' });
    }

    const patientId = new ObjectId(patient_id)

    const { variantCollection, qualityCollection, infoCollection, formatCollection, client } = getCollections();
    
    const session = client.startSession(); // Start a session for transactions

    try {
        await session.withTransaction(async () => {
            const bulkOpsVariants = [];
            const bulkOpsQuality = [];
            const bulkOpsInfo = [];
            const bulkOpsFormat = [];

            // Prepare to find existing variants
            const variantKeys = data.map(entry => ({
                '#CHROM': entry.variant['#CHROM'],
                'POS': entry.variant['POS'],
                'REF': entry.variant['REF'],
                'ALT': entry.variant['ALT']
            }));

            // Check for existing variants
            const existingVariants = await variantCollection.find({
                $or: variantKeys
            }).toArray();

            const existingVariantMap = {};
            existingVariants.forEach(variant => {
                const key = `${variant['#CHROM']}_${variant['POS']}_${variant['REF']}_${variant['ALT']}`;
                existingVariantMap[key] = variant;
            });

            // Iterate through data and handle both new and existing variants
            for (const entry of data) {
                const { variant, qual, info, format } = entry;
                const variantKey = `${variant['#CHROM']}_${variant['POS']}_${variant['REF']}_${variant['ALT']}`;
                let variantId;

                if (existingVariantMap[variantKey]) {
                    variantId = existingVariantMap[variantKey]._id;

                    // Update the variant to add the patient ID if it doesn't already exist
                    bulkOpsVariants.push({
                        updateOne: {
                            filter: { _id: variantId },
                            update: { $addToSet: { patients: patientId } },
                            upsert: false
                        }
                    });
                } else {
                    // Insert new variant and capture its ID
                    bulkOpsVariants.push({
                        insertOne: {
                            document: {
                                ...variant,
                                patients: [patientId] // Include the patient ID in the new variant
                            }
                        }
                    });
                }

                // Always insert quality, info, and format entries
                bulkOpsQuality.push({
                    insertOne: {
                        document: {
                            variant_id: variantId || null,  // Will be filled after variant insertion
                            patient_id: patientId,
                            ...qual
                        }
                    }
                });

                bulkOpsInfo.push({
                    insertOne: {
                        document: {
                            variant_id: variantId || null,  // Will be filled after variant insertion
                            patient_id: patientId,
                            ...info
                        }
                    }
                });

                bulkOpsFormat.push({
                    insertOne: {
                        document: {
                            variant_id: variantId || null,  // Will be filled after variant insertion
                            patient_id: patientId,
                            ...format
                        }
                    }
                });
            }

            // Execute bulk operations within the transaction
            if (bulkOpsVariants.length > 0) {
                const variantWriteResult = await variantCollection.bulkWrite(bulkOpsVariants, { session });
                // Map variant IDs for newly inserted variants
                const insertedVariantIds = variantWriteResult.insertedIds;
                
                // Assign variant IDs to quality, info, format if variant was newly inserted
                bulkOpsQuality.forEach((op, idx) => {
                    if (!op.insertOne.document.variant_id) {
                        op.insertOne.document.variant_id = insertedVariantIds[idx];
                    }
                });
                bulkOpsInfo.forEach((op, idx) => {
                    if (!op.insertOne.document.variant_id) {
                        op.insertOne.document.variant_id = insertedVariantIds[idx];
                    }
                });
                bulkOpsFormat.forEach((op, idx) => {
                    if (!op.insertOne.document.variant_id) {
                        op.insertOne.document.variant_id = insertedVariantIds[idx];
                    }
                });
            }

            if (bulkOpsQuality.length > 0) {
                await qualityCollection.bulkWrite(bulkOpsQuality, { session });
            }

            if (bulkOpsInfo.length > 0) {
                await infoCollection.bulkWrite(bulkOpsInfo, { session });
            }

            if (bulkOpsFormat.length > 0) {
                await formatCollection.bulkWrite(bulkOpsFormat, { session });
            }

            console.log('Batch of data successfully uploaded.');
            res.status(201).json({ message: 'Batch of data successfully uploaded.' });

        }); // End of transaction

    } catch (error) {
        console.error('Error during insertion:', error);
        res.status(500).json({ error: 'Error inserting data into MongoDB.' });
    } finally {
        session.endSession(); // End the session
    }
};

export { connect, addPatient, addVariants };