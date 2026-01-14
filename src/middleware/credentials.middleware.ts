// ============================================================================
// NDC CREDENTIALS MIDDLEWARE
// Extracts credentials from request headers for multi-tenant authentication
// ============================================================================

import type { Request, Response, NextFunction } from "express";
import { createHash } from "crypto";
import { MissingFieldError } from "../errors/index.js";
import { logger } from "../utils/logger.js";
import { context } from "../utils/context.js";
import type { NDCCredentials, TokenInfo } from "../types/ndc.types.js";

// ----------------------------------------------------------------------------
// EXTEND EXPRESS REQUEST TYPE
// ----------------------------------------------------------------------------

declare global {
  namespace Express {
    interface Request {
      ndcCredentials?: NDCCredentials;
      credentialHash?: string;
    }
  }
}

// ----------------------------------------------------------------------------
// HEADER NAMES
// ----------------------------------------------------------------------------

export const NDC_CREDENTIAL_HEADERS = {
  domain: "x-ndc-auth-domain",
  apiId: "x-ndc-api-id",
  password: "x-ndc-api-password",
  subscriptionKey: "x-ndc-subscription-key",
} as const;

// ----------------------------------------------------------------------------
// HELPER FUNCTIONS
// ----------------------------------------------------------------------------

/**
 * Hash credentials for cache key and logging (never log actual credentials)
 */
export function hashCredentials(creds: NDCCredentials): string {
  const data = `${creds.domain}:${creds.apiId}:${creds.password}`;
  return createHash("sha256").update(data).digest("hex").substring(0, 16);
}

/**
 * Extract credentials from headers
 */
function extractCredentialsFromHeaders(req: Request): NDCCredentials | null {
  const domain = req.headers[NDC_CREDENTIAL_HEADERS.domain] as string | undefined;
  const apiId = req.headers[NDC_CREDENTIAL_HEADERS.apiId] as string | undefined;
  const password = req.headers[NDC_CREDENTIAL_HEADERS.password] as string | undefined;
  const subscriptionKey = req.headers[NDC_CREDENTIAL_HEADERS.subscriptionKey] as string | undefined;

  if (!domain || !apiId || !password || !subscriptionKey) {
    return null;
  }

  return { domain, apiId, password, subscriptionKey };
}

// ----------------------------------------------------------------------------
// MIDDLEWARE
// ----------------------------------------------------------------------------

export interface ExtractCredentialsOptions {
  required?: boolean;
}

/**
 * Middleware to extract NDC credentials from request headers
 */
export function extractNdcCredentials(options: ExtractCredentialsOptions = {}) {
  const { required = true } = options;

  return (req: Request, res: Response, next: NextFunction): void => {
    const credentials = extractCredentialsFromHeaders(req);

    // Check if any credential header was provided
    const hasAnyHeader =
      req.headers[NDC_CREDENTIAL_HEADERS.domain] ||
      req.headers[NDC_CREDENTIAL_HEADERS.apiId] ||
      req.headers[NDC_CREDENTIAL_HEADERS.password] ||
      req.headers[NDC_CREDENTIAL_HEADERS.subscriptionKey];

    if (required || hasAnyHeader) {
      // Validate all required headers are present
      const missing: string[] = [];
      if (!req.headers[NDC_CREDENTIAL_HEADERS.domain]) missing.push(NDC_CREDENTIAL_HEADERS.domain);
      if (!req.headers[NDC_CREDENTIAL_HEADERS.apiId]) missing.push(NDC_CREDENTIAL_HEADERS.apiId);
      if (!req.headers[NDC_CREDENTIAL_HEADERS.password]) missing.push(NDC_CREDENTIAL_HEADERS.password);
      if (!req.headers[NDC_CREDENTIAL_HEADERS.subscriptionKey]) missing.push(NDC_CREDENTIAL_HEADERS.subscriptionKey);

      if (missing.length > 0) {
        logger.warn({ missing }, "Missing NDC credential headers");
        return next(new MissingFieldError(`Missing required headers: ${missing.join(", ")}`));
      }

      // Attach credentials to request
      req.ndcCredentials = credentials!;
      req.credentialHash = hashCredentials(credentials!);

      // Update context with credential hash for logging
      context.setCredentialHash(req.credentialHash);

      logger.debug(
        {
          domain: credentials!.domain,
          apiId: credentials!.apiId.substring(0, 4) + "****",
          credentialHash: req.credentialHash,
        },
        "NDC credentials extracted"
      );
    }

    next();
  };
}

/**
 * Get credentials from request or throw error
 */
export function getCredentialsOrThrow(req: Request): NDCCredentials {
  if (!req.ndcCredentials) {
    throw new MissingFieldError(
      "NDC credentials not found. Include X-NDC-Auth-Domain, X-NDC-API-ID, X-NDC-API-Password, and X-NDC-Subscription-Key headers."
    );
  }
  return req.ndcCredentials;
}

/**
 * Get credential hash from request
 */
export function getCredentialHash(req: Request): string | undefined {
  return req.credentialHash;
}

// ----------------------------------------------------------------------------
// RESPONSE HELPERS
// ----------------------------------------------------------------------------

/**
 * Set token lifecycle headers on response
 */
export function setTokenInfoHeaders(res: Response, tokenInfo: TokenInfo): void {
  res.setHeader("X-Token-Status", tokenInfo.status);
  res.setHeader("X-Token-Expires-In", tokenInfo.expiresIn.toString());
  res.setHeader("X-Token-Expires-At", tokenInfo.expiresAt);
  res.setHeader("X-Token-Credential-Hash", tokenInfo.credentialHash);
}

/**
 * Get token info from response headers (for testing/debugging)
 */
export function getTokenInfoFromHeaders(res: Response): Partial<TokenInfo> {
  return {
    status: res.getHeader("X-Token-Status") as TokenInfo["status"],
    expiresIn: parseInt(res.getHeader("X-Token-Expires-In") as string, 10) || 0,
    expiresAt: res.getHeader("X-Token-Expires-At") as string,
    credentialHash: res.getHeader("X-Token-Credential-Hash") as string,
  };
}