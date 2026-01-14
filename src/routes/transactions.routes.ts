import { Router } from "express";
import { transactionsController } from "../controllers/transactions.controller.js";

const router = Router();

// List and stats
router.get("/", transactionsController.list);
router.get("/stats", transactionsController.stats);

// Correlation groups (sessions/user flows)
router.get("/correlations", transactionsController.getCorrelationGroups);
router.get("/correlations/:correlationId", transactionsController.getByCorrelation);
router.get("/correlations/:correlationId/download", transactionsController.downloadCorrelationZip);

// Individual transaction operations
router.get("/:id", transactionsController.get);
router.get("/:id/request", transactionsController.getRequestXml);
router.get("/:id/response", transactionsController.getResponseXml);

export default router;