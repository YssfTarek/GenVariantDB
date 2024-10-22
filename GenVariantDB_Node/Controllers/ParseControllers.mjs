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

            // Start timing for finding existing variants
            console.log('Finding existing variants...');
            const startFindTime = Date.now();

            // Build composite keys for variants
            const variantKeys = data.map(entry => `${entry.variant['#CHROM']}_${entry.variant['POS']}_${entry.variant['REF']}_${entry.variant['ALT']}`);

            // Find existing variants using composite keys
            const existingVariants = await variantCollection.find({
                variantKey: { $in: variantKeys }
            }).toArray();

            const endFindTime = Date.now();
            console.log(`Found existing variants in ${(endFindTime - startFindTime) / 1000} seconds.`);

            // Create a map of existing variants by their composite key
            const existingVariantMap = Object.fromEntries(existingVariants.map(variant => [
                variant.variantKey, variant
            ]));

            // Start timing for preparing bulk operations
            console.log('Preparing bulk operations...');
            const startPrepTime = Date.now();

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
                                variantKey, // Add composite key for new variants
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

            const endPrepTime = Date.now();
            console.log(`Prepared bulk operations in ${(endPrepTime - startPrepTime) / 1000} seconds.`);

            // Start timing for executing bulk operations
            console.log('Executing bulk operations for variants...');
            const startExecTime = Date.now();

            // Execute the bulk operations for variants
            const variantWriteResult = await variantCollection.bulkWrite(bulkOpsVariants, { session, ordered: false });
            const insertedVariantIds = variantWriteResult.insertedIds;

            const endExecTime = Date.now();
            console.log(`Executed bulk operations for variants in ${(endExecTime - startExecTime) / 1000} seconds.`);

            // Start timing for updating variant_id and performing writes to quality, info, and format collections
            console.log('Updating variant_id and executing concurrent writes...');
            const startUpdateTime = Date.now();

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

            // Perform concurrent writes to collections with unordered bulk writes
            const qualityWriteResult = await qualityCollection.bulkWrite(bulkOpsQuality, { ordered: false, session });
            const infoWriteResult = await infoCollection.bulkWrite(bulkOpsInfo, { ordered: false, session });
            const formatWriteResult = await formatCollection.bulkWrite(bulkOpsFormat, { ordered: false, session });

            // Check for errors in the write results
            if (qualityWriteResult.hasWriteErrors() || infoWriteResult.hasWriteErrors() || formatWriteResult.hasWriteErrors()) {
                throw new Error('One or more writes failed. Rolling back the transaction.');
            }

            const endUpdateTime = Date.now();
            console.log(`Updated variant_id and executed concurrent writes in ${(endUpdateTime - startUpdateTime) / 1000} seconds.`);

            res.status(201).json({ message: 'Batch of data successfully uploaded.' });
        });
    } catch (error) {
        console.error('Error during insertion:', error);
        res.status(500).json({ error: 'Error inserting data into MongoDB. Transaction rolled back.' });
    } finally {
        session.endSession();
    }
};

const deletePatient = async(req, res) => {
    
    const { patient_id } = req.params;

    if (!patient_id) {
        return res.status(400).json({ error: 'Missing patient ID.' });
    }

    const patientId = new ObjectId(patient_id);

    const { patientCollection, variantCollection, qualityCollection, infoCollection, formatCollection } = getCollections();
    const session = req.session;


    try {
        await session.withTransaction(async() => {

            console.log("Deleting related records...");
            const startDeleteTime = Date.now();

            const bulkOpsQuality = [
                {
                    deleteMany: {
                        filter: {patient_id: patientId}
                    }
                }
            ];
            const bulkOpsInfo = [
                {
                    deleteMany: {
                        filter: {patient_id: patientId}
                    }
                }
            ];
            const bulkOpsFormat = [
                {
                    deleteMany: {
                        filter: {patient_id: patientId}
                    }
                }
            ];

            await Promise.all([
                qualityCollection.bulkWrite(bulkOpsQuality, { session, ordered: false }),
                infoCollection.bulkWrite(bulkOpsInfo, { session, ordered: false }),
                formatCollection.bulkWrite(bulkOpsFormat, { session, ordered: false }),
            ]);

            const variants = await variantCollection.find({ patients: patientId }).toArray();
            const bulkOpsVariants = [];

            for (const variant of variants) {
                if (variant.patients.length === 1) {
                    // If the variant only belongs to this patient, delete it
                    bulkOpsVariants.push({
                        deleteOne: {
                            filter: { _id: variant._id }
                        }
                    });
                } else {
                    // If the variant is shared, just remove the patientId from the patients array
                    bulkOpsVariants.push({
                        updateOne: {
                            filter: { _id: variant._id },
                            update: { $pull: { patients: patientId } }
                        }
                    });
                }
            }

            // Execute bulk operations for variants if any exist
            if (bulkOpsVariants.length > 0) {
                await variantCollection.bulkWrite(bulkOpsVariants, { session, ordered: false });
            }

            const result = await patientCollection.deleteOne({ _id: patientId });
            if (result.deletedCount === 0) {
                console.warn(`No patient found with ID: ${patientId}`);
            } else {
                console.log(`Deleted patient: ${result.deletedCount} document(s)`);
            }

            const endDeleteTime = Date.now();
            console.log(`Deleted related records in ${(endDeleteTime - startDeleteTime) / 1000} seconds.`);

            res.status(200).json({ message: 'Successfully deleted all records for the patient.' });
        });
    
    } catch (error) {
        console.error('Error during deletion:', error);
        res.status(500).json({error: 'Error deleting patient data from MongoDB.'});
    } finally {
        session.endSession();
    }
};

export { connect, addPatient, addVariants, deletePatient };