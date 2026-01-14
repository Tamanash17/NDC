import { Router } from "express";
import { healthController } from "../controllers/health.controller.js";

const router = Router();
router.get("/health", healthController.health);
router.get("/ready", healthController.ready);
router.get("/status", healthController.status);

export default router;