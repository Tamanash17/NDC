import { z } from 'zod';

/**
 * Email validation schema
 */
export const emailSchema = z.string().email('Invalid email address');

/**
 * Phone validation schema
 */
export const phoneSchema = z.string().min(8, 'Phone number too short').max(20, 'Phone number too long');

/**
 * Passport number validation
 */
export const passportSchema = z.string().min(5, 'Invalid passport number').max(20, 'Invalid passport number');

/**
 * Date validation (YYYY-MM-DD)
 */
export const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Invalid date format');

/**
 * Organization code validation
 */
export const orgCodeSchema = z.string().min(1, 'Organization code is required').max(20, 'Organization code too long');

/**
 * Passenger name validation
 */
export const passengerNameSchema = z.string()
  .min(1, 'Name is required')
  .max(50, 'Name too long')
  .regex(/^[A-Z\s\-']+$/i, 'Name can only contain letters, spaces, hyphens, and apostrophes');
