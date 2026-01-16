import { Router } from "express";
import ndcRoutes from "./ndc.routes.js";
import authRoutes from "./auth.routes.js";
import healthRoutes from "./health.routes.js";
import transactionsRoutes from "./transactions.routes.js";
import { promises as fs } from "fs";
import path from "path";
import { config, getNdcEnvironment, setNdcEnvironment, type NDCEnvironment } from "../config/index.js";

const router = Router();

// Deployment diagnostic endpoint (NO auth required) - to verify Railway deployment
router.get("/deploy-info", (_req, res) => {
  res.json({
    deployed: true,
    timestamp: new Date().toISOString(),
    commit: "e8849da",
    feature: "requestXml-in-error-responses",
    message: "This version includes requestXml in ALL AirShopping error responses",
    testUrl: "/api/ndc/air-shopping",
    expectedBehavior: "Error responses should include requestXml field (not <request not captured>)"
  });
});

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

// NDC Environment switching endpoints
router.get("/environment", (_req, res) => {
  const currentEnv = getNdcEnvironment();
  const envConfig = config.ndc.environments[currentEnv];
  res.json({
    current: currentEnv,
    baseUrl: envConfig.baseUrl,
    authUrl: envConfig.authUrl,
    headerName: envConfig.headerName,
    headerValue: envConfig.header,
    available: ["UAT", "PROD"],
  });
});

router.post("/environment", (req, res) => {
  const { environment } = req.body;

  if (!environment || !["UAT", "PROD"].includes(environment)) {
    return res.status(400).json({
      error: "Invalid environment",
      message: "Environment must be 'UAT' or 'PROD'",
      current: getNdcEnvironment(),
    });
  }

  const previousEnv = getNdcEnvironment();
  setNdcEnvironment(environment as NDCEnvironment);

  const newConfig = config.ndc.environments[environment as NDCEnvironment];

  console.log(`[ENV SWITCH] Changed from ${previousEnv} to ${environment}`);

  res.json({
    success: true,
    previous: previousEnv,
    current: environment,
    baseUrl: newConfig.baseUrl,
    authUrl: newConfig.authUrl,
    headerName: newConfig.headerName,
    headerValue: newConfig.header,
    message: `Switched to ${environment} environment`,
  });
});

router.use("/ndc", ndcRoutes);
router.use("/auth", authRoutes);
router.use("/", healthRoutes);
router.use("/transactions", transactionsRoutes);

router.get("/", (_req, res) => {
  res.json({
    name: "NDC Booking Tool API",
    version: "3.2.0",
    description: "Enterprise NDC booking backend with all 9 operations and UAT/PROD switching",
    currentEnvironment: getNdcEnvironment(),
    endpoints: {
      environment: { get: "GET /api/environment", set: "POST /api/environment" },
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