import { Context } from 'hono'
import { z } from 'zod'
import { logBackendError, logError, type ErrorLogContext } from './error-logger'
import { getRequestDatabase } from './db-context'

export interface ErrorResponse {
  error: string
  details?: any
  errorCode?: string
  stack?: string
}

/**
 * Detect ZodError: use instanceof when possible, else duck-check for .issues array
 * (avoids issues with multiple zod instances in tests/bundles).
 */
function isZodError(error: unknown): error is z.ZodError {
  if (error instanceof z.ZodError) return true
  if (error === null || typeof error !== 'object') return false
  const obj = error as { issues?: unknown }
  return 'issues' in obj && Array.isArray(obj.issues)
}

export function handleRouteError(error: unknown, c: Context): Response {
  const database = getRequestDatabase(c)
  
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
  if (isZodError(error)) {
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

    if (error instanceof CollectionDeleteBlockedError) {
      logError(database, 'backend', 'warning', error.message, error, errorContext).catch((logErr) => {
        console.error('[ERROR_HANDLER] Failed to log error:', logErr)
      })
      return c.json(
        {
          error: error.summary,
          errorCode: 'CONFLICT',
          blockers: error.blockers,
        },
        409
      )
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

/** 409 for bulk collection delete preflight: client must read `summary` and `blockers` */
export class CollectionDeleteBlockedError extends Error {
  constructor(
    public readonly summary: string,
    public readonly blockers: readonly CollectionDeleteBlocker[]
  ) {
    super(summary)
    this.name = 'CollectionDeleteBlockedError'
  }
}

export type CollectionDeleteBlocker = {
  code: CollectionDeleteBlockerCode
  message: string
} & {
  qpcrExperimentId?: number
  qpcrWellId?: number
  wellPosition?: string
  storageContainerId?: number
  specimenId?: number
  containerDerivationId?: number
  inCollectionContainerId?: number
  outsideContainerId?: number
  outsideRole?: 'parent' | 'child'
}

export type CollectionDeleteBlockerCode =
  | 'qpcr_wells_link_storage_containers'
  | 'qpcr_wells_link_specimens'
  | 'container_derivation_spans_outside_collection'

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
