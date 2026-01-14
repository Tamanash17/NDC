// ============================================================================
// VALIDATE MIDDLEWARE - Zod validation for request bodies
// ============================================================================

import type { Request, Response, NextFunction } from "express";
import type { ZodSchema } from "zod";
import { ValidationError } from "../errors/index.js";

export function validateRequest<T>(schema: ZodSchema<T>) {
  return async (req: Request, _res: Response, next: NextFunction): Promise<void> => {
    try {
      const validated = await schema.parseAsync(req.body);
      req.body = validated;
      next();
    } catch (error) {
      if ((error as Error).name === "ZodError") {
        next(ValidationError.fromZod(error as import("zod").ZodError));
      } else {
        next(error);
      }
    }
  };
}