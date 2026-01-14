// ============================================================================
// RETRY SERVICE
// Exponential backoff retry with jitter
// ============================================================================

import { logger } from "../utils/logger.js";
import { metrics } from "../utils/metrics.js";
import { context } from "../utils/context.js";

export interface RetryConfig {
  maxAttempts: number;
  baseDelayMs: number;
  maxDelayMs: number;
  backoffMultiplier: number;
  jitterFactor: number;
  retryableErrors?: string[];
  retryableStatusCodes?: number[];
}

const DEFAULT_CONFIG: RetryConfig = {
  maxAttempts: 3,
  baseDelayMs: 1000,
  maxDelayMs: 30000,
  backoffMultiplier: 2,
  jitterFactor: 0.3,
  retryableErrors: ["ECONNRESET", "ETIMEDOUT", "ENOTFOUND", "ECONNREFUSED"],
  retryableStatusCodes: [408, 429, 500, 502, 503, 504],
};

export class RetryService {
  private readonly config: RetryConfig;

  constructor(config: Partial<RetryConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  async execute<T>(
    operation: () => Promise<T>,
    operationName: string = "operation"
  ): Promise<T> {
    let lastError: Error | undefined;
    const ctx = context.get();

    for (let attempt = 1; attempt <= this.config.maxAttempts; attempt++) {
      try {
        const result = await operation();
        if (attempt > 1) {
          logger.info(
            { operationName, attempt, correlationId: ctx?.correlationId },
            "Retry succeeded"
          );
        }
        return result;
      } catch (error) {
        lastError = error as Error;

        if (!this.isRetryable(error as Error) || attempt === this.config.maxAttempts) {
          logger.error(
            {
              operationName,
              attempt,
              maxAttempts: this.config.maxAttempts,
              error: (error as Error).message,
              correlationId: ctx?.correlationId,
            },
            "Operation failed, no more retries"
          );
          throw error;
        }

        const delay = this.calculateDelay(attempt);
        metrics.retryAttempts.labels(attempt.toString()).inc();

        logger.warn(
          {
            operationName,
            attempt,
            maxAttempts: this.config.maxAttempts,
            nextRetryMs: delay,
            error: (error as Error).message,
            correlationId: ctx?.correlationId,
          },
          "Operation failed, retrying"
        );

        await this.sleep(delay);
      }
    }

    throw lastError;
  }

  private isRetryable(error: Error): boolean {
    // Check error code
    const errorCode = (error as NodeJS.ErrnoException).code;
    if (errorCode && this.config.retryableErrors?.includes(errorCode)) {
      return true;
    }

    // Check for status code in error
    const statusCode = (error as Error & { statusCode?: number }).statusCode;
    if (statusCode && this.config.retryableStatusCodes?.includes(statusCode)) {
      return true;
    }

    // Check error message for common retryable patterns
    const retryablePatterns = [
      /timeout/i,
      /ECONNRESET/i,
      /ETIMEDOUT/i,
      /socket hang up/i,
      /network/i,
      /rate limit/i,
    ];

    return retryablePatterns.some((pattern) => pattern.test(error.message));
  }

  private calculateDelay(attempt: number): number {
    // Exponential backoff
    const exponentialDelay =
      this.config.baseDelayMs * Math.pow(this.config.backoffMultiplier, attempt - 1);

    // Cap at max delay
    const cappedDelay = Math.min(exponentialDelay, this.config.maxDelayMs);

    // Add jitter
    const jitter = cappedDelay * this.config.jitterFactor * Math.random();
    return Math.floor(cappedDelay + jitter);
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

// Default retry service instance
export const retryService = new RetryService();

// Helper for one-off retries
export async function withRetry<T>(
  operation: () => Promise<T>,
  operationName?: string,
  config?: Partial<RetryConfig>
): Promise<T> {
  const service = config ? new RetryService(config) : retryService;
  return service.execute(operation, operationName);
}