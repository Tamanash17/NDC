// ============================================================================
// SPECIFIC ERROR CLASSES
// Domain-specific error types for cleaner error handling
// ============================================================================

import { AppError, ErrorCode } from "./base.error.js";
import type { NDCError, TokenInfo } from "../types/index.js";
import type { ZodError } from "zod";

// ----------------------------------------------------------------------------
// VALIDATION ERRORS
// ----------------------------------------------------------------------------

export class ValidationError extends AppError {
  constructor(message: string, details?: Record<string, unknown>) {
    super({
      code: ErrorCode.VALIDATION_ERROR,
      message,
      statusCode: 400,
      retryable: false,
      details,
    });
  }

  static fromZod(error: ZodError): ValidationError {
    const details = error.errors.reduce(
      (acc, err) => {
        const path = err.path.join(".");
        acc[path] = err.message;
        return acc;
      },
      {} as Record<string, string>
    );

    return new ValidationError(
      `Validation failed: ${error.errors.map((e) => e.message).join(", ")}`,
      { fields: details }
    );
  }
}

export class MissingFieldError extends AppError {
  constructor(fieldName: string) {
    super({
      code: ErrorCode.MISSING_REQUIRED_FIELD,
      message: `Missing required field: ${fieldName}`,
      statusCode: 400,
      retryable: false,
      details: { field: fieldName },
    });
  }
}

export class InvalidFormatError extends AppError {
  constructor(fieldName: string, expectedFormat: string) {
    super({
      code: ErrorCode.INVALID_FORMAT,
      message: `Invalid format for ${fieldName}. Expected: ${expectedFormat}`,
      statusCode: 400,
      retryable: false,
      details: { field: fieldName, expectedFormat },
    });
  }
}

// ----------------------------------------------------------------------------
// AUTH ERRORS
// ----------------------------------------------------------------------------

export class UnauthorizedError extends AppError {
  constructor(message = "Authentication required") {
    super({
      code: ErrorCode.UNAUTHORIZED,
      message,
      statusCode: 401,
      retryable: false,
    });
  }
}

export class ForbiddenError extends AppError {
  constructor(message = "Access denied") {
    super({
      code: ErrorCode.FORBIDDEN,
      message,
      statusCode: 403,
      retryable: false,
    });
  }
}

// ----------------------------------------------------------------------------
// TOKEN ERRORS (Multi-Tenant Auth)
// ----------------------------------------------------------------------------

export class TokenExpiredError extends AppError {
  public readonly tokenInfo: TokenInfo;

  constructor(tokenInfo: TokenInfo) {
    super({
      code: ErrorCode.TOKEN_EXPIRED,
      message: "Authentication token has expired. Please re-authenticate with credentials.",
      statusCode: 401,
      retryable: true,
      details: {
        tokenStatus: tokenInfo.status,
        expiredAt: tokenInfo.expiresAt,
        credentialHash: tokenInfo.credentialHash,
        action: "REAUTH_REQUIRED",
      },
    });
    this.tokenInfo = tokenInfo;
  }
}

export class TokenNotFoundError extends AppError {
  constructor(credentialHash: string) {
    super({
      code: ErrorCode.TOKEN_NOT_FOUND,
      message: "No cached token found. Please authenticate first.",
      statusCode: 401,
      retryable: true,
      details: {
        credentialHash,
        action: "AUTH_REQUIRED",
      },
    });
  }
}

// ----------------------------------------------------------------------------
// NDC SPECIFIC ERRORS
// ----------------------------------------------------------------------------

export class NDCApiError extends AppError {
  constructor(
    message: string,
    ndcErrors?: NDCError[],
    options?: { retryable?: boolean; cause?: Error; statusCode?: number }
  ) {
    super({
      code: ErrorCode.NDC_ERROR,
      message,
      statusCode: options?.statusCode || 502,
      retryable: options?.retryable ?? false,
      ndcErrors,
      cause: options?.cause,
    });
  }

  getFirstErrorCode(): string | undefined {
    return this.ndcErrors?.[0]?.code;
  }
}

export class NDCAuthError extends AppError {
  constructor(message = "NDC authentication failed", cause?: Error) {
    super({
      code: ErrorCode.NDC_AUTH_FAILED,
      message,
      statusCode: 502,
      retryable: true,
      cause,
    });
  }
}

export class NDCConnectionError extends AppError {
  constructor(message: string, cause?: Error) {
    super({
      code: ErrorCode.NDC_CONNECTION_ERROR,
      message: `Connection to NDC gateway failed: ${message}`,
      statusCode: 502,
      retryable: true,
      cause,
    });
  }
}

