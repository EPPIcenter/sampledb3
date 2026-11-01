import { Context } from 'hono'
import type { ContentfulStatusCode } from 'hono/utils/http-status'
import { z } from 'zod'
import { logBackendError, logError, type ErrorLogContext } from './error-logger'
import { getRequestDatabase } from './db-context'
import { logError as logObservabilityError, logWarn } from './observability'
import { getRequestId } from '../middleware/request-context'

function logPersistFailure(logErr: unknown): void {
  const err = logErr instanceof Error ? logErr : new Error(String(logErr))
  logObservabilityError('Failed to log error to database', err, { component: 'error-handler' })
}

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

/** Readable message for a SQLite UNIQUE / FOREIGN KEY violation, or null for other errors. */
export function sqliteConstraintConflict(error: Error): string | null {
  const code = (error as { code?: unknown }).code
  if (code === 'SQLITE_CONSTRAINT_UNIQUE' || code === 'SQLITE_CONSTRAINT_PRIMARYKEY') {
    // "UNIQUE constraint failed: study.title, study.x" -> "title, x"
    const columns = error.message
      .replace(/^.*constraint failed:\s*/i, '')
      .split(',')
      .map((col) => col.trim().split('.').pop()?.replace(/_/g, ' '))
      .filter(Boolean)
      .join(', ')
    return columns ? `A record with this ${columns} already exists.` : 'This record already exists.'
  }
  if (code === 'SQLITE_CONSTRAINT_FOREIGNKEY') {
    return 'This record is still referenced by other data, or refers to a record that does not exist.'
  }
  return null
}

/** The `error` a client gets for a 500 in production. */
export const INTERNAL_ERROR_MESSAGE = 'Internal server error'

function logInternalError(error: unknown, c: Context): void {
  const err = error instanceof Error ? error : new Error(String(error))
  logObservabilityError('Unhandled error in request', err, {
    requestId: getRequestId(c),
    method: c.req.method,
    path: new URL(c.req.url).pathname,
  })
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
    requestId: getRequestId(c),
    additionalContext: {
      method: c.req.method,
      path: new URL(url).pathname,
    },
  }
  
  // Preserve route-specific JSON bodies (search, containers read paths, etc.)
  if (error instanceof RouteError) {
    logBackendError(database, error, errorContext).catch(logPersistFailure)
    return c.json(error.body, error.status as ContentfulStatusCode)
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
    }).catch(logPersistFailure)
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
      logError(database, 'backend', 'warning', error.message, error, errorContext).catch(logPersistFailure)
      return c.json({
        error: error.message,
        errorCode: 'UNAUTHORIZED'
      }, 401)
    }
    
    // Not persisted to error_logs: an oversized body is rejected so it cannot fill the table.
    // hono's bodyLimit raises BodyLimitError (not exported) when it finds the excess while the
    // route reads a body sent without Content-Length.
    if (error instanceof PayloadTooLargeError || error.name === 'BodyLimitError') {
      logWarn('Request body too large', { requestId: getRequestId(c), method: c.req.method, path: new URL(url).pathname })
      return c.json({
        error: error instanceof PayloadTooLargeError ? error.message : 'Request body too large',
        errorCode: 'PAYLOAD_TOO_LARGE',
      }, 413)
    }

    if (error instanceof ExpectedNotFoundError) {
      return c.json({
        error: error.message,
        errorCode: 'NOT_FOUND',
      }, 404)
    }

    if (error instanceof NotFoundError) {
      logError(database, 'backend', 'warning', error.message, error, errorContext).catch(logPersistFailure)
      return c.json({
        error: error.message,
        errorCode: 'NOT_FOUND'
      }, 404)
    }
    
    if (error instanceof ConflictError) {
      // Log error asynchronously (non-blocking)
      logBackendError(database, error, errorContext).catch(logPersistFailure)
      return c.json({
        ...error.fields,
        error: error.message,
        errorCode: 'CONFLICT',
        ...(error.details !== undefined && { details: error.details }),
      }, 409)
    }

    if (error instanceof CollectionDeleteBlockedError) {
      logError(database, 'backend', 'warning', error.message, error, errorContext).catch(logPersistFailure)
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
      logBackendError(database, error, errorContext).catch(logPersistFailure)
      return c.json({
        error: error.message,
        details: error.details,
        errorCode: 'VALIDATION_ERROR'
      }, 400)
    }
    
    // A UNIQUE or FOREIGN KEY violation is a conflict with existing data, not a server fault.
    // Reply 409 with a readable message instead of the raw SQLite text.
    const constraint = sqliteConstraintConflict(error)
    if (constraint) {
      logError(database, 'backend', 'warning', error.message, error, errorContext).catch(logPersistFailure)
      return c.json({
        error: constraint,
        errorCode: 'CONFLICT',
        ...(isDevelopment && { details: error.message }),
      }, 409)
    }

    // Log the full error (stdout and error_logs); in production the client gets only a generic
    // message, since error.message can carry SQL or other internals.
    logInternalError(error, c)
    logBackendError(database, error, errorContext).catch(logPersistFailure)
    if (!isDevelopment) {
      return c.json({ error: INTERNAL_ERROR_MESSAGE, errorCode: 'INTERNAL_ERROR' }, 500)
    }
    return c.json({
      error: error.message,
      errorCode: error.name || 'APPLICATION_ERROR',
      stack: error.stack,
      details: error.cause,
    }, 500)
  }

  // Handle unknown errors
  logInternalError(error, c)
  logBackendError(database, error, errorContext).catch(logPersistFailure)
  const isDevelopment = process.env.NODE_ENV !== 'production'
  return c.json({
    error: INTERNAL_ERROR_MESSAGE,
    errorCode: 'INTERNAL_ERROR',
    ...(isDevelopment && { 
      details: String(error)
    })
  }, 500)
}

