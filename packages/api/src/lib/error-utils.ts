/**
 * Error handling utilities for type-safe error handling
 */

/**
 * Type guard to check if an unknown value is an Error instance
 */
export function isError(error: unknown): error is Error {
  return error instanceof Error
}

/**
 * Type guard to check if an unknown value is an object with a message property
 */
export function isErrorLike(error: unknown): error is { message: string } {
  return (
    typeof error === 'object' &&
    error !== null &&
    'message' in error &&
    typeof (error as { message: unknown }).message === 'string'
  )
}

/**
 * Extract error message from unknown error value
 * @param error - The error value (unknown type)
 * @param fallback - Fallback message if error cannot be extracted
 * @returns Error message string
 */
export function getErrorMessage(error: unknown, fallback = 'An unknown error occurred'): string {
  if (isError(error)) {
    return error.message
  }
  if (isErrorLike(error)) {
    return error.message
  }
  if (typeof error === 'string') {
    return error
  }
  return fallback
}

/**
 * Extract error stack trace if available
 * @param error - The error value (unknown type)
 * @returns Stack trace string or undefined
 */
export function getErrorStack(error: unknown): string | undefined {
  if (isError(error)) {
    return error.stack
  }
  return undefined
}