export class NDCTimeoutError extends AppError {
  constructor(url: string, timeoutMs: number) {
    super({
      code: ErrorCode.NDC_TIMEOUT,
      message: `NDC request timed out after ${timeoutMs}ms`,
      statusCode: 504,
      retryable: true,
      details: { url, timeoutMs },
    });
  }
}

export class NDCOfferExpiredError extends AppError {
  constructor(offerId: string) {
    super({
      code: ErrorCode.NDC_OFFER_EXPIRED,
      message: `Offer ${offerId} has expired`,
      statusCode: 410,
      retryable: false,
      details: { offerId },
    });
  }
}

export class NDCOrderNotFoundError extends AppError {
  constructor(orderId: string) {
    super({
      code: ErrorCode.NDC_ORDER_NOT_FOUND,
      message: `Order ${orderId} not found`,
      statusCode: 404,
      retryable: false,
      details: { orderId },
    });
  }
}

export class NDCPaymentError extends AppError {
  constructor(message: string, details?: Record<string, unknown>) {
    super({
      code: ErrorCode.NDC_PAYMENT_FAILED,
      message,
      statusCode: 402,
      retryable: false,
      details,
    });
  }
}

export class NDCSeatUnavailableError extends AppError {
  constructor(seatInfo: { row: string; column: string; segment?: string }) {
    super({
      code: ErrorCode.NDC_SEAT_UNAVAILABLE,
      message: `Seat ${seatInfo.row}${seatInfo.column} is no longer available`,
      statusCode: 409,
      retryable: false,
      details: seatInfo,
    });
  }
}

// ----------------------------------------------------------------------------
// RESILIENCE ERRORS
// ----------------------------------------------------------------------------

export class CircuitBreakerOpenError extends AppError {
  constructor(serviceName: string, remainingMs?: number) {
    super({
      code: ErrorCode.CIRCUIT_OPEN,
      message: `Service ${serviceName} is temporarily unavailable (circuit breaker open)`,
      statusCode: 503,
      retryable: true,
      details: { service: serviceName, retryAfterMs: remainingMs },
    });
  }
}

export class TimeoutError extends AppError {
  constructor(operation: string, timeoutMs: number) {
    super({
      code: ErrorCode.TIMEOUT,
      message: `Operation ${operation} timed out after ${timeoutMs}ms`,
      statusCode: 504,
      retryable: true,
      details: { operation, timeoutMs },
    });
  }
}

export class NetworkError extends AppError {
  constructor(message: string, cause?: Error) {
    super({
      code: ErrorCode.NETWORK_ERROR,
      message,
      statusCode: 502,
      retryable: true,
      cause,
    });
  }
}

export class RateLimitedError extends AppError {
  constructor(retryAfter?: number) {
    super({
      code: ErrorCode.RATE_LIMITED,
      message: "Rate limit exceeded. Please slow down.",
      statusCode: 429,
      retryable: true,
      details: retryAfter ? { retryAfterMs: retryAfter } : undefined,
    });
  }
}

// ----------------------------------------------------------------------------
// SYSTEM ERRORS
// ----------------------------------------------------------------------------

export class XmlParseError extends AppError {
  constructor(message: string, cause?: Error) {
    super({
      code: ErrorCode.XML_PARSE_ERROR,
      message: `Failed to parse XML: ${message}`,
      statusCode: 500,
      retryable: false,
      cause,
    });
  }
}

export class XmlBuildError extends AppError {
  constructor(operation: string, message: string) {
    super({
      code: ErrorCode.XML_BUILD_ERROR,
      message: `Failed to build XML for ${operation}: ${message}`,
      statusCode: 500,
      retryable: false,
      details: { operation },
    });
  }
}

export class ConfigurationError extends AppError {
  constructor(message: string) {
    super({
      code: ErrorCode.CONFIGURATION_ERROR,
      message,
      statusCode: 500,
      retryable: false,
    });
  }
}

export class InternalError extends AppError {
  constructor(message = "An unexpected error occurred", cause?: Error) {
    super({
      code: ErrorCode.INTERNAL_ERROR,
      message,
      statusCode: 500,
      retryable: false,
      cause,
    });
  }
}

export class NotFoundError extends AppError {
  constructor(resource: string, identifier?: string) {
    super({
      code: ErrorCode.RESOURCE_NOT_FOUND,
      message: identifier
        ? `${resource} with identifier "${identifier}" not found`
        : `${resource} not found`,
      statusCode: 404,
      retryable: false,
      details: { resource, identifier },
    });
  }
}