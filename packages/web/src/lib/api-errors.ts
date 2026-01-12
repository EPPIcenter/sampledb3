import axios, { AxiosError } from 'axios'

/**
 * Typed API error structure
 */
export interface TypedApiError {
  message: string
  code: string
  details?: unknown
  statusCode?: number
  originalError?: unknown
}

/**
 * Extract a typed error from an unknown error
 * Handles Axios errors, standard Errors, and unknown types
 */
export function extractApiError(error: unknown): TypedApiError {
  if (axios.isAxiosError(error)) {
    const axiosError = error as AxiosError<{ error?: string; errorCode?: string; details?: unknown }>
    return {
      message: axiosError.response?.data?.error || axiosError.message || 'Unknown error',
      code: axiosError.response?.data?.errorCode || 'UNKNOWN',
      details: axiosError.response?.data?.details,
      statusCode: axiosError.response?.status,
      originalError: error,
    }
  }
  
  if (error instanceof Error) {
    return {
      message: error.message,
      code: 'UNKNOWN',
      originalError: error,
    }
  }
  
  return {
    message: 'Unknown error',
    code: 'UNKNOWN',
    originalError: error,
  }
}

/**
 * Type guard to check if an error is a TypedApiError
 */
export function isTypedApiError(error: unknown): error is TypedApiError {
  return (
    typeof error === 'object' &&
    error !== null &&
    'message' in error &&
    'code' in error &&
    typeof (error as TypedApiError).message === 'string' &&
    typeof (error as TypedApiError).code === 'string'
  )
}

/**
 * Helper to safely extract error message for display
 */
export function getErrorMessage(error: unknown): string {
  const apiError = extractApiError(error)
  return apiError.message
}
