import type { Context } from 'hono'
import { z } from 'zod'

/**
 * Common Zod validators used across routes
 */

/**
 * Validates an ID parameter (string that can be parsed to a positive integer)
 */
export const idParam = z.string().regex(/^\d+$/).transform(Number).pipe(z.number().int().positive())

/**
 * Validates an optional ID parameter
 */
export const optionalIdParam = z.string().regex(/^\d+$/).transform(Number).pipe(z.number().int().positive()).optional()

/**
 * Validates an email address
 */
export const email = z.string().email('Invalid email address')

/**
 * Validates an ISO date string
 */
export const isoDate = z.string().datetime({ message: 'Invalid date format. Expected ISO 8601 format.' })

/**
 * Validates an optional ISO date string
 */
export const optionalIsoDate = isoDate.optional()

/**
 * Validates a date string (YYYY-MM-DD or ISO format)
 */
export const dateString = z.string().refine(
  (val) => {
    const date = new Date(val)
    return !isNaN(date.getTime())
  },
  { message: 'Invalid date format' }
)

/**
 * Validates an optional date string
 */
export const optionalDateString = dateString.optional()

/**
 * Validates a non-empty string
 */
export const nonEmptyString = z.string().min(1, 'Cannot be empty')

/**
 * Validates a positive number
 */
export const positiveNumber = z.number().positive('Must be positive')

/**
 * Validates a non-negative number
 */
export const nonNegativeNumber = z.number().nonnegative('Must be non-negative')

/**
 * Validates an integer
 */
export const integer = z.number().int('Must be an integer')

/**
 * Validates a positive integer
 */
export const positiveInteger = z.number().int().positive('Must be a positive integer')

/**
 * Validates an optional positive integer
 */
export const optionalPositiveInteger = positiveInteger.optional()

/**
 * Reads a required path parameter from a Hono context.
 *
 * Hono >= 4.12 types `c.req.param(key)` as `string | undefined` because the
 * inferred path type cannot statically prove the key is present (see
 * https://github.com/honojs/hono/pull/4723). For handlers that are registered
 * against a route containing the segment (e.g. `app.get('/:id', ...)`) the
 * router guarantees the value is defined at runtime, so a missing value here
 * indicates a programming error (handler attached to the wrong route, or the
 * segment was renamed). We surface that loudly rather than silently coercing
 * to an empty string.
 */
export function requireParam(c: Context, key: string): string {
  const value = c.req.param(key)
  if (value === undefined) {
    throw new Error(
      `Required path parameter "${key}" was undefined; the handler is attached to a route that does not declare ":${key}".`
    )
  }
  return value
}

/**
 * Helper to parse and validate an ID from route params
 */
export function parseId(idParam: string | undefined): number | null {
  if (!idParam) return null
  const id = parseInt(idParam)
  return isNaN(id) || id <= 0 ? null : id
}

/**
 * Helper to validate that an ID is valid
 */
export function validateId(id: number | null | undefined): { valid: boolean; error?: string } {
  if (id === null || id === undefined) {
    return { valid: false, error: 'ID is required' }
  }
  if (!Number.isInteger(id) || id <= 0) {
    return { valid: false, error: 'Invalid ID' }
  }
  return { valid: true }
}
