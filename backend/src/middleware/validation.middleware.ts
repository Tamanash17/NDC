// ============================================================================
// VALIDATION MIDDLEWARE
// Zod schema validation for request bodies, query params, and path params
// ============================================================================

import type { Request, Response, NextFunction } from "express";
import type { ZodSchema, ZodError } from "zod";
import { ValidationError } from "../errors/index.js";
import { logger } from "../utils/logger.js";

type ValidationTarget = "body" | "query" | "params";

/**
 * Format Zod errors into a user-friendly object
 */
function formatZodErrors(error: ZodError): Record<string, string> {
  const formatted: Record<string, string> = {};

  for (const issue of error.errors) {
    const path = issue.path.join(".") || "root";
    formatted[path] = issue.message;
  }

  return formatted;
}

/**
 * Generic validation middleware factory
 */
export function validateRequest<T>(schema: ZodSchema<T>, target: ValidationTarget = "body") {
  return async (req: Request, _res: Response, next: NextFunction): Promise<void> => {
    try {
      const dataToValidate = req[target];
      const validated = await schema.parseAsync(dataToValidate);

      // Replace request data with validated (and possibly transformed) data
      (req as any)[target] = validated;

      next();
    } catch (error) {
      if ((error as Error).name === "ZodError") {
        const zodError = error as ZodError;
        const fieldErrors = formatZodErrors(zodError);

        logger.warn(
          {
            type: "validation_error",
            target,
            errors: fieldErrors,
            path: req.path,
          },
          `Request ${target} validation failed`
        );

        next(new ValidationError(`Validation failed for ${target}`, { fields: fieldErrors }));
      } else {
        next(error);
      }
    }
  };
}

/**
 * Validate request body
 */
export const validateBody = <T>(schema: ZodSchema<T>) => validateRequest(schema, "body");

/**
 * Validate query parameters
 */
export const validateQuery = <T>(schema: ZodSchema<T>) => validateRequest(schema, "query");

/**
 * Validate path parameters
 */
export const validateParams = <T>(schema: ZodSchema<T>) => validateRequest(schema, "params");