// ============================================================================
// CIRCUIT BREAKER SERVICE
// Prevents cascading failures with automatic recovery
// ============================================================================

import { EventEmitter } from "events";
import { logger } from "../utils/logger.js";
import { metrics } from "../utils/metrics.js";
import { CircuitBreakerOpenError } from "../errors/index.js";

export type CircuitState = "CLOSED" | "OPEN" | "HALF_OPEN";

export interface CircuitBreakerConfig {
  name: string;
  failureThreshold: number;
  successThreshold: number;
  timeout: number;
  resetTimeout: number;
}

const DEFAULT_CONFIG: Omit<CircuitBreakerConfig, "name"> = {
  failureThreshold: 5,
  successThreshold: 2,
  timeout: 30000,
  resetTimeout: 60000,
};

export class CircuitBreaker extends EventEmitter {
  private state: CircuitState = "CLOSED";
  private failureCount = 0;
  private successCount = 0;
  private lastFailureTime?: Date;
  private resetTimer?: NodeJS.Timeout;
  private readonly config: CircuitBreakerConfig;

  constructor(config: Partial<CircuitBreakerConfig> & { name: string }) {
    super();
    this.config = { ...DEFAULT_CONFIG, ...config };
    logger.info({ name: this.config.name }, "Circuit breaker initialized");
  }

  get currentState(): CircuitState {
    return this.state;
  }

  get name(): string {
    return this.config.name;
  }

  async execute<T>(operation: () => Promise<T>): Promise<T> {
    if (this.state === "OPEN") {
      const now = Date.now();
      const lastFail = this.lastFailureTime?.getTime() || 0;
      const remainingTime = this.config.resetTimeout - (now - lastFail);

      if (remainingTime > 0) {
        metrics.circuitBreakerOperations.labels("rejected").inc();
        throw new CircuitBreakerOpenError(this.config.name, remainingTime);
      }

      // Transition to half-open
      this.transitionTo("HALF_OPEN");
    }

    try {
      const result = await this.executeWithTimeout(operation);
      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure(error as Error);
      throw error;
    }
  }

  private async executeWithTimeout<T>(operation: () => Promise<T>): Promise<T> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new Error(`Operation timed out after ${this.config.timeout}ms`));
      }, this.config.timeout);

      operation()
        .then((result) => {
          clearTimeout(timer);
          resolve(result);
        })
        .catch((error) => {
          clearTimeout(timer);
          reject(error);
        });
    });
  }

  private onSuccess(): void {
    metrics.circuitBreakerOperations.labels("success").inc();

    if (this.state === "HALF_OPEN") {
      this.successCount++;
      if (this.successCount >= this.config.successThreshold) {
        this.transitionTo("CLOSED");
      }
    } else {
      this.failureCount = 0;
    }
  }

  private onFailure(error: Error): void {
    this.lastFailureTime = new Date();
    metrics.circuitBreakerOperations.labels("failure").inc();

    if (this.state === "HALF_OPEN") {
      this.transitionTo("OPEN");
      return;
    }

    this.failureCount++;
    logger.warn(
      {
        name: this.config.name,
        failureCount: this.failureCount,
        threshold: this.config.failureThreshold,
        error: error.message,
      },
      "Circuit breaker recorded failure"
    );

    if (this.failureCount >= this.config.failureThreshold) {
      this.transitionTo("OPEN");
    }
  }

  private transitionTo(newState: CircuitState): void {
    const oldState = this.state;
    this.state = newState;

    if (this.resetTimer) {
      clearTimeout(this.resetTimer);
      this.resetTimer = undefined;
    }

    switch (newState) {
      case "CLOSED":
        this.failureCount = 0;
        this.successCount = 0;
        break;
      case "OPEN":
        metrics.circuitBreakerTrips.labels(this.config.name).inc();
        this.resetTimer = setTimeout(() => {
          this.transitionTo("HALF_OPEN");
        }, this.config.resetTimeout);
        break;
      case "HALF_OPEN":
        this.successCount = 0;
        break;
    }

    logger.info(
      { name: this.config.name, from: oldState, to: newState },
      "Circuit breaker state changed"
    );

    this.emit("stateChange", { from: oldState, to: newState });
  }

  reset(): void {
    this.transitionTo("CLOSED");
  }

  getStats() {
    return {
      name: this.config.name,
      state: this.state,
      failureCount: this.failureCount,
      successCount: this.successCount,
      lastFailureTime: this.lastFailureTime?.toISOString(),
    };
  }
}

// Singleton instances for different services
const circuitBreakers = new Map<string, CircuitBreaker>();

export function getCircuitBreaker(name: string, config?: Partial<CircuitBreakerConfig>): CircuitBreaker {
  if (!circuitBreakers.has(name)) {
    circuitBreakers.set(name, new CircuitBreaker({ name, ...config }));
  }
  return circuitBreakers.get(name)!;
}

export function getAllCircuitBreakerStats() {
  const stats: Record<string, ReturnType<CircuitBreaker["getStats"]>> = {};
  for (const [name, breaker] of circuitBreakers) {
    stats[name] = breaker.getStats();
  }
  return stats;
}