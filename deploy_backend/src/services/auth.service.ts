// ============================================================================
// AUTH SERVICE - NEW
// Handles authentication with Navitaire NDC Gateway
// Uses separate auth URL: /jq/ndc/api/Selling/r3.x/Auth
// ============================================================================

import axios from "axios";
import { config } from "../config/index.js";
import { logger } from "../utils/logger.js";
import { metrics } from "../utils/metrics.js";
import { tokenCache } from "./token-cache.service.js";
import { NDCAuthError } from "../errors/index.js";
import type { NDCCredentials, TokenInfo } from "../types/ndc.types.js";
import { hashCredentials } from "../middleware/credentials.middleware.js";

export interface AuthResult {
  success: boolean;
  token?: string;
  tokenInfo: TokenInfo;
  message?: string;
}

class AuthService {
  /**
   * Authenticate with Navitaire and cache the token
   */
  async authenticate(credentials: NDCCredentials, forceRefresh = false): Promise<AuthResult> {
    const credentialHash = hashCredentials(credentials);
    
    // Check cache first (unless force refresh)
    if (!forceRefresh) {
      const cachedToken = tokenCache.get(credentials);
      if (cachedToken) {
        const tokenInfo = tokenCache.getTokenInfo(credentials)!;
        logger.debug({ credentialHash }, "Using cached token");
        return {
          success: true,
          token: cachedToken,
          tokenInfo,
        };
      }
    }

    logger.info({ credentialHash }, "Authenticating with Navitaire");

    try {
      // Build auth header: Domain\ApiId:Password
      const authString = `${credentials.domain}\\${credentials.apiId}:${credentials.password}`;
      const authHeader = `Basic ${Buffer.from(authString).toString("base64")}`;

      // FIXED: Use separate auth URL
      const authUrl = `${config.ndc.authUrl}${config.ndc.endpoints.auth}`;
      
      logger.debug({ authUrl, credentialHash }, "Calling auth endpoint");

      const startTime = Date.now();
      
      const response = await axios.post(
        authUrl,
        "", // Empty body for auth
        {
          headers: {
            Authorization: authHeader,
            "Ocp-Apim-Subscription-Key": credentials.subscriptionKey,
            "Content-Type": "application/xml",
            Accept: "application/xml",
          },
          timeout: config.ndc.requestTimeout,
        }
      );

      const duration = Date.now() - startTime;
      metrics.recordNdcOperation("Auth", "success", duration);

      // Extract token from response
      // Navitaire typically returns the token in the response body or headers
      const token = this.extractToken(response.data, response.headers);
      
      if (!token) {
        throw new NDCAuthError("No token received from auth response");
      }

      // Cache the token
      tokenCache.set(credentials, token, config.token.defaultValidityMs);
      
      const tokenInfo = tokenCache.getTokenInfo(credentials)!;
      
      logger.info(
        { 
          credentialHash, 
          duration,
          expiresIn: tokenInfo.expiresIn 
        }, 
        "Authentication successful"
      );

      return {
        success: true,
        token,
        tokenInfo,
      };
    } catch (error) {
      const duration = Date.now();
      metrics.recordNdcOperation("Auth", "error", duration);

      logger.error(
        {
          credentialHash,
          error: (error as Error).message,
        },
        "Authentication failed"
      );

      // Return failure info
      return {
        success: false,
        tokenInfo: {
          status: "NONE",
          expiresIn: 0,
          expiresAt: new Date().toISOString(),
          credentialHash,
        },
        message: (error as Error).message,
      };
    }
  }

  /**
   * Extract token from auth response
   */
  private extractToken(responseData: string, headers: Record<string, unknown>): string | null {
    // Try to extract from response XML
    // Common patterns: <Token>...</Token>, <AuthToken>...</AuthToken>
    const tokenPatterns = [
      /<Token>([^<]+)<\/Token>/i,
      /<AuthToken>([^<]+)<\/AuthToken>/i,
      /<SessionToken>([^<]+)<\/SessionToken>/i,
      /<BearerToken>([^<]+)<\/BearerToken>/i,
    ];

    for (const pattern of tokenPatterns) {
      const match = responseData.match(pattern);
      if (match && match[1]) {
        return match[1];
      }
    }

    // Try to get from headers
    const tokenHeader = headers["x-auth-token"] || headers["authorization"];
    if (typeof tokenHeader === "string") {
      return tokenHeader.replace(/^Bearer\s+/i, "");
    }

    // If the entire response is the token (some APIs do this)
    if (responseData && responseData.length < 500 && !responseData.includes("<")) {
      return responseData.trim();
    }

    return null;
  }

  /**
   * Get current token info without re-authenticating
   */
  getTokenInfo(credentials: NDCCredentials): TokenInfo | null {
    return tokenCache.getTokenInfo(credentials);
  }

  /**
   * Invalidate cached token
   */
  invalidateToken(credentials: NDCCredentials): boolean {
    return tokenCache.invalidate(credentials);
  }

  /**
   * Check if we have a valid token
   */
  hasValidToken(credentials: NDCCredentials): boolean {
    const info = tokenCache.getTokenInfo(credentials);
    return info !== null && info.status === "VALID";
  }
}

export const authService = new AuthService();