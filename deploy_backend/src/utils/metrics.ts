// ============================================================================
// METRICS COLLECTION - FIXED
// Simple metrics tracking for observability with correct API
// ============================================================================

import { config } from "../config/index.js";

// ----------------------------------------------------------------------------
// METRIC TYPES
// ----------------------------------------------------------------------------

interface Counter {
  value: number;
  labels: Map<string, number>;
}

interface Histogram {
  count: number;
  sum: number;
  buckets: Map<number, number>;
  labels: Map<string, { count: number; sum: number }>;
}

interface Gauge {
  value: number;
  labels: Map<string, number>;
}

// ----------------------------------------------------------------------------
// METRICS STORAGE
// ----------------------------------------------------------------------------

const counters = new Map<string, Counter>();
const histograms = new Map<string, Histogram>();
const gauges = new Map<string, Gauge>();

const DEFAULT_BUCKETS = [0.01, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10, 30, 60];

// ----------------------------------------------------------------------------
// METRICS HELPER FUNCTIONS
// ----------------------------------------------------------------------------

function getOrCreateCounter(name: string): Counter {
  let counter = counters.get(name);
  if (!counter) {
    counter = { value: 0, labels: new Map() };
    counters.set(name, counter);
  }
  return counter;
}

function getOrCreateHistogram(name: string): Histogram {
  let histogram = histograms.get(name);
  if (!histogram) {
    histogram = {
      count: 0,
      sum: 0,
      buckets: new Map(DEFAULT_BUCKETS.map((b) => [b, 0])),
      labels: new Map(),
    };
    histograms.set(name, histogram);
  }
  return histogram;
}

function getOrCreateGauge(name: string): Gauge {
  let gauge = gauges.get(name);
  if (!gauge) {
    gauge = { value: 0, labels: new Map() };
    gauges.set(name, gauge);
  }
  return gauge;
}

