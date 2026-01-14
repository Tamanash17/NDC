// ============================================================================
// REQUEST CONTEXT
// Async Local Storage for request-scoped data (correlation ID, user info, etc.)
// ============================================================================

import { AsyncLocalStorage } from "async_hooks";
import { v4 as uuidv4 } from "uuid";

// ----------------------------------------------------------------------------
// CONTEXT TYPES
// ----------------------------------------------------------------------------

export interface RequestContext {
  correlationId: string;
  transactionId: string;
  operation?: string;
  startTime: number;
  clientIp?: string;
  userAgent?: string;
  userId?: string;
  credentialHash?: string;
}

// ----------------------------------------------------------------------------
// ASYNC LOCAL STORAGE INSTANCE
// ----------------------------------------------------------------------------

const asyncLocalStorage = new AsyncLocalStorage<RequestContext>();

// ----------------------------------------------------------------------------
// CONTEXT MANAGEMENT
// ----------------------------------------------------------------------------

export const context = {
  /**
   * Run a function within a request context
   */
  run<T>(ctx: Partial<RequestContext>, fn: () => T): T {
    const fullContext: RequestContext = {
      correlationId: ctx.correlationId || uuidv4(),
      transactionId: ctx.transactionId || uuidv4(),
      startTime: ctx.startTime || Date.now(),
      operation: ctx.operation,
      clientIp: ctx.clientIp,
      userAgent: ctx.userAgent,
      userId: ctx.userId,
      credentialHash: ctx.credentialHash,
    };
    return asyncLocalStorage.run(fullContext, fn);
  },

  /**
   * Get current context (may be undefined)
   */
  get(): RequestContext | undefined {
    return asyncLocalStorage.getStore();
  },

  /**
   * Get current context or throw if not available
   */
  getOrThrow(): RequestContext {
    const ctx = asyncLocalStorage.getStore();
    if (!ctx) {
      throw new Error("No request context available");
    }
    return ctx;
  },

  /**
   * Get correlation ID from current context
   */
  getCorrelationId(): string {
    return asyncLocalStorage.getStore()?.correlationId || "no-context";
  },

  /**
   * Get transaction ID from current context
   */
  getTransactionId(): string {
    return asyncLocalStorage.getStore()?.transactionId || "no-context";
  },

  /**
   * Get elapsed time since request start
   */
  getElapsedMs(): number {
    const ctx = asyncLocalStorage.getStore();
    return ctx ? Date.now() - ctx.startTime : 0;
  },

  /**
   * Update context with new values
   */
  update(updates: Partial<RequestContext>): void {
    const ctx = asyncLocalStorage.getStore();
    if (ctx) {
      Object.assign(ctx, updates);
    }
  },

  /**
   * Set the current operation name
   */
  setOperation(operation: string): void {
    this.update({ operation });
  },

  /**
   * Generate a new transaction ID for sub-operations
   */
  newTransaction(): string {
    const transactionId = uuidv4();
    this.update({ transactionId });
    return transactionId;
  },

  /**
   * Set credential hash for multi-tenant tracking
   */
  setCredentialHash(hash: string): void {
    this.update({ credentialHash: hash });
  },
};

export type { AsyncLocalStorage };