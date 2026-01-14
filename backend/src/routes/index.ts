import { Router } from "express";
import ndcRoutes from "./ndc.routes.js";
import authRoutes from "./auth.routes.js";
import healthRoutes from "./health.routes.js";
import transactionsRoutes from "./transactions.routes.js";
import { promises as fs } from "fs";
import path from "path";

const router = Router();

// Debug logging endpoint with file writing
router.post("/debug/log", async (req: any, res: any) => {
  try {
    const timestamp = new Date().toISOString();
    const logEntry = {
      timestamp,
      component: req.body.component || 'UNKNOWN',
      message: req.body.message || 'No message',
      data: req.body.data || {}
    };

    // Write to console
    console.log(`[${timestamp}] [${logEntry.component}]`, logEntry.message);
    if (req.body.data) {
      console.log('[DEBUG DATA]', JSON.stringify(req.body.data, null, 2));
    }

    // Write to file
    const logsDir = path.join(process.cwd(), 'logs', 'debug');
    await fs.mkdir(logsDir, { recursive: true });

    const logFileName = `frontend-debug-${new Date().toISOString().split('T')[0]}.log`;
    const logFilePath = path.join(logsDir, logFileName);

    const logLine = `\n${'='.repeat(80)}\n[${timestamp}] [${logEntry.component}]\n${logEntry.message}\n${JSON.stringify(logEntry.data, null, 2)}\n`;

    await fs.appendFile(logFilePath, logLine);

    res.json({ success: true, logFile: logFilePath });
  } catch (error) {
    console.error('[DEBUG LOG ERROR]', error);
    res.status(500).json({ success: false, error: String(error) });
  }
});

router.use("/ndc", ndcRoutes);
router.use("/auth", authRoutes);
router.use("/", healthRoutes);
router.use("/transactions", transactionsRoutes);

router.get("/", (_req, res) => {
  res.json({
    name: "NDC Booking Tool API",
    version: "3.1.1",
    description: "Enterprise NDC booking backend with all 9 operations",
    endpoints: {
      health: { health: "GET /api/health", ready: "GET /api/ready", status: "GET /api/status" },
      auth: { authenticate: "POST /api/auth/token", status: "GET /api/auth/token/status", invalidate: "DELETE /api/auth/token", cacheStats: "GET /api/auth/cache/stats" },
      primeFlow: { airShopping: "POST /api/ndc/air-shopping", offerPrice: "POST /api/ndc/offer-price", serviceList: "POST /api/ndc/service-list", seatAvailability: "POST /api/ndc/seat-availability" },
      orderManagement: { orderCreate: "POST /api/ndc/order-create", orderRetrieve: "POST /api/ndc/order-retrieve" },
      servicingFlow: { orderReshop: "POST /api/ndc/order-reshop", orderQuote: "POST /api/ndc/order-quote", orderChange: "POST /api/ndc/order-change" },
      transactions: { list: "GET /api/transactions", stats: "GET /api/transactions/stats", get: "GET /api/transactions/:id", requestXml: "GET /api/transactions/:id/request", responseXml: "GET /api/transactions/:id/response" },
    },
    requiredHeaders: { "X-NDC-Auth-Domain": "Authentication domain", "X-NDC-API-ID": "API ID", "X-NDC-API-Password": "API Password", "X-NDC-Subscription-Key": "Azure subscription key" },
  });
});

export default router;