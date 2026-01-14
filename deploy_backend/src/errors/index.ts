// ============================================================================
// ERROR EXPORTS
// ============================================================================

export { AppError, ErrorCode, type ErrorOptions } from "./base.error.js";
export {
  // Validation
  ValidationError,
  MissingFieldError,
  InvalidFormatError,
  // Auth
  UnauthorizedError,
  ForbiddenError,
  // Token (Multi-Tenant)
  TokenExpiredError,
  TokenNotFoundError,
  // NDC
  NDCApiError,
  NDCAuthError,
  NDCConnectionError,
  NDCTimeoutError,
  NDCOfferExpiredError,
  NDCOrderNotFoundError,
  NDCPaymentError,
  NDCSeatUnavailableError,
  // Resilience
  CircuitBreakerOpenError,
  TimeoutError,
  NetworkError,
  RateLimitedError,
  // System
  XmlParseError,
  XmlBuildError,
  ConfigurationError,
  InternalError,
  NotFoundError,
} from "./specific.errors.js";