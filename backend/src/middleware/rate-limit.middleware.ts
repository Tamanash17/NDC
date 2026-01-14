// ============================================================================
// RATE LIMITING MIDDLEWARE
// Protects against excessive requests with multiple limit tiers
// ============================================================================

import rateLimit from "express-rate-limit";
import type { Request, Response } from "express";
import { config } from "../config/index.js";
import { logger } from "../utils/logger.js";
import { context } from "../utils/context.js";

/**
 * Extract client identifier for rate limiting
 */
function keyGenerator(req: Request): string {
  // Try to get real IP from proxy headers
  const ip =
    (req.headers["x-forwarded-for"] as string)?.split(",")[0]?.trim() ||
    req.socket.remoteAddress ||
    "unknown";

  // Optionally include credential hash for per-tenant limiting
  const credentialHash = (req as Request & { credentialHash?: string }).credentialHash;
  if (credentialHash) {
    return `${ip}:${credentialHash}`;
  }

  return ip;
}

/**
 * Custom rate limit handler
 */
function createRateLimitHandler(limitType: string) {
  return (req: Request, res: Response): void => {
    const ctx = context.get();

    logger.warn(
      {
        type: "rate_limited",
        limitType,
        ip: keyGenerator(req),
        path: req.path,
        correlationId: ctx?.correlationId,
      },
      `Rate limit exceeded: ${limitType}`
    );

    res.status(429).json({
      success: false,
      error: {
        code: "RATE_LIMITED",
        message: `Too many requests. Please slow down. (${limitType})`,
        retryable: true,
        details: {
          retryAfterMs: config.resilience.rateLimit.windowMs,
          limitType,
        },
      },
      meta: {
        transactionId: ctx?.transactionId || "unknown",
        correlationId: ctx?.correlationId || "unknown",
        timestamp: new Date().toISOString(),
        duration: ctx ? Date.now() - ctx.startTime : 0,
        operation: `${req.method} ${req.path}`,
      },
    });
  };
}

/**
 * Skip rate limiting for certain paths
 */
function skipFunction(req: Request): boolean {
  const skipPaths = ["/health", "/ready", "/live", "/metrics"];
  return skipPaths.includes(req.path);
}

// ----------------------------------------------------------------------------
// DEFAULT RATE LIMITER (General API)
// ----------------------------------------------------------------------------

export const defaultRateLimiter = rateLimit({
  windowMs: config.resilience.rateLimit.windowMs,
  max: config.resilience.rateLimit.maxRequests,
  keyGenerator,
  handler: createRateLimitHandler("default"),
  skip: skipFunction,
  standardHeaders: true,
  legacyHeaders: false,
});

// ----------------------------------------------------------------------------
// STRICT RATE LIMITER (Booking/Payment endpoints)
// ----------------------------------------------------------------------------

export const strictRateLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: config.resilience.rateLimit.strictMax,
  keyGenerator,
  handler: createRateLimitHandler("strict"),
  skip: skipFunction,
  standardHeaders: true,
  legacyHeaders: false,
});

// ----------------------------------------------------------------------------
// NDC RATE LIMITER (NDC API calls)
// ----------------------------------------------------------------------------

export const ndcRateLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: config.resilience.rateLimit.ndcMax,
  keyGenerator,
  handler: createRateLimitHandler("ndc"),
  standardHeaders: true,
  legacyHeaders: false,
  message: "NDC API rate limit exceeded",
});

// ----------------------------------------------------------------------------
// AUTH RATE LIMITER (Authentication endpoints)
// ----------------------------------------------------------------------------

export const authRateLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 20, // 20 auth attempts per minute
  keyGenerator,
  handler: createRateLimitHandler("auth"),
  standardHeaders: true,
  legacyHeaders: false,
});