function labelKey(labels: Record<string, string>): string {
  return Object.entries(labels)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${k}="${v}"`)
    .join(",");
}

// ----------------------------------------------------------------------------
// LABELED COUNTER HELPER - FIXED: For token cache hits etc.
// ----------------------------------------------------------------------------

function createLabeledCounter(name: string) {
  return {
    labels: (labelValue: string) => ({
      inc: (value = 1) => {
        const counter = getOrCreateCounter(name);
        const key = `action="${labelValue}"`;
        counter.labels.set(key, (counter.labels.get(key) || 0) + value);
        counter.value += value;
      }
    })
  };
}

// ----------------------------------------------------------------------------
// METRICS API - FIXED
// ----------------------------------------------------------------------------

export const metrics = {
  /**
   * Increment a counter
   */
  incCounter(name: string, labels?: Record<string, string>, value = 1): void {
    if (!config.metrics.enabled) return;

    const counter = getOrCreateCounter(name);
    counter.value += value;

    if (labels) {
      const key = labelKey(labels);
      counter.labels.set(key, (counter.labels.get(key) || 0) + value);
    }
  },

  /**
   * Record a histogram observation
   */
  observeHistogram(name: string, value: number, labels?: Record<string, string>): void {
    if (!config.metrics.enabled) return;

    const histogram = getOrCreateHistogram(name);
    histogram.count++;
    histogram.sum += value;

    // Update buckets
    for (const bucket of DEFAULT_BUCKETS) {
      if (value <= bucket) {
        histogram.buckets.set(bucket, (histogram.buckets.get(bucket) || 0) + 1);
      }
    }

    if (labels) {
      const key = labelKey(labels);
      const existing = histogram.labels.get(key) || { count: 0, sum: 0 };
      existing.count++;
      existing.sum += value;
      histogram.labels.set(key, existing);
    }
  },

  /**
   * Set a gauge value
   */
  setGauge(name: string, value: number, labels?: Record<string, string>): void {
    if (!config.metrics.enabled) return;

    const gauge = getOrCreateGauge(name);
    gauge.value = value;

    if (labels) {
      const key = labelKey(labels);
      gauge.labels.set(key, value);
    }
  },

  /**
   * Increment a gauge
   */
  incGauge(name: string, labels?: Record<string, string>, value = 1): void {
    if (!config.metrics.enabled) return;

    const gauge = getOrCreateGauge(name);
    gauge.value += value;

    if (labels) {
      const key = labelKey(labels);
      gauge.labels.set(key, (gauge.labels.get(key) || 0) + value);
    }
  },

  /**
   * Decrement a gauge
   */
  decGauge(name: string, labels?: Record<string, string>, value = 1): void {
    this.incGauge(name, labels, -value);
  },

  // --------------------------------------------------------------------------
  // LABELED COUNTERS - FIXED: For services that expect .labels().inc()
  // --------------------------------------------------------------------------
  
  tokenCacheHits: createLabeledCounter("token_cache_hits"),
  circuitBreakerOperations: createLabeledCounter("circuit_breaker_operations"),
  circuitBreakerTrips: createLabeledCounter("circuit_breaker_trips"),
  retryAttempts: createLabeledCounter("retry_attempts"),
  
  // Gauge with set method
  tokenCacheSize: {
    set: (value: number) => {
      const gauge = getOrCreateGauge("token_cache_size");
      gauge.value = value;
    }
  },

  // --------------------------------------------------------------------------
  // CONVENIENCE METHODS
  // --------------------------------------------------------------------------

  /**
   * Record HTTP request metrics
   */
  recordHttpRequest(method: string, route: string, statusCode: number, duration: number): void {
    const labels = { method, route, status: String(statusCode) };
    this.incCounter("http_requests_total", labels);
    this.observeHistogram("http_request_duration_seconds", duration / 1000, labels);
  },

  /**
   * Record NDC request metrics
   */
  recordNdcRequest(operation: string, success: boolean, duration: number, errorCode?: string): void {
    const labels = { operation, success: String(success) };
    this.incCounter("ndc_requests_total", labels);
    this.observeHistogram("ndc_request_duration_seconds", duration / 1000, { operation });

    if (!success && errorCode) {
      this.incCounter("ndc_errors_total", { operation, error_code: errorCode });
    }
  },

  /**
   * Record NDC operation - alias for recordNdcRequest
   */
  recordNdcOperation(operation: string, result: "success" | "error", duration: number): void {
    this.recordNdcRequest(operation, result === "success", duration);
  },

  /**
   * Record booking metrics
   */
  recordBooking(status: "success" | "failed", value?: number): void {
    this.incCounter("bookings_total", { status });
    if (value && status === "success") {
      this.observeHistogram("booking_value_aud", value);
    }
  },

  /**
   * Record circuit breaker state
   */
  recordCircuitBreakerState(name: string, state: "closed" | "open" | "half_open"): void {
    const stateValue = state === "closed" ? 0 : state === "open" ? 1 : 0.5;
    this.setGauge("circuit_breaker_state", stateValue, { circuit: name });
  },

  /**
   * Record token cache metrics
   */
  recordTokenCache(action: "hit" | "miss" | "expired" | "created"): void {
    this.incCounter("token_cache_operations_total", { action });
  },

  /**
   * Track in-flight requests
   */
  httpRequestsInFlight: {
    inc(): void {
      metrics.incGauge("http_requests_in_flight");
    },
    dec(): void {
      metrics.decGauge("http_requests_in_flight");
    },
  },

  // --------------------------------------------------------------------------
  // EXPORT METHODS
  // --------------------------------------------------------------------------

  /**
   * Get metrics in Prometheus text format
   */
  async getMetrics(): Promise<string> {
    const lines: string[] = [];

    // Counters
    for (const [name, counter] of counters) {
      lines.push(`# TYPE ${name} counter`);
      if (counter.labels.size === 0) {
        lines.push(`${name} ${counter.value}`);
      } else {
        for (const [labelStr, value] of counter.labels) {
          lines.push(`${name}{${labelStr}} ${value}`);
        }
      }
    }

    // Histograms
    for (const [name, histogram] of histograms) {
      lines.push(`# TYPE ${name} histogram`);
      for (const [bucket, count] of histogram.buckets) {
        lines.push(`${name}_bucket{le="${bucket}"} ${count}`);
      }
      lines.push(`${name}_bucket{le="+Inf"} ${histogram.count}`);
      lines.push(`${name}_sum ${histogram.sum}`);
      lines.push(`${name}_count ${histogram.count}`);
    }

    // Gauges
    for (const [name, gauge] of gauges) {
      lines.push(`# TYPE ${name} gauge`);
      if (gauge.labels.size === 0) {
        lines.push(`${name} ${gauge.value}`);
      } else {
        for (const [labelStr, value] of gauge.labels) {
          lines.push(`${name}{${labelStr}} ${value}`);
        }
      }
    }

    return lines.join("\n");
  },

  /**
   * Get content type for metrics endpoint
   */
  getContentType(): string {
    return "text/plain; version=0.0.4; charset=utf-8";
  },

  /**
   * Reset all metrics (for testing)
   */
  reset(): void {
    counters.clear();
    histograms.clear();
    gauges.clear();
  },
};