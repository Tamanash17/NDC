// ============================================================================
// REQUEST CONTEXT MIDDLEWARE
// Initializes async local storage context for each request
// ============================================================================

import type { Request, Response, NextFunction } from "express";
import { v4 as uuidv4 } from "uuid";
import { context } from "../utils/context.js";

// Header names for correlation
const CORRELATION_ID_HEADER = "x-correlation-id";
const REQUEST_ID_HEADER = "x-request-id";

/**
 * Middleware to initialize request context with correlation tracking
 */
export function contextMiddleware() {
  return (req: Request, res: Response, next: NextFunction): void => {
    // Get or generate correlation ID
    const correlationId = (req.headers[CORRELATION_ID_HEADER] as string) || uuidv4();

    // Generate unique transaction ID for this request
    const transactionId = uuidv4();

    // Extract client info
    const clientIp =
      (req.headers["x-forwarded-for"] as string)?.split(",")[0]?.trim() ||
      req.socket.remoteAddress ||
      "unknown";
    const userAgent = req.headers["user-agent"] || "unknown";

    // Set response headers for tracing
    res.setHeader(CORRELATION_ID_HEADER, correlationId);
    res.setHeader(REQUEST_ID_HEADER, transactionId);

    // Run the rest of the request within the context
    context.run(
      {
        correlationId,
        transactionId,
        startTime: Date.now(),
        clientIp,
        userAgent,
        operation: `${req.method} ${req.path}`,
      },
      () => next()
    );
  };
}