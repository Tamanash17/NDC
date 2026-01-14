// ============================================================================
// ERROR MIDDLEWARE - Re-export for compatibility
// ============================================================================

export { errorHandlerMiddleware as errorMiddleware } from "./error-handler.middleware.js";
export { notFoundHandler as notFoundMiddleware } from "./error-handler.middleware.js";
export { AppError } from "../errors/base.error.js";