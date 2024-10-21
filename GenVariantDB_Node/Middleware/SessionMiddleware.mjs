import { getCollections } from '../Config/config.mjs';

const startSessionMiddleware = async (req, res, next) => {

    const { client } = getCollections();
    if (!client){
        return res.status(500).json({ error: 'Database not connected.' });
    }

    req.session = client.startSession();
    next();
};

export default startSessionMiddleware;