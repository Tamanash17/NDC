// ============================================================================
// REQUEST LOGGING MIDDLEWARE
// Logs HTTP requests with timing and response details
// ============================================================================

import type { Request, Response, NextFunction } from "express";
import onFinished from "on-finished";
import { config } from "../config/index.js";
import { logger } from "../utils/logger.js";
import { context } from "../utils/context.js";
import { metrics } from "../utils/metrics.js";

// Paths to skip logging (health checks, metrics)
const SKIP_PATHS = new Set(["/health", "/ready", "/live", "/metrics", "/favicon.ico"]);

/**
 * Middleware to log HTTP requests with timing
 */
export function requestLoggingMiddleware() {
  return (req: Request, res: Response, next: NextFunction): void => {
    // Skip logging for certain paths
    if (SKIP_PATHS.has(req.path)) {
      return next();
    }

    // Skip if request logging is disabled
    if (!config.logging.enableRequestLogging) {
      return next();
    }

    const startTime = Date.now();

    // Track in-flight requests
    metrics.httpRequestsInFlight.inc();

    // Log request start
    logger.debug(
      {
        type: "request_start",
        method: req.method,
        url: req.originalUrl,
        query: Object.keys(req.query).length > 0 ? req.query : undefined,
        contentLength: req.headers["content-length"],
        contentType: req.headers["content-type"],
      },
      "Request started"
    );

    // Log when response finishes
    onFinished(res, (_err, response) => {
      const duration = Date.now() - startTime;
      const ctx = context.get();

      // Update metrics
      metrics.httpRequestsInFlight.dec();
      metrics.recordHttpRequest(req.method, req.route?.path || req.path, response.statusCode, duration);

      // Build log data
      const logData = {
        type: "request_complete",
        method: req.method,
        url: req.originalUrl,
        statusCode: response.statusCode,
        duration,
        contentLength: response.getHeader("content-length"),
        correlationId: ctx?.correlationId,
        transactionId: ctx?.transactionId,
        clientIp: ctx?.clientIp,
        userAgent: ctx?.userAgent?.substring(0, 100),
      };

      // Log at appropriate level based on status code
      if (response.statusCode >= 500) {
        logger.error(logData, `${req.method} ${req.originalUrl} ${response.statusCode} ${duration}ms`);
      } else if (response.statusCode >= 400) {
        logger.warn(logData, `${req.method} ${req.originalUrl} ${response.statusCode} ${duration}ms`);
      } else {
        logger.info(logData, `${req.method} ${req.originalUrl} ${response.statusCode} ${duration}ms`);
      }
    });

    next();
  };
}