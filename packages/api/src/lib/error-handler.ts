import { Context } from 'hono'
import { z } from 'zod'
import { logBackendError, logError, type ErrorLogContext } from './error-logger'
import { db } from '../db/client'

export interface ErrorResponse {
  error: string
  details?: any
  errorCode?: string
  stack?: string
}

export function handleRouteError(error: unknown, c: Context): Response {
  // Get database from context if available, otherwise use default
  const database = (c.get('db') as typeof db | undefined) || db
  
  // Extract context for error logging
  const user = c.get('user') as { id: number } | undefined
  const url = c.req.url
  const userAgent = c.req.header('user-agent')
  
  const errorContext: ErrorLogContext = {
    userId: user?.id,
    url,
    userAgent,
    additionalContext: {
      method: c.req.method,
      path: new URL(url).pathname,
    },
  }
  
  // Handle Zod validation errors
  if (error instanceof z.ZodError) {
    // Log validation errors as warnings (they're expected user input errors, but still worth tracking)
    logError(database, 'backend', 'warning', 'Validation error', error, {
      ...errorContext,
      additionalContext: {
        ...errorContext.additionalContext,
        validationIssues: error.issues,
      },
    }).catch((logErr) => {
      console.error('[ERROR_HANDLER] Failed to log error:', logErr)
    })
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
    if (error instanceof UnauthorizedError) {
      // Log 401 errors as warnings (they can be expected in some cases)
      logError(database, 'backend', 'warning', error.message, error, errorContext).catch((logErr) => {
        console.error('[ERROR_HANDLER] Failed to log error:', logErr)
      })
      return c.json({
        error: error.message,
        errorCode: 'UNAUTHORIZED'
      }, 401)
    }
    
    if (error instanceof NotFoundError) {
      // Log error asynchronously (non-blocking)
      logBackendError(database, error, errorContext).catch((logErr) => {
        console.error('[ERROR_HANDLER] Failed to log error:', logErr)
      })
      return c.json({
        error: error.message,
        errorCode: 'NOT_FOUND'
      }, 404)
    }
    
    if (error instanceof ConflictError) {
      // Log error asynchronously (non-blocking)
      logBackendError(database, error, errorContext).catch((logErr) => {
        console.error('[ERROR_HANDLER] Failed to log error:', logErr)
      })
      return c.json({
        error: error.message,
        errorCode: 'CONFLICT'
      }, 409)
    }
    
    if (error instanceof ValidationError) {
      // Log error asynchronously (non-blocking)
      logBackendError(database, error, errorContext).catch((logErr) => {
        console.error('[ERROR_HANDLER] Failed to log error:', logErr)
      })
      return c.json({
        error: error.message,
        details: error.details,
        errorCode: 'VALIDATION_ERROR'
      }, 400)
    }
    
    // Log error asynchronously (non-blocking)
    logBackendError(database, error, errorContext).catch((logErr) => {
      console.error('[ERROR_HANDLER] Failed to log error:', logErr)
    })
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
  // Log error asynchronously (non-blocking)
  logBackendError(database, error, errorContext).catch((logErr) => {
    console.error('[ERROR_HANDLER] Failed to log error:', logErr)
  })
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

export class UnauthorizedError extends Error {
  constructor(message: string = 'Unauthorized') {
    super(message)
    this.name = 'UnauthorizedError'
  }
}