// Custom error classes for better error handling
export class ExpectedNotFoundError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ExpectedNotFoundError'
  }
}

export class NotFoundError extends Error {
  constructor(resource: string, id?: string | number) {
    super(`${resource}${id ? ` with id ${id}` : ''} not found`)
    this.name = 'NotFoundError'
  }
}

export class ConflictError extends Error {
  /** `details` goes in the 409 body as `details`; `fields` are added next to `error` (e.g. the record that conflicts). */
  constructor(
    message: string,
    public readonly details?: unknown,
    public readonly fields: Record<string, unknown> = {}
  ) {
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

/** 413: the request body is over a route's size cap. */
export class PayloadTooLargeError extends Error {
  constructor(message: string = 'Request body too large') {
    super(message)
    this.name = 'PayloadTooLargeError'
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

/** Fixed JSON error body for routes that must keep legacy client-visible shapes */
export class RouteError extends Error {
  constructor(
    public readonly status: number,
    public readonly body: ErrorResponse & Record<string, unknown>,
  ) {
    super(typeof body.error === 'string' ? body.error : 'Route error')
    this.name = 'RouteError'
  }
}

function searchFailedBody(
  query: string,
  cause: unknown,
): ErrorResponse & Record<string, unknown> {
  const isDevelopment = process.env.NODE_ENV !== 'production'
  const errorMessage = cause instanceof Error ? cause.message : 'Unknown error'
  const errorStack = cause instanceof Error ? cause.stack : undefined
  return {
    error: 'Search failed',
    query,
    ...(isDevelopment
      ? { details: errorMessage, stack: errorStack }
      : { errorCode: 'SEARCH_ERROR' }),
  }
}

function containersFetchFailedBody(
  message: string,
  cause: unknown,
): ErrorResponse & Record<string, unknown> {
  // The cause's message stays out of production responses, as in handleRouteError's 500s.
  if (process.env.NODE_ENV === 'production') return { error: message }
  const errorMessage = cause instanceof Error ? cause.message : 'Unknown error'
  return { error: message, details: errorMessage }
}

export { searchFailedBody, containersFetchFailedBody }
