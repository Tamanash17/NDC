// ============================================================================
// HTTP CLIENT SERVICE - FIXED
// Axios-based HTTP client with interceptors and resilience
// ============================================================================

import axios, { AxiosInstance, AxiosRequestConfig, AxiosResponse, AxiosError } from "axios";
import { logger } from "../utils/logger.js";
import { metrics } from "../utils/metrics.js";
import { context } from "../utils/context.js";
import { NDCConnectionError, NDCTimeoutError } from "../errors/index.js";

export interface HttpClientConfig {
  baseURL: string;
  timeout: number;
  headers?: Record<string, string>;
}

// Extend AxiosRequestConfig to include metadata
declare module "axios" {
  export interface InternalAxiosRequestConfig {
    metadata?: {
      startTime: number;
    };
  }
}

export class HttpClientService {
  private readonly client: AxiosInstance;
  private readonly serviceName: string;

  constructor(clientConfig: HttpClientConfig, serviceName: string = "http-client") {
    this.serviceName = serviceName;
    this.client = axios.create({
      baseURL: clientConfig.baseURL,
      timeout: clientConfig.timeout,
      headers: {
        "Content-Type": "application/xml",
        Accept: "application/xml",
        ...clientConfig.headers,
      },
    });

    this.setupInterceptors();
  }

  private setupInterceptors(): void {
    // Request interceptor
    this.client.interceptors.request.use(
      (reqConfig) => {
        const ctx = context.get();
        
        // Add correlation headers
        if (ctx?.correlationId) {
          reqConfig.headers["X-Correlation-ID"] = ctx.correlationId;
        }
        if (ctx?.transactionId) {
          reqConfig.headers["X-Request-ID"] = ctx.transactionId;
        }

        // Add start time metadata
        reqConfig.metadata = { startTime: Date.now() };

        logger.debug(
          {
            type: "http_request",
            method: reqConfig.method?.toUpperCase(),
            url: reqConfig.url,
            baseURL: reqConfig.baseURL,
            correlationId: ctx?.correlationId,
          },
          "HTTP request starting"
        );

        return reqConfig;
      },
      (error) => {
        logger.error({ error: error.message }, "HTTP request interceptor error");
        return Promise.reject(error);
      }
    );

    // Response interceptor
    this.client.interceptors.response.use(
      (response) => {
        const ctx = context.get();
        const duration = response.config.metadata?.startTime
          ? Date.now() - response.config.metadata.startTime
          : 0;

        logger.debug(
          {
            type: "http_response",
            status: response.status,
            duration,
            correlationId: ctx?.correlationId,
          },
          "HTTP response received"
        );

        return response;
      },
      (error: AxiosError) => {
        return this.handleError(error);
      }
    );
  }

  private handleError(error: AxiosError): Promise<never> {
    const ctx = context.get();

    if (error.code === "ECONNABORTED" || error.message.includes("timeout")) {
      logger.error(
        {
          type: "http_timeout",
          url: error.config?.url,
          timeout: error.config?.timeout,
          correlationId: ctx?.correlationId,
        },
        "HTTP request timed out"
      );
      return Promise.reject(
        new NDCTimeoutError(error.config?.url || "unknown", error.config?.timeout || 0)
      );
    }

    if (!error.response) {
      logger.error(
        {
          type: "http_connection_error",
          url: error.config?.url,
          code: error.code,
          message: error.message,
          correlationId: ctx?.correlationId,
        },
        "HTTP connection error"
      );
      return Promise.reject(new NDCConnectionError(error.message));
    }

    logger.error(
      {
        type: "http_error",
        status: error.response.status,
        url: error.config?.url,
        correlationId: ctx?.correlationId,
      },
      "HTTP request failed"
    );

    return Promise.reject(error);
  }

  async post<T = string>(
    url: string,
    data: string,
    additionalConfig?: Partial<AxiosRequestConfig>
  ): Promise<AxiosResponse<T>> {
    const startTime = Date.now();
    
    try {
      const response = await this.client.post<T>(url, data, additionalConfig);

      metrics.recordHttpRequest(
        "POST",
        url,
        response.status,
        Date.now() - startTime
      );

      return response;
    } catch (error) {
      metrics.recordHttpRequest(
        "POST",
        url,
        (error as AxiosError).response?.status || 0,
        Date.now() - startTime
      );
      throw error;
    }
  }

  async get<T = string>(
    url: string,
    additionalConfig?: Partial<AxiosRequestConfig>
  ): Promise<AxiosResponse<T>> {
    const startTime = Date.now();

    try {
      const response = await this.client.get<T>(url, additionalConfig);

      metrics.recordHttpRequest(
        "GET",
        url,
        response.status,
        Date.now() - startTime
      );

      return response;
    } catch (error) {
      metrics.recordHttpRequest(
        "GET",
        url,
        (error as AxiosError).response?.status || 0,
        Date.now() - startTime
      );
      throw error;
    }
  }

  updateHeaders(headers: Record<string, string>): void {
    Object.assign(this.client.defaults.headers, headers);
  }
}