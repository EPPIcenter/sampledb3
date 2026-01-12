import { Context } from 'hono'
import { z } from 'zod'

export interface ErrorResponse {
  error: string
  details?: any
  errorCode?: string
  stack?: string
}

export function handleRouteError(error: unknown, c: Context): Response {
  // Handle Zod validation errors
  if (error instanceof z.ZodError) {
    return c.json({
      error: 'Validation error',
      details: error.issues,
      errorCode: 'VALIDATION_ERROR'
    }, 400)
  }

  // Handle known application errors
  if (error instanceof Error) {
    const isDevelopment = process.env.NODE_ENV !== 'production'
    
    // Handle custom error classes
    if (error instanceof NotFoundError) {
      return c.json({
        error: error.message,
        errorCode: 'NOT_FOUND'
      }, 404)
    }
    
    if (error instanceof ConflictError) {
      return c.json({
        error: error.message,
        errorCode: 'CONFLICT'
      }, 409)
    }
    
    if (error instanceof ValidationError) {
      return c.json({
        error: error.message,
        details: error.details,
        errorCode: 'VALIDATION_ERROR'
      }, 400)
    }
    
    return c.json({
      error: error.message,
      errorCode: error.name || 'APPLICATION_ERROR',
      ...(isDevelopment && { 
        stack: error.stack,
        details: error.cause 
      })
    }, 500)
  }

  // Handle unknown errors
  const isDevelopment = process.env.NODE_ENV !== 'production'
  return c.json({
    error: 'Internal server error',
    errorCode: 'INTERNAL_ERROR',
    ...(isDevelopment && { 
      details: String(error)
    })
  }, 500)
}

// Custom error classes for better error handling
export class NotFoundError extends Error {
  constructor(resource: string, id?: string | number) {
    super(`${resource}${id ? ` with id ${id}` : ''} not found`)
    this.name = 'NotFoundError'
  }
}

export class ConflictError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ConflictError'
  }
}

export class ValidationError extends Error {
  constructor(message: string, public details?: any) {
    super(message)
    this.name = 'ValidationError'
  }
}
