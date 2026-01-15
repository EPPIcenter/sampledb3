/**
 * Error handling utilities for type-safe error handling (web package)
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
 * Check if error is an axios error with response data
 */
export function isAxiosError(error: unknown): error is { response?: { data?: { error?: string; message?: string } } } {
  return (
    typeof error === 'object' &&
    error !== null &&
    'response' in error
  )
}

/**
 * Extract error message from axios error
 */
export function getAxiosErrorMessage(error: unknown, fallback = 'An error occurred'): string {
  if (isAxiosError(error)) {
    const data = error.response?.data
    if (data?.error) return data.error
    if (data?.message) return data.message
  }
  return getErrorMessage(error, fallback)
}
