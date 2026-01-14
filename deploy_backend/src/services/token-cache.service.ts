// ============================================================================
// TOKEN CACHE SERVICE
// Multi-tenant token caching with automatic expiration
// ============================================================================

import { logger } from "../utils/logger.js";
import { metrics } from "../utils/metrics.js";
import { config } from "../config/index.js";
import type { NDCCredentials, TokenInfo, AuthToken } from "../types/ndc.types.js";
import { hashCredentials } from "../middleware/credentials.middleware.js";

// Token expiry buffer (5 minutes before actual expiry)
const TOKEN_EXPIRY_BUFFER_MS = 5 * 60 * 1000;

// Default token lifetime (23 hours for safety, actual is usually 24h)
const DEFAULT_TOKEN_LIFETIME_MS = 23 * 60 * 60 * 1000;

class TokenCacheService {
  private cache = new Map<string, AuthToken>();
  private cleanupInterval: NodeJS.Timeout | null = null;

  constructor() {
    // Start cleanup interval
    this.cleanupInterval = setInterval(() => {
      this.cleanupExpiredTokens();
    }, 60 * 1000); // Every minute
  }

  /**
   * Get cached token for credentials
   */
  get(credentials: NDCCredentials): string | null {
    const hash = hashCredentials(credentials);
    const cached = this.cache.get(hash);

    if (!cached) {
      metrics.tokenCacheHits.labels("miss").inc();
      return null;
    }

    // Check if expired (with buffer)
    if (this.isExpired(cached)) {
      this.cache.delete(hash);
      metrics.tokenCacheHits.labels("expired").inc();
      logger.debug({ credentialHash: hash }, "Token expired, removed from cache");
      return null;
    }

    metrics.tokenCacheHits.labels("hit").inc();
    logger.debug({ credentialHash: hash }, "Token cache hit");
    return cached.token;
  }

  /**
   * Store token in cache
   */
  set(credentials: NDCCredentials, token: string, expiresInMs?: number): void {
    const hash = hashCredentials(credentials);
    const lifetime = expiresInMs || DEFAULT_TOKEN_LIFETIME_MS;

    const cached: AuthToken = {
      token,
      expiresAt: new Date(Date.now() + lifetime),
      credentialHash: hash,
    };

    this.cache.set(hash, cached);
    metrics.tokenCacheSize.set(this.cache.size);

    logger.debug(
      {
        credentialHash: hash,
        expiresAt: cached.expiresAt.toISOString(),
      },
      "Token cached"
    );
  }

  /**
   * Get token info for response headers
   */
  getTokenInfo(credentials: NDCCredentials): TokenInfo | null {
    const hash = hashCredentials(credentials);
    const cached = this.cache.get(hash);

    if (!cached) {
      return null;
    }

    const now = Date.now();
    const expiresIn = Math.max(0, cached.expiresAt.getTime() - now);
    const isExpired = this.isExpired(cached);
    const isExpiringSoon = !isExpired && expiresIn < config.token.expiryWarningMs;

    return {
      status: isExpired ? "EXPIRED" : isExpiringSoon ? "EXPIRING_SOON" : "VALID",
      expiresIn: Math.floor(expiresIn / 1000),
      expiresAt: cached.expiresAt.toISOString(),
      credentialHash: hash,
    };
  }

  /**
   * Invalidate token for credentials
   */
  invalidate(credentials: NDCCredentials): boolean {
    const hash = hashCredentials(credentials);
    const deleted = this.cache.delete(hash);
    
    if (deleted) {
      metrics.tokenCacheSize.set(this.cache.size);
      logger.info({ credentialHash: hash }, "Token invalidated");
    }

    return deleted;
  }

  /**
   * Clear all cached tokens
   */
  clear(): void {
    const size = this.cache.size;
    this.cache.clear();
    metrics.tokenCacheSize.set(0);
    logger.info({ clearedCount: size }, "Token cache cleared");
  }

  /**
   * Get cache statistics
   */
  getStats() {
    let validCount = 0;
    let expiredCount = 0;

    for (const cached of this.cache.values()) {
      if (this.isExpired(cached)) {
        expiredCount++;
      } else {
        validCount++;
      }
    }

    return {
      totalCached: this.cache.size,
      validTokens: validCount,
      expiredTokens: expiredCount,
    };
  }

  private isExpired(cached: AuthToken): boolean {
    return Date.now() >= cached.expiresAt.getTime() - TOKEN_EXPIRY_BUFFER_MS;
  }

  private cleanupExpiredTokens(): void {
    let removedCount = 0;

    for (const [hash, cached] of this.cache.entries()) {
      if (this.isExpired(cached)) {
        this.cache.delete(hash);
        removedCount++;
      }
    }

    if (removedCount > 0) {
      metrics.tokenCacheSize.set(this.cache.size);
      logger.debug({ removedCount }, "Expired tokens cleaned up");
    }
  }

  /**
   * Shutdown cleanup
   */
  shutdown(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
  }
}

export const tokenCache = new TokenCacheService();