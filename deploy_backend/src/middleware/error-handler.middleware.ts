// ============================================================================
// ERROR HANDLER MIDDLEWARE
// Centralized error handling with structured responses
// ============================================================================

import type { Request, Response, NextFunction } from "express";
import { AppError, ErrorCode, TokenExpiredError, TokenNotFoundError } from "../errors/index.js";
import { logger } from "../utils/logger.js";
import { context } from "../utils/context.js";
import { config } from "../config/index.js";
import type { ApiResponse, ApiError, ResponseMeta } from "../types/api.types.js";

/**
 * Build response metadata
 */
function buildMeta(req: Request): ResponseMeta {
  const ctx = context.get();
  return {
    transactionId: ctx?.transactionId || "unknown",
    correlationId: ctx?.correlationId || "unknown",
    timestamp: new Date().toISOString(),
    duration: ctx ? Date.now() - ctx.startTime : 0,
    operation: ctx?.operation || `${req.method} ${req.path}`,
  };
}

/**
 * Global error handler middleware
 */
export function errorHandlerMiddleware() {
  return (err: Error, req: Request, res: Response, _next: NextFunction): void => {
    const meta = buildMeta(req);

    // Handle AppError (our custom errors)
    if (err instanceof AppError) {
      const apiError: ApiError = {
        code: err.code,
        message: err.message,
        retryable: err.retryable,
        details: err.details,
        ndcErrors: err.ndcErrors,
      };

      // Add token info for token errors
      if (err instanceof TokenExpiredError || err instanceof TokenNotFoundError) {
        if (err instanceof TokenExpiredError) {
          meta.tokenInfo = err.tokenInfo;
        }
      }

      // Log at appropriate level
      if (err.isServerError()) {
        logger.error(
          {
            type: "app_error",
            error: err.toJSON(),
            stack: err.stack,
            cause: err.cause,
          },
          err.message
        );
      } else {
        logger.warn(
          {
            type: "app_error",
            error: err.toJSON(),
          },
          err.message
        );
      }

      const response: ApiResponse = {
        success: false,
        error: apiError,
        meta,
      };

      res.status(err.statusCode).json(response);
      return;
    }

    // Handle Zod validation errors
    if ((err as Error).name === "ZodError") {
      const apiError: ApiError = {
        code: ErrorCode.VALIDATION_ERROR,
        message: "Validation failed",
        retryable: false,
        details: { errors: (err as unknown as { errors: unknown[] }).errors },
      };

      logger.warn(
        {
          type: "validation_error",
          error: err,
        },
        "Unhandled Zod validation error"
      );

      const response: ApiResponse = {
        success: false,
        error: apiError,
        meta,
      };

      res.status(400).json(response);
      return;
    }

    // Handle JSON parse errors
    if (err instanceof SyntaxError && "body" in err) {
      const apiError: ApiError = {
        code: ErrorCode.INVALID_REQUEST,
        message: "Invalid JSON in request body",
        retryable: false,
      };

      logger.warn(
        {
          type: "parse_error",
          error: err.message,
        },
        "Invalid JSON in request"
      );

      const response: ApiResponse = {
        success: false,
        error: apiError,
        meta,
      };

      res.status(400).json(response);
      return;
    }

    // Handle unknown errors
    logger.error(
      {
        type: "unhandled_error",
        error: {
          name: err.name,
          message: err.message,
          stack: err.stack,
        },
      },
      "Unhandled error"
    );

    const apiError: ApiError = {
      code: ErrorCode.INTERNAL_ERROR,
      message: config.app.isProd ? "An unexpected error occurred" : err.message,
      retryable: false,
      details: config.app.isDev ? { stack: err.stack } : undefined,
    };

    const response: ApiResponse = {
      success: false,
      error: apiError,
      meta,
    };

    res.status(500).json(response);
  };
}

/**
 * 404 Not Found handler
 */
export function notFoundHandler() {
  return (req: Request, res: Response): void => {
    const meta = buildMeta(req);

    const response: ApiResponse = {
      success: false,
      error: {
        code: ErrorCode.RESOURCE_NOT_FOUND,
        message: `Route ${req.method} ${req.path} not found`,
        retryable: false,
      },
      meta,
    };

    res.status(404).json(response);
  };
}