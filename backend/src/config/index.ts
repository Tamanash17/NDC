// ============================================================================
// CONFIGURATION MODULE - FIXED
// Centralized, typed, validated configuration with environment variable support
// ============================================================================

import { z } from "zod";
import dotenv from "dotenv";

dotenv.config();

// ----------------------------------------------------------------------------
// ENVIRONMENT SCHEMA - FIXED: Added NDC_AUTH_URL
// ----------------------------------------------------------------------------

const envSchema = z.object({
  // Application
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  PORT: z.coerce.number().default(3001),
  APP_NAME: z.string().default("ndc-backend-enterprise"),
  APP_VERSION: z.string().default("3.1.0"),
  LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace"]).default("info"),
  PRETTY_LOGS: z.coerce.boolean().default(false),

  // NDC Gateway - UAT Environment
  NDC_UAT_BASE_URL: z.string().url().default("https://ndc-api-uat.jetstar.com/ndc"),
  NDC_UAT_AUTH_URL: z.string().url().default("https://ndc-api-uat.jetstar.com/jq/ndc/api"),
  NDC_UAT_HEADER: z.string().default("Jetstar3.12"),

  // NDC Gateway - PROD Environment
  NDC_PROD_BASE_URL: z.string().url().default("https://ndc-api-prod.jetstar.com/ndc"),
  NDC_PROD_AUTH_URL: z.string().url().default("https://ndc-api-prod.jetstar.com/jq/ndc/api"),
  NDC_PROD_HEADER: z.string().default("Jet$tar3.x"),

  // Default NDC Environment (can be overridden at runtime)
  NDC_DEFAULT_ENV: z.enum(["UAT", "PROD"]).default("UAT"),

  // Token Lifecycle
  TOKEN_DEFAULT_VALIDITY_MS: z.coerce.number().default(1800000),
  TOKEN_EXPIRY_WARNING_MS: z.coerce.number().default(300000),
  TOKEN_HARD_EXPIRY_BUFFER_MS: z.coerce.number().default(30000),
  TOKEN_CLEANUP_INTERVAL_MS: z.coerce.number().default(300000),

  // Distribution Chain Defaults (fallback only - user should provide via UI)
  DEFAULT_OWNER_CODE: z.string().length(2).default("JQ"),
  DEFAULT_ORG_CODE: z.string().default(""),
  DEFAULT_ORG_NAME: z.string().default(""),
  DEFAULT_ORG_ROLE: z.string().default("Seller"),
  DEFAULT_COUNTRY_CODE: z.string().length(2).default("AU"),
  DEFAULT_CITY_CODE: z.string().length(3).default("MEL"),
  // Distribution Chain Defaults (Distributor) - should come from user input
  DEFAULT_DISTRIBUTOR_ORG_CODE: z.string().default(""),
  DEFAULT_DISTRIBUTOR_ORG_NAME: z.string().default(""),

  // Circuit Breaker
  CIRCUIT_BREAKER_TIMEOUT: z.coerce.number().default(30000),
  CIRCUIT_BREAKER_ERROR_THRESHOLD: z.coerce.number().min(1).max(100).default(50),
  CIRCUIT_BREAKER_RESET_TIMEOUT: z.coerce.number().default(30000),
  CIRCUIT_BREAKER_VOLUME_THRESHOLD: z.coerce.number().default(5),

  // Retry Policy
  RETRY_MAX_ATTEMPTS: z.coerce.number().min(1).max(10).default(3),
  RETRY_INITIAL_DELAY: z.coerce.number().default(1000),
  RETRY_MAX_DELAY: z.coerce.number().default(10000),
  RETRY_BACKOFF_FACTOR: z.coerce.number().default(2),

  // Rate Limiting
  RATE_LIMIT_WINDOW_MS: z.coerce.number().default(60000),
  RATE_LIMIT_MAX_REQUESTS: z.coerce.number().default(100),
  RATE_LIMIT_NDC_MAX: z.coerce.number().default(30),
  RATE_LIMIT_STRICT_MAX: z.coerce.number().default(10),

  // Timeouts
  REQUEST_TIMEOUT_MS: z.coerce.number().default(60000),
  KEEP_ALIVE_TIMEOUT_MS: z.coerce.number().default(65000),
  NDC_REQUEST_TIMEOUT_MS: z.coerce.number().default(45000),

  // Observability
  ENABLE_METRICS: z.coerce.boolean().default(true),
  METRICS_PATH: z.string().default("/metrics"),
  ENABLE_REQUEST_LOGGING: z.coerce.boolean().default(true),
  ENABLE_XML_LOGGING: z.coerce.boolean().default(true),
  XML_LOG_DIR: z.string().default("./logs/xml"),
  XML_LOG_RETENTION_DAYS: z.coerce.number().default(7),
  MASK_SENSITIVE_DATA: z.coerce.boolean().default(true),

  // Security
  CORS_ORIGINS: z.string().default("http://localhost:5173,https://dist-rho-nine-77.vercel.app,https://*.vercel.app"),
  TRUST_PROXY: z.coerce.boolean().default(false),
});

