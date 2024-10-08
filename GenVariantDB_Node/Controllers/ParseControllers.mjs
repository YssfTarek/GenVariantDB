import { getCollections } from '../config/config.mjs';


const connect = async (req, res) => {
    res.send('You are connected to your parse (node) backend, through the gateway!');
    res.status(200)
};

const addPatient = async (req, res) => {
    const { patient, variants, qual, info, format } = req.body;
    const { patientCollection, variantCollection, qualityCollection, infoCollection, formatCollection } = getCollections();
    
    try{
        let existingPatient = await patientCollection.findOne({
            "patient_name": (patient.patient_name),
            "accession_number": (patient.accession_number)
        });

        let patientId;

        if (!existingPatient) {
            const result = await patientCollection.insertOne(patient);
            patientId = result.insertedId;
        } else {
            patientId = existingPatient._id;
            return res.status(400).json({"error": "Patient already exists"});
        };
        
        for (let i = 0; i < variants.length; i++) {
            const variantData = variants[i];
            const variantKey = {
                '#CHROM': variantData['#CHROM'],
                'POS': variantData['POS'],
                'REF': variantData['REF'],
                'ALT': variantData['ALT']
            };

            let variantDoc = await variantCollection.findOne(variantKey);
            let variantId

            if (!variantDoc) {
                variantData.patients = [patientId];
                const result = await variantCollection.insertOne(variantData);
                variantId = result.insertedId;
            } else {
                variantId = variantDoc._id;
                if (!variantDoc.patients.includes(patientId)) {
                    await variantCollection.updateOne(
                        { _id: variantId },
                        { $addToSet: { patients: patientId } } // Add patientId to existing variant
                    );
                }
            }

            const qualityDoc = {
                qual:qual[i].QUAL,
                filter: qual[i].FILTER,
                variant_id: variantId,
                patient_id: patientId
            };

            await qualityCollection.insertOne(qualityDoc);

            const infoDoc = {
                info: info[i],
                variant_id: variantId,
                patient_id: patientId
            };

            await infoCollection.insertOne(infoDoc);

            const formatDoc = {
                format: format[i],
                variant_id: variantId,
                patient_id: patientId
            };

            await formatCollection.insertOne(formatDoc);
        }

        res.status(201).json({message: 'Data uploaded successfully.'});

    } catch (error) {
        console.error('Error:', error);
        res.status(500).json({error: "Internal server error"});
    }
};

export { connect, addPatient };