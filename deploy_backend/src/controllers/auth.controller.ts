// ============================================================================
// AUTH CONTROLLER - Token management endpoints
// ============================================================================

import type { Request, Response, NextFunction } from "express";
import { authService } from "../services/auth.service.js";
import { tokenCache } from "../services/token-cache.service.js";
import { getCredentialsOrThrow, setTokenInfoHeaders } from "../middleware/credentials.middleware.js";
import { context } from "../utils/context.js";
import type { ApiResponse, ResponseMeta } from "../types/api.types.js";

function buildMeta(req: Request, operation: string, duration: number): ResponseMeta {
  const ctx = context.get();
  return {
    transactionId: ctx?.transactionId || "unknown",
    correlationId: ctx?.correlationId || "unknown",
    timestamp: new Date().toISOString(),
    duration,
    operation,
  };
}

class AuthController {
  authenticate = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const startTime = Date.now();
    try {
      const credentials = getCredentialsOrThrow(req);
      const forceRefresh = req.body?.forceRefresh === true;
      const result = await authService.authenticate(credentials, forceRefresh);
      
      if (result.success) setTokenInfoHeaders(res, result.tokenInfo);
      
      const response: ApiResponse = {
        success: result.success,
        data: { authenticated: result.success, tokenInfo: result.tokenInfo },
        error: result.success ? undefined : { code: "AUTH_FAILED", message: result.message || "Authentication failed", retryable: true },
        meta: buildMeta(req, "Auth", Date.now() - startTime),
      };
      
      res.status(result.success ? 200 : 401).json(response);
    } catch (error) {
      next(error);
    }
  };
  
  getTokenStatus = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const startTime = Date.now();
    try {
      const credentials = getCredentialsOrThrow(req);
      const tokenInfo = authService.getTokenInfo(credentials);
      if (tokenInfo) setTokenInfoHeaders(res, tokenInfo);
      
      const response: ApiResponse = {
        success: true,
        data: {
          hasToken: tokenInfo !== null,
          tokenInfo: tokenInfo || { status: "NONE", expiresIn: 0, expiresAt: new Date().toISOString(), credentialHash: req.credentialHash || "unknown" },
        },
        meta: buildMeta(req, "TokenStatus", Date.now() - startTime),
      };
      res.json(response);
    } catch (error) {
      next(error);
    }
  };
  
  invalidateToken = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const startTime = Date.now();
    try {
      const credentials = getCredentialsOrThrow(req);
      const deleted = authService.invalidateToken(credentials);
      const response: ApiResponse = { success: true, data: { invalidated: deleted }, meta: buildMeta(req, "TokenInvalidate", Date.now() - startTime) };
      res.json(response);
    } catch (error) {
      next(error);
    }
  };
  
  getCacheStats = async (req: Request, res: Response, _next: NextFunction): Promise<void> => {
    const startTime = Date.now();
    const stats = tokenCache.getStats();
    const response: ApiResponse = { success: true, data: stats, meta: buildMeta(req, "CacheStats", Date.now() - startTime) };
    res.json(response);
  };
}

export const authController = new AuthController();