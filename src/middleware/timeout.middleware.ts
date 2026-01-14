// ============================================================================
// TIMEOUT MIDDLEWARE
// Request timeout handling to prevent hung requests
// ============================================================================

import type { Request, Response, NextFunction } from "express";
import { config } from "../config/index.js";
import { TimeoutError } from "../errors/index.js";
import { logger } from "../utils/logger.js";
import { context } from "../utils/context.js";

// Paths to skip timeout (long-running operations)
const SKIP_PATHS = new Set(["/health", "/ready", "/live", "/metrics"]);

/**
 * Middleware to enforce request timeouts
 */
export function timeoutMiddleware(timeoutMs?: number) {
  const timeout = timeoutMs || config.resilience.timeouts.request;

  return (req: Request, res: Response, next: NextFunction): void => {
    // Skip timeout for certain paths
    if (SKIP_PATHS.has(req.path)) {
      return next();
    }

    let timedOut = false;

    // Set timeout
    const timer = setTimeout(() => {
      timedOut = true;

      const ctx = context.get();
      logger.error(
        {
          type: "request_timeout",
          path: req.path,
          method: req.method,
          timeout,
          correlationId: ctx?.correlationId,
        },
        `Request timed out after ${timeout}ms`
      );

      if (!res.headersSent) {
        next(new TimeoutError(`${req.method} ${req.path}`, timeout));
      }
    }, timeout);

    // Clear timeout when response finishes
    res.on("finish", () => {
      clearTimeout(timer);
    });

    res.on("close", () => {
      clearTimeout(timer);
    });

    // Continue if not timed out
    if (!timedOut) {
      next();
    }
  };
}