// ----------------------------------------------------------------------------
// PARSE AND VALIDATE
// ----------------------------------------------------------------------------

function loadConfig() {
  const result = envSchema.safeParse(process.env);

  if (!result.success) {
    console.error("[x] Invalid environment configuration:");
    console.error(result.error.format());
    process.exit(1);
  }

  return result.data;
}

const env = loadConfig();

// ----------------------------------------------------------------------------
// STRUCTURED CONFIG EXPORT - FIXED: Separate Auth URL
// ----------------------------------------------------------------------------

// ----------------------------------------------------------------------------
// RUNTIME ENVIRONMENT STATE
// ----------------------------------------------------------------------------

export type NDCEnvironment = "UAT" | "PROD";

// Runtime state for current NDC environment (can be changed without restart)
let currentNdcEnv: NDCEnvironment = env.NDC_DEFAULT_ENV;

// Environment-specific configurations
const ndcEnvConfigs = {
  UAT: {
    baseUrl: env.NDC_UAT_BASE_URL,
    authUrl: env.NDC_UAT_AUTH_URL,
    header: env.NDC_UAT_HEADER,
    headerName: "NDCUAT",
  },
  PROD: {
    baseUrl: env.NDC_PROD_BASE_URL,
    authUrl: env.NDC_PROD_AUTH_URL,
    header: env.NDC_PROD_HEADER,
    headerName: "NDCPROD",
  },
} as const;

/**
 * Get current NDC environment
 */
export function getNdcEnvironment(): NDCEnvironment {
  return currentNdcEnv;
}

/**
 * Set NDC environment at runtime
 */
export function setNdcEnvironment(newEnv: NDCEnvironment): void {
  currentNdcEnv = newEnv;
}

/**
 * Get NDC config for current environment
 */
export function getNdcConfig() {
  return ndcEnvConfigs[currentNdcEnv];
}

