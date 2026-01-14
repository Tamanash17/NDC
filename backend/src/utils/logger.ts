// ============================================================================
// STRUCTURED LOGGER
// Pino-based logger with automatic context injection and sensitive data masking
// ============================================================================

import pino from "pino";
import { config } from "../config/index.js";
import { context } from "./context.js";

// ----------------------------------------------------------------------------
// SENSITIVE DATA PATTERNS FOR REDACTION
// ----------------------------------------------------------------------------

const redactPaths = [
  "password",
  "apiPassword",
  "cardNumber",
  "cvv",
  "card.number",
  "card.cvv",
  "payment.card.number",
  "payment.card.cvv",
  "authorization",
  "Authorization",
  "subscriptionKey",
  "NDC_API_PASSWORD",
  "req.headers.authorization",
  "req.headers[\"x-ndc-api-password\"]",
  "credentials.password",
];

// ----------------------------------------------------------------------------
// PINO CONFIGURATION
// ----------------------------------------------------------------------------

const pinoOptions: pino.LoggerOptions = {
  level: config.logging.level,
  redact: config.logging.maskSensitiveData
    ? {
        paths: redactPaths,
        censor: "[REDACTED]",
      }
    : undefined,
  formatters: {
    level: (label) => ({ level: label }),
    bindings: () => ({}),
  },
  timestamp: () => `,"timestamp":"${new Date().toISOString()}"`,
  base: {
    service: config.app.name,
    version: config.app.version,
    env: config.app.env,
  },
};

// ----------------------------------------------------------------------------
// TRANSPORT CONFIGURATION
// ----------------------------------------------------------------------------

const transport = config.logging.pretty
  ? pino.transport({
      target: "pino-pretty",
      options: {
        colorize: true,
        translateTime: "SYS:standard",
        ignore: "pid,hostname,service,version,env",
        messageFormat: "{correlationId} | {msg}",
      },
    })
  : undefined;

const baseLogger = transport ? pino(pinoOptions, transport) : pino(pinoOptions);

// ----------------------------------------------------------------------------
// CONTEXT-AWARE LOGGER WRAPPER
// ----------------------------------------------------------------------------

type LogLevel = "fatal" | "error" | "warn" | "info" | "debug" | "trace";

function createLogMethod(level: LogLevel) {
  return (objOrMsg: Record<string, unknown> | string, msg?: string): void => {
    const ctx = context.get();
    const contextData = ctx
      ? {
          correlationId: ctx.correlationId,
          transactionId: ctx.transactionId,
          operation: ctx.operation,
          elapsedMs: Date.now() - ctx.startTime,
          credentialHash: ctx.credentialHash,
        }
      : {};

    if (typeof objOrMsg === "string") {
      baseLogger[level]({ ...contextData }, objOrMsg);
    } else {
      baseLogger[level]({ ...contextData, ...objOrMsg }, msg || "");
    }
  };
}

// ----------------------------------------------------------------------------
// LOGGER EXPORT
// ----------------------------------------------------------------------------

export const logger = {
  fatal: createLogMethod("fatal"),
  error: createLogMethod("error"),
  warn: createLogMethod("warn"),
  info: createLogMethod("info"),
  debug: createLogMethod("debug"),
  trace: createLogMethod("trace"),

  /**
   * Create a child logger with additional bindings
   */
  child(bindings: Record<string, unknown>) {
    return baseLogger.child(bindings);
  },

  /**
   * Log an NDC transaction with structured data
   */
  ndcTransaction(data: {
    operation: string;
    success: boolean;
    duration: number;
    requestSize?: number;
    responseSize?: number;
    errorCode?: string;
    errorMessage?: string;
    credentialHash?: string;
  }) {
    const ctx = context.get();
    const logData = {
      ...data,
      correlationId: ctx?.correlationId,
      transactionId: ctx?.transactionId,
      type: "ndc_transaction",
    };

    if (data.success) {
      baseLogger.info(logData, `NDC ${data.operation} completed successfully`);
    } else {
      baseLogger.error(logData, `NDC ${data.operation} failed: ${data.errorMessage || "Unknown error"}`);
    }
  },

  /**
   * Log an HTTP request with timing
   */
  httpRequest(data: {
    method: string;
    url: string;
    statusCode: number;
    duration: number;
    contentLength?: number;
    userAgent?: string;
    clientIp?: string;
  }) {
    const ctx = context.get();
    const logData = {
      ...data,
      correlationId: ctx?.correlationId,
      type: "http_request",
    };

    const level: LogLevel =
      data.statusCode >= 500 ? "error" : data.statusCode >= 400 ? "warn" : "info";
    baseLogger[level](logData, `${data.method} ${data.url} ${data.statusCode} ${data.duration}ms`);
  },

  /**
   * Log token lifecycle events
   */
  tokenEvent(data: {
    event: "created" | "expired" | "expiring_soon" | "cleared" | "refreshed";
    credentialHash: string;
    expiresIn?: number;
  }) {
    const ctx = context.get();
    const logData = {
      ...data,
      correlationId: ctx?.correlationId,
      type: "token_lifecycle",
    };

    const level: LogLevel = data.event === "expired" ? "warn" : "info";
    baseLogger[level](logData, `Token ${data.event} for ${data.credentialHash}`);
  },
};

export type Logger = typeof logger;