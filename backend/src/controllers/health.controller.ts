// ============================================================================
// HEALTH CONTROLLER
// ============================================================================

import type { Request, Response } from "express";
import { config } from "../config/index.js";
import { ndcClient } from "../services/ndc-client.service.js";
import { xmlTransactionLogger } from "../utils/xml-logger.js";

class HealthController {
  private startTime = Date.now();
  
  health = async (_req: Request, res: Response): Promise<void> => {
    const uptime = Math.floor((Date.now() - this.startTime) / 1000);
    res.json({
      status: "healthy",
      timestamp: new Date().toISOString(),
      uptime: `${uptime}s`,
      version: config.app.version,
      environment: config.app.env,
      memory: { used: Math.round(process.memoryUsage().heapUsed / 1024 / 1024), total: Math.round(process.memoryUsage().heapTotal / 1024 / 1024), unit: "MB" },
    });
  };
  
  ready = async (_req: Request, res: Response): Promise<void> => {
    res.json({ ready: true, timestamp: new Date().toISOString() });
  };
  
  status = async (_req: Request, res: Response): Promise<void> => {
    const uptime = Math.floor((Date.now() - this.startTime) / 1000);
    const ndcStatus = ndcClient.getStatus();
    const txnStats = xmlTransactionLogger.getStats();
    res.json({
      status: "healthy", timestamp: new Date().toISOString(), uptime: `${uptime}s`, version: config.app.version, environment: config.app.env,
      services: { circuitBreaker: ndcStatus.circuitBreaker, tokenCache: ndcStatus.tokenCache },
      transactions: txnStats,
      memory: { used: Math.round(process.memoryUsage().heapUsed / 1024 / 1024), total: Math.round(process.memoryUsage().heapTotal / 1024 / 1024), unit: "MB" },
    });
  };
}

export const healthController = new HealthController();