export const config = {
  app: {
    name: env.APP_NAME,
    version: env.APP_VERSION,
    env: env.NODE_ENV,
    port: env.PORT,
    isDev: env.NODE_ENV === "development",
    isProd: env.NODE_ENV === "production",
    isTest: env.NODE_ENV === "test",
  },

  logging: {
    level: env.LOG_LEVEL,
    pretty: env.PRETTY_LOGS,
    enableRequestLogging: env.ENABLE_REQUEST_LOGGING,
    enableXmlLogging: env.ENABLE_XML_LOGGING,
    xmlLogDir: env.XML_LOG_DIR,
    xmlLogRetentionDays: env.XML_LOG_RETENTION_DAYS,
    maskSensitiveData: env.MASK_SENSITIVE_DATA,
  },

  ndc: {
    // Dynamic getters that return current environment's config
    get baseUrl() { return ndcEnvConfigs[currentNdcEnv].baseUrl; },
    get authUrl() { return ndcEnvConfigs[currentNdcEnv].authUrl; },
    get envHeader() { return ndcEnvConfigs[currentNdcEnv].header; },
    get envHeaderName() { return ndcEnvConfigs[currentNdcEnv].headerName; },
    get currentEnv() { return currentNdcEnv; },
    // All environment configs for reference
    environments: ndcEnvConfigs,
    defaultEnv: env.NDC_DEFAULT_ENV,
    requestTimeout: env.NDC_REQUEST_TIMEOUT_MS,
    endpoints: {
      // Auth endpoint (uses authUrl)
      auth: "/Selling/r3.x/Auth",
      // NDC 21.3 endpoints (use baseUrl)
      airShopping: "/Shopping/r3.x/v21.3/AirShopping",
      airlineProfile: "/Shopping/r3.x/v21.3/AirlineProfile",
      offerPrice: "/Selling/r3.x/v21.3/OfferPrice",
      serviceList: "/Selling/r3.x/v21.3/ServiceList",
      seatAvailability: "/Selling/r3.x/v21.3/SeatAvailability",
      orderCreate: "/Selling/r3.x/v21.3/OrderCreate",
      orderRetrieve: "/Servicing/r3.x/v21.3/OrderRetrieve",
      orderReshop: "/Servicing/r3.x/v21.3/OrderReshop",
      orderQuote: "/Servicing/r3.x/v21.3/OrderQuote",
      orderChange: "/Servicing/r3.x/v21.3/OrderChange",
    },
  },

  token: {
    defaultValidityMs: env.TOKEN_DEFAULT_VALIDITY_MS,
    expiryWarningMs: env.TOKEN_EXPIRY_WARNING_MS,
    hardExpiryBufferMs: env.TOKEN_HARD_EXPIRY_BUFFER_MS,
    cleanupIntervalMs: env.TOKEN_CLEANUP_INTERVAL_MS,
  },

  distributionChain: {
    ownerCode: env.DEFAULT_OWNER_CODE,
    orgCode: env.DEFAULT_ORG_CODE,
    orgName: env.DEFAULT_ORG_NAME,
    orgRole: env.DEFAULT_ORG_ROLE,
    countryCode: env.DEFAULT_COUNTRY_CODE,
    cityCode: env.DEFAULT_CITY_CODE,
    distributorOrgId: env.DEFAULT_DISTRIBUTOR_ORG_CODE,
    distributorName: env.DEFAULT_DISTRIBUTOR_ORG_NAME,
  },

  resilience: {
    circuitBreaker: {
      timeout: env.CIRCUIT_BREAKER_TIMEOUT,
      errorThresholdPercentage: env.CIRCUIT_BREAKER_ERROR_THRESHOLD,
      resetTimeout: env.CIRCUIT_BREAKER_RESET_TIMEOUT,
      volumeThreshold: env.CIRCUIT_BREAKER_VOLUME_THRESHOLD,
    },
    retry: {
      maxAttempts: env.RETRY_MAX_ATTEMPTS,
      initialDelay: env.RETRY_INITIAL_DELAY,
      maxDelay: env.RETRY_MAX_DELAY,
      backoffFactor: env.RETRY_BACKOFF_FACTOR,
    },
    rateLimit: {
      windowMs: env.RATE_LIMIT_WINDOW_MS,
      maxRequests: env.RATE_LIMIT_MAX_REQUESTS,
      ndcMax: env.RATE_LIMIT_NDC_MAX,
      strictMax: env.RATE_LIMIT_STRICT_MAX,
    },
    timeouts: {
      request: env.REQUEST_TIMEOUT_MS,
      keepAlive: env.KEEP_ALIVE_TIMEOUT_MS,
    },
  },

  metrics: {
    enabled: env.ENABLE_METRICS,
    path: env.METRICS_PATH,
  },

  security: {
    corsOrigins: env.CORS_ORIGINS.split(",").map((s) => s.trim()),
    trustProxy: env.TRUST_PROXY,
  },
} as const;

export type Config = typeof config;