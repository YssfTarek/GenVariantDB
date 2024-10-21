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

            const variantKeys = data.map(entry => ({
                '#CHROM': entry.variant['#CHROM'],
                'POS': entry.variant['POS'],
                'REF': entry.variant['REF'],
                'ALT': entry.variant['ALT']
            }));

            console.log('Finding existing variants...');
            const existingVariants = await variantCollection.find({
                $or: variantKeys
            }).toArray();

            const existingVariantMap = {};
            existingVariants.forEach(variant => {
                const key = `${variant['#CHROM']}_${variant['POS']}_${variant['REF']}_${variant['ALT']}`;
                existingVariantMap[key] = variant;
            });

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

                bulkOpsQuality.push({
                    insertOne: {
                        document: {
                            variant_id: variantId || null,  // To be updated later for new variants
                            patient_id: patientId,
                            ...qual
                        }
                    }
                });

                bulkOpsInfo.push({
                    insertOne: {
                        document: {
                            variant_id: variantId || null,  // To be updated later for new variants
                            patient_id: patientId,
                            ...info
                        }
                    }
                });

                bulkOpsFormat.push({
                    insertOne: {
                        document: {
                            variant_id: variantId || null,  // To be updated later for new variants
                            patient_id: patientId,
                            ...format
                        }
                    }
                });
            }

            const variantWriteResult = await variantCollection.bulkWrite(bulkOpsVariants, { session });
            const insertedVariantIds = variantWriteResult.insertedIds;

            bulkOpsQuality.forEach((op, idx) => {
                if (!op.insertOne.document.variant_id && insertedVariantIds[idx]) {
                    op.insertOne.document.variant_id = insertedVariantIds[idx];
                }
            });
            bulkOpsInfo.forEach((op, idx) => {
                if (!op.insertOne.document.variant_id && insertedVariantIds[idx]) {
                    op.insertOne.document.variant_id = insertedVariantIds[idx];
                }
            });
            bulkOpsFormat.forEach((op, idx) => {
                if (!op.insertOne.document.variant_id && insertedVariantIds[idx]) {
                    op.insertOne.document.variant_id = insertedVariantIds[idx];
                }
            });

            await qualityCollection.bulkWrite(bulkOpsQuality, { session });
            await infoCollection.bulkWrite(bulkOpsInfo, { session });
            await formatCollection.bulkWrite(bulkOpsFormat, { session });

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