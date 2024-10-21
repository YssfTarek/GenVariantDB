import { ObjectId } from 'mongodb';
import { getCollections } from '../Config/config.mjs';
import dotenv from 'dotenv';

dotenv.config();

const connect = async (req, res) => {
    const { patientCollection, variantCollection, qualityCollection, infoCollection, formatCollection, client } = getCollections();
    if (patientCollection && variantCollection && qualityCollection && infoCollection && formatCollection && client) {
        res.status(200).send('You are connected to MongoDB through your Node.js backend!');
    } else {
        res.status(500).send('No connections were made to MongoDB');
    }
};

const isValidVariant = (entry) => {
    // Implement validation logic for each variant entry
    return entry.variant && entry.qual && entry.info && entry.format;
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

    if (!data.every(isValidVariant)) {
        return res.status(400).json({ error: 'Invalid variant data structure.' });
    }

    const patientId = new ObjectId(patient_id);
    const { variantCollection, qualityCollection, infoCollection, formatCollection } = getCollections();
    const session = req.session;

    try {
        await session.withTransaction(async () => {
            const bulkOpsVariants = [];
            const bulkOpsQuality = [];
            const bulkOpsInfo = [];
            const bulkOpsFormat = [];

            // Build an array of variant keys
            const variantKeys = data.map(entry => [
                entry.variant['#CHROM'],
                entry.variant['POS'],
                entry.variant['REF'],
                entry.variant['ALT']
            ]);

            // Find existing variants in one go
            console.log('Finding existing variants...');
            const existingVariants = await variantCollection.find({
                '$or': variantKeys.map(key => ({
                    '#CHROM': key[0],
                    'POS': key[1],
                    'REF': key[2],
                    'ALT': key[3]
                }))
            }).toArray();

            const existingVariantMap = Object.fromEntries(existingVariants.map(variant => [
                `${variant['#CHROM']}_${variant['POS']}_${variant['REF']}_${variant['ALT']}`,
                variant
            ]));

            for (const entry of data) {
                const { variant, qual, info, format } = entry;
                const variantKey = `${variant['#CHROM']}_${variant['POS']}_${variant['REF']}_${variant['ALT']}`;
                let variantId;

                if (existingVariantMap[variantKey]) {
                    variantId = existingVariantMap[variantKey]._id;
                    bulkOpsVariants.push({
                        updateOne: {
                            filter: { _id: variantId },
                            update: { $addToSet: { patients: patientId } },
                            upsert: false
                        }
                    });
                } else {
                    bulkOpsVariants.push({
                        insertOne: {
                            document: {
                                ...variant,
                                patients: [patientId]
                            }
                        }
                    });
                }

                // Prepare bulk operations for quality, info, and format
                const sharedDocument = {
                    variant_id: variantId || null,
                    patient_id: patientId,
                };

                bulkOpsQuality.push({
                    insertOne: {
                        document: {
                            ...sharedDocument,
                            ...qual
                        }
                    }
                });

                bulkOpsInfo.push({
                    insertOne: {
                        document: {
                            ...sharedDocument,
                            ...info
                        }
                    }
                });

                bulkOpsFormat.push({
                    insertOne: {
                        document: {
                            ...sharedDocument,
                            ...format
                        }
                    }
                });
            }

            // Execute the bulk operations for variants
            const variantWriteResult = await variantCollection.bulkWrite(bulkOpsVariants, { session });
            const insertedVariantIds = variantWriteResult.insertedIds;

            // Update variant_id for new variants
            const updateOps = (ops, ids) => {
                ops.forEach((op, idx) => {
                    if (!op.insertOne.document.variant_id && ids[idx]) {
                        op.insertOne.document.variant_id = ids[idx];
                    }
                });
            };

            updateOps(bulkOpsQuality, insertedVariantIds);
            updateOps(bulkOpsInfo, insertedVariantIds);
            updateOps(bulkOpsFormat, insertedVariantIds);

            // Perform concurrent writes to collections
            await Promise.all([
                qualityCollection.bulkWrite(bulkOpsQuality, { session }),
                infoCollection.bulkWrite(bulkOpsInfo, { session }),
                formatCollection.bulkWrite(bulkOpsFormat, { session }),
            ]);

            res.status(201).json({ message: 'Batch of data successfully uploaded.' });
        });
    } catch (error) {
        console.error('Error during insertion:', error);
        res.status(500).json({ error: 'Error inserting data into MongoDB.' });
    } finally {
        session.endSession();
    }
};

export { connect, addPatient, addVariants };