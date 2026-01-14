// ============================================================================
// NDC CLIENT SERVICE - FIXED
// Main service for NDC API communication with token management
// ============================================================================

import axios from "axios";
import { config } from "../config/index.js";
import { CircuitBreaker, getCircuitBreaker } from "./circuit-breaker.service.js";
import { RetryService } from "./retry.service.js";
import { tokenCache } from "./token-cache.service.js";
import { authService } from "./auth.service.js";
import { xmlTransactionLogger } from "../utils/xml-logger.js";
import { logger } from "../utils/logger.js";
import { metrics } from "../utils/metrics.js";
import { context } from "../utils/context.js";
import type { NDCCredentials, NDCOperation, TokenInfo } from "../types/ndc.types.js";
import { NDCApiError, NDCAuthError } from "../errors/index.js";

export interface NDCCallOptions {
  credentials: NDCCredentials;
  operation: NDCOperation;
  xmlRequest: string;
  skipCache?: boolean;
}

export interface NDCCallResult {
  xmlResponse: string;
  tokenInfo: TokenInfo;
  duration: number;
}

class NDCClientService {
  private readonly circuitBreaker: CircuitBreaker;
  private readonly retryService: RetryService;

  constructor() {
    this.circuitBreaker = getCircuitBreaker("ndc-api", {
      failureThreshold: 5,
      successThreshold: 2,
      timeout: config.ndc.requestTimeout,
      resetTimeout: 60000,
    });

    this.retryService = new RetryService({
      maxAttempts: config.resilience.retry.maxAttempts,
      baseDelayMs: config.resilience.retry.initialDelay,
      maxDelayMs: config.resilience.retry.maxDelay,
    });
  }

  /**
   * Execute an NDC API call
   */
  async call(options: NDCCallOptions): Promise<NDCCallResult> {
    const { credentials, operation, xmlRequest } = options;
    const ctx = context.get();
    const startTime = Date.now();

    // Get endpoint URL - NDC operations use baseUrl
    const endpoint = this.getEndpoint(operation);
    const url = `${config.ndc.baseUrl}${endpoint}`;

    // Build auth header
    const authString = `${credentials.domain}\\${credentials.apiId}:${credentials.password}`;
    const authHeader = `Basic ${Buffer.from(authString).toString("base64")}`;

    // Log the request
    xmlTransactionLogger.logRequest(operation, xmlRequest, {
      credentialHash: ctx?.credentialHash,
    });

    try {
      // Execute with circuit breaker and retry
      const response = await this.circuitBreaker.execute(() =>
        this.retryService.execute(
          async () => {
            const resp = await axios.post(url, xmlRequest, {
              headers: {
                Authorization: authHeader,
                "Ocp-Apim-Subscription-Key": credentials.subscriptionKey,
                "Content-Type": "application/xml",
                Accept: "application/xml",
                ...(config.app.isDev ? { "X-NDC-UAT": config.ndc.uatHeader } : {}),
              },
              timeout: config.ndc.requestTimeout,
            });
            return resp;
          },
          operation
        )
      );

      const duration = Date.now() - startTime;
      const xmlResponse = response.data;

      // Log the response
      xmlTransactionLogger.logResponse(operation, xmlResponse, duration, {
        status: response.status,
        credentialHash: ctx?.credentialHash,
      });

      // Log transaction for audit
      await xmlTransactionLogger.logTransaction({
        operation,
        requestXml: xmlRequest,
        responseXml: xmlResponse,
        success: true,
        duration,
      });

      // Record metrics
      metrics.recordNdcOperation(operation, "success", duration);

      // Check for NDC-level errors in response
      this.checkForNDCErrors(xmlResponse, operation);

      // Get token info
      const tokenInfo = tokenCache.getTokenInfo(credentials) || {
        status: "VALID" as const,
        expiresIn: 0,
        expiresAt: new Date().toISOString(),
        credentialHash: ctx?.credentialHash || "unknown",
      };

      return {
        xmlResponse,
        tokenInfo,
        duration,
      };
    } catch (error) {
      const duration = Date.now() - startTime;

      // Log error
      xmlTransactionLogger.logError(operation, error as Error, {
        duration,
        credentialHash: ctx?.credentialHash,
      });

      // Log transaction for audit
      await xmlTransactionLogger.logTransaction({
        operation,
        requestXml: xmlRequest,
        responseXml: (error as Error).message,
        success: false,
        duration,
        errorCode: (error as NDCApiError).code,
        errorMessage: (error as Error).message,
      });

      // Record metrics
      metrics.recordNdcOperation(operation, "error", duration);

      // Re-throw with context
      throw error;
    }
  }

  /**
   * Get endpoint path for operation
   */
  private getEndpoint(operation: NDCOperation): string {
    const endpoints: Record<NDCOperation, string> = {
      Auth: config.ndc.endpoints.auth,
      AirShopping: config.ndc.endpoints.airShopping,
      OfferPrice: config.ndc.endpoints.offerPrice,
      ServiceList: config.ndc.endpoints.serviceList,
      SeatAvailability: config.ndc.endpoints.seatAvailability,
      OrderCreate: config.ndc.endpoints.orderCreate,
      OrderRetrieve: config.ndc.endpoints.orderRetrieve,
      OrderReshop: config.ndc.endpoints.orderReshop,
      OrderQuote: config.ndc.endpoints.orderQuote,
      OrderChange: config.ndc.endpoints.orderChange,
    };

    return endpoints[operation] || "";
  }

  /**
   * Check XML response for NDC-level errors
   */
  private checkForNDCErrors(xmlResponse: string, operation: NDCOperation): void {
    // Simple check for error elements
    if (xmlResponse.includes("<Errors>") || xmlResponse.includes("<Error ")) {
      // Extract error details (basic regex, could be enhanced with proper parsing)
      const errorMatch = xmlResponse.match(/<Error[^>]*>[\s\S]*?<\/Error>/);
      const descMatch = xmlResponse.match(/<Description>(.*?)<\/Description>/);

      const errorMessage = descMatch?.[1] || "NDC API returned an error";

      logger.warn(
        {
          operation,
          hasErrors: true,
          errorSnippet: errorMatch?.[0]?.substring(0, 200),
        },
        "NDC response contains errors"
      );

      // Note: We don't throw here by default - let the parser handle it
      // This allows partial responses with warnings to still be processed
    }
  }

  /**
   * Get circuit breaker and token cache status
   */
  getStatus() {
    return {
      circuitBreaker: this.circuitBreaker.getStats(),
      tokenCache: tokenCache.getStats(),
    };
  }
}

export const ndcClient = new NDCClientService();