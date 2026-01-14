// ============================================================================
// SECURITY MIDDLEWARE
// Helmet, CORS, and other security configurations
// ============================================================================

import helmet from "helmet";
import cors from "cors";
import type { Request, Response, NextFunction } from "express";
import { config } from "../config/index.js";
import { logger } from "../utils/logger.js";

// ----------------------------------------------------------------------------
// HELMET CONFIGURATION
// ----------------------------------------------------------------------------

export const helmetMiddleware = helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      scriptSrc: ["'self'"],
      imgSrc: ["'self'", "data:", "https:"],
      connectSrc: ["'self'"],
      fontSrc: ["'self'"],
      objectSrc: ["'none'"],
      mediaSrc: ["'self'"],
      frameSrc: ["'none'"],
    },
  },
  crossOriginEmbedderPolicy: false,
  crossOriginResourcePolicy: { policy: "cross-origin" },
  hsts: {
    maxAge: 31536000,
    includeSubDomains: true,
    preload: true,
  },
  noSniff: true,
  referrerPolicy: { policy: "strict-origin-when-cross-origin" },
});

// ----------------------------------------------------------------------------
// CORS CONFIGURATION
// ----------------------------------------------------------------------------

export const corsMiddleware = cors({
  origin: (origin, callback) => {
    // Allow requests with no origin (like mobile apps or curl)
    if (!origin) {
      return callback(null, true);
    }

    // Check against configured origins
    if (config.security.corsOrigins.includes(origin)) {
      return callback(null, true);
    }

    // Allow localhost in development
    if (config.app.isDev && (origin.includes("localhost") || origin.includes("127.0.0.1"))) {
      return callback(null, true);
    }

    // Allow Vercel deployments
    if (origin.includes("vercel.app")) {
      return callback(null, true);
    }

    logger.warn({ origin }, "CORS request blocked");
    callback(new Error("Not allowed by CORS"));
  },
  credentials: true,
  methods: ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
  allowedHeaders: [
    "Content-Type",
    "Authorization",
    "X-Correlation-ID",
    "X-Request-ID",
    // NDC credential headers
    "X-NDC-Auth-Domain",
    "X-NDC-API-ID",
    "X-NDC-API-Password",
    "X-NDC-Subscription-Key",
    "X-NDC-Environment",
    "Ocp-Apim-Subscription-Key",
    "NDCUAT",
  ],
  exposedHeaders: [
    "X-Correlation-ID",
    "X-Request-ID",
    "X-RateLimit-Limit",
    "X-RateLimit-Remaining",
    "X-RateLimit-Reset",
    // Token lifecycle headers
    "X-Token-Status",
    "X-Token-Expires-In",
    "X-Token-Expires-At",
    "X-Token-Credential-Hash",
  ],
  maxAge: 86400, // 24 hours
});

// ----------------------------------------------------------------------------
// REQUEST SANITIZATION
// ----------------------------------------------------------------------------

export function sanitizeMiddleware() {
  return (req: Request, _res: Response, next: NextFunction): void => {
    // Remove any potentially dangerous headers
    delete req.headers["x-powered-by"];

    // Sanitize query parameters (basic XSS prevention)
    if (req.query) {
      for (const key of Object.keys(req.query)) {
        const value = req.query[key];
        if (typeof value === "string") {
          req.query[key] = value.replace(/[<>]/g, "");
        }
      }
    }

    next();
  };
}