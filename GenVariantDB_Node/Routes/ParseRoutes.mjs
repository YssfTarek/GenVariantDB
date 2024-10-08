import express from 'express';
import { connect, addPatient } from '../Controllers/ParseControllers.mjs'

const router = express.Router();

router.get("/connect", connect);
router.post("/addPatient", addPatient);

export default router;