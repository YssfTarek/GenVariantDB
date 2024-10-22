import express from 'express';
import { connect, addPatient, addVariants, deletePatient } from '../Controllers/ParseControllers.mjs'

const router = express.Router();

router.get("/connect", connect);
router.post("/addPatient", addPatient);
router.post("/addVariants", addVariants);
router.delete("/deletePatient/:patient_id", deletePatient);

export default router;