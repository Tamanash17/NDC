// ============================================================================
// MIDDLEWARE EXPORTS
// ============================================================================

// Context and logging
export { contextMiddleware } from "./context.middleware.js";
export { requestLoggingMiddleware } from "./logging.middleware.js";

// Validation
export { validateRequest, validateBody, validateQuery, validateParams } from "./validation.middleware.js";

// Rate limiting
export {
  defaultRateLimiter,
  strictRateLimiter,
  ndcRateLimiter,
  authRateLimiter,
} from "./rate-limit.middleware.js";

// Error handling
export { errorHandlerMiddleware, notFoundHandler } from "./error-handler.middleware.js";

// Security
export { helmetMiddleware, corsMiddleware, sanitizeMiddleware } from "./security.middleware.js";

// Timeout
export { timeoutMiddleware } from "./timeout.middleware.js";

// Credentials (Multi-Tenant Auth)
export {
  extractNdcCredentials,
  getCredentialsOrThrow,
  getCredentialHash,
  hashCredentials,
  setTokenInfoHeaders,
  getTokenInfoFromHeaders,
  NDC_CREDENTIAL_HEADERS,
  type ExtractCredentialsOptions,
} from "./credentials.middleware.js";

// Compression
export { compressionMiddleware } from "./compression.middleware.js";