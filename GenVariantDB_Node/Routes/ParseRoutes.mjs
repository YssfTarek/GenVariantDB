import express from 'express';
import { connect, addPatient, addVariants } from '../Controllers/ParseControllers.mjs'

const router = express.Router();

router.get("/connect", connect);
router.post("/addPatient", addPatient);
router.post("/addVariants", addVariants);

export default router;