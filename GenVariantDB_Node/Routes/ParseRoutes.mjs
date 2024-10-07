import express from 'express';
import connect from '../Controllers/ParseControllers.mjs'

const router = express.Router();

router.get("/connect", connect)

export default router