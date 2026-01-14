// ============================================================================
// BASE ERROR CLASSES
// Structured error hierarchy for the application
// ============================================================================

import type { NDCError } from "../types/index.js";

// ----------------------------------------------------------------------------
// ERROR CODES ENUM
// ----------------------------------------------------------------------------

export enum ErrorCode {
  // Client Errors (4xx)
  VALIDATION_ERROR = "VALIDATION_ERROR",
  INVALID_REQUEST = "INVALID_REQUEST",
  MISSING_REQUIRED_FIELD = "MISSING_REQUIRED_FIELD",
  INVALID_FORMAT = "INVALID_FORMAT",
  RESOURCE_NOT_FOUND = "RESOURCE_NOT_FOUND",
  UNAUTHORIZED = "UNAUTHORIZED",
  FORBIDDEN = "FORBIDDEN",
  RATE_LIMITED = "RATE_LIMITED",

  // NDC Errors
  NDC_ERROR = "NDC_ERROR",
  NDC_AUTH_FAILED = "NDC_AUTH_FAILED",
  NDC_INVALID_RESPONSE = "NDC_INVALID_RESPONSE",
  NDC_OFFER_EXPIRED = "NDC_OFFER_EXPIRED",
  NDC_ORDER_NOT_FOUND = "NDC_ORDER_NOT_FOUND",
  NDC_PAYMENT_FAILED = "NDC_PAYMENT_FAILED",
  NDC_SEAT_UNAVAILABLE = "NDC_SEAT_UNAVAILABLE",
  NDC_SERVICE_UNAVAILABLE = "NDC_SERVICE_UNAVAILABLE",
  NDC_CONNECTION_ERROR = "NDC_CONNECTION_ERROR",
  NDC_TIMEOUT = "NDC_TIMEOUT",

  // Token Errors
  TOKEN_EXPIRED = "TOKEN_EXPIRED",
  TOKEN_INVALID = "TOKEN_INVALID",
  TOKEN_NOT_FOUND = "TOKEN_NOT_FOUND",

  // System Errors (5xx)
  INTERNAL_ERROR = "INTERNAL_ERROR",
  SERVICE_UNAVAILABLE = "SERVICE_UNAVAILABLE",
  CIRCUIT_OPEN = "CIRCUIT_OPEN",
  TIMEOUT = "TIMEOUT",
  NETWORK_ERROR = "NETWORK_ERROR",
  XML_PARSE_ERROR = "XML_PARSE_ERROR",
  XML_BUILD_ERROR = "XML_BUILD_ERROR",
  CONFIGURATION_ERROR = "CONFIGURATION_ERROR",
}

// ----------------------------------------------------------------------------
// ERROR OPTIONS INTERFACE
// ----------------------------------------------------------------------------

export interface ErrorOptions {
  code: ErrorCode;
  message: string;
  statusCode?: number;
  retryable?: boolean;
  cause?: Error;
  details?: Record<string, unknown>;
  ndcErrors?: NDCError[];
}

// ----------------------------------------------------------------------------
// BASE APPLICATION ERROR
// ----------------------------------------------------------------------------

export class AppError extends Error {
  public readonly code: ErrorCode;
  public readonly statusCode: number;
  public readonly retryable: boolean;
  public readonly details?: Record<string, unknown>;
  public readonly ndcErrors?: NDCError[];
  public readonly timestamp: string;

  constructor(options: ErrorOptions) {
    super(options.message);

    this.name = this.constructor.name;
    this.code = options.code;
    this.statusCode = options.statusCode || 500;
    this.retryable = options.retryable ?? false;
    this.details = options.details;
    this.ndcErrors = options.ndcErrors;
    this.timestamp = new Date().toISOString();

    Error.captureStackTrace(this, this.constructor);

    if (options.cause) {
      this.cause = options.cause;
    }
  }

  toJSON(): Record<string, unknown> {
    return {
      name: this.name,
      code: this.code,
      message: this.message,
      statusCode: this.statusCode,
      retryable: this.retryable,
      details: this.details,
      ndcErrors: this.ndcErrors,
      timestamp: this.timestamp,
    };
  }

  isRetryable(): boolean {
    return this.retryable;
  }

  isClientError(): boolean {
    return this.statusCode >= 400 && this.statusCode < 500;
  }

  isServerError(): boolean {
    return this.statusCode >= 500;
  }
}