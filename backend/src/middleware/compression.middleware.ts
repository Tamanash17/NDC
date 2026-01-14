// ============================================================================
// COMPRESSION MIDDLEWARE
// Response compression for better performance
// ============================================================================

import compression from "compression";
import type { Request, Response } from "express";

/**
 * Determine if response should be compressed
 */
function shouldCompress(req: Request, res: Response): boolean {
  // Dont compress if client doesnt accept it
  if (req.headers["x-no-compression"]) {
    return false;
  }

  // Compress everything else
  return compression.filter(req, res);
}

/**
 * Compression middleware with sensible defaults
 */
export const compressionMiddleware = compression({
  filter: shouldCompress,
  level: 6, // Balanced compression level
  threshold: 1024, // Only compress responses > 1KB
  memLevel: 8,
});