import type { Database } from '../db/client'
import { errorLogs } from '../db/schema'
import { lt, sql } from 'drizzle-orm'

export interface ErrorLogContext {
  userId?: number
  url?: string
  userAgent?: string
  requestId?: string
  additionalContext?: Record<string, unknown>
}

type ErrorLogLevel = 'error' | 'warning' | 'info'
type ErrorLogSource = 'frontend' | 'backend'

/**
 * Extract error details from an unknown error
 */
function extractErrorDetails(error: unknown): {
  message: string
  stack?: string
  errorCode?: string
} {
  if (error instanceof Error) {
    return {
      message: error.message,
      stack: error.stack,
      errorCode: error.name,
    }
  }

  if (typeof error === 'string') {
    return {
      message: error,
    }
  }

  return {
    message: String(error),
  }
}

/**
 * Check if error logging is enabled
 */
function isErrorLoggingEnabled(): boolean {
  const enabled = process.env.ERROR_LOG_ENABLED
  if (enabled === undefined) return true // Default to enabled
  return enabled === 'true' || enabled === '1'
}

/**
 * Check if error level should be logged
 */
function shouldLogLevel(level: ErrorLogLevel): boolean {
  const minLevel = (process.env.ERROR_LOG_LEVEL || 'error').toLowerCase()
  const levels: ErrorLogLevel[] = ['info', 'warning', 'error']
  const minIndex = levels.indexOf(minLevel as ErrorLogLevel)
  const levelIndex = levels.indexOf(level)
  
  if (minIndex === -1) return level === 'error' // Default to error only
  return levelIndex >= minIndex
}

/**
 * Log an error to the database
 * This function is non-blocking and handles failures gracefully
 */
export async function logError(
  db: Database,
  source: ErrorLogSource,
  level: ErrorLogLevel,
  message: string,
  error: unknown,
  context?: ErrorLogContext
): Promise<void> {
  // Check if logging is enabled
  if (!isErrorLoggingEnabled()) {
    return
  }

  // Check if this level should be logged
  if (!shouldLogLevel(level)) {
    return
  }

  try {
    const errorDetails = extractErrorDetails(error)
    
    // Prepare context JSON
    const contextJson = context?.additionalContext || {}
    if (context?.requestId) {
      contextJson.requestId = context.requestId
    }

    // Insert error log (non-blocking - don't await, but handle errors)
    db.insert(errorLogs).values({
      timestamp: new Date().toISOString(),
      source,
      level,
      message: message || errorDetails.message,
      errorCode: errorDetails.errorCode,
      stack: errorDetails.stack,
      context: Object.keys(contextJson).length > 0 ? contextJson : null,
      userId: context?.userId,
      url: context?.url,
      userAgent: context?.userAgent,
      resolved: false,
    }).then(() => {
      // Successfully logged
    }).catch((logError) => {
      // Log to console as fallback if database logging fails
      console.error('[ERROR_LOGGER] Failed to log error to database:', logError)
      console.error('[ERROR_LOGGER] Original error:', {
        source,
        level,
        message: message || errorDetails.message,
        errorCode: errorDetails.errorCode,
        context,
      })
    })
  } catch (err) {
    // Fallback to console if anything goes wrong
    console.error('[ERROR_LOGGER] Critical error in error logger:', err)
    console.error('[ERROR_LOGGER] Original error:', {
      source,
      level,
      message,
      error,
      context,
    })
  }
}

/**
 * Log a backend error
 */
export async function logBackendError(
  db: Database,
  error: unknown,
  context?: ErrorLogContext
): Promise<void> {
  const errorDetails = extractErrorDetails(error)
  await logError(
    db,
    'backend',
    'error',
    errorDetails.message,
    error,
    context
  )
}

/**
 * Log a frontend error (called from API endpoint)
 */
export async function logFrontendError(
  db: Database,
  level: ErrorLogLevel,
  message: string,
  error: unknown,
  context?: ErrorLogContext
): Promise<void> {
  await logError(
    db,
    'frontend',
    level,
    message,
    error,
    context
  )
}

/**
 * Get the retention period in days from environment variable
 * Defaults to 90 days if not specified
 */
function getRetentionDays(): number {
  const retentionDays = process.env.ERROR_LOG_RETENTION_DAYS
  if (retentionDays === undefined) {
    return 90 // Default to 90 days
  }
  const parsed = parseInt(retentionDays, 10)
  if (isNaN(parsed) || parsed < 0) {
    return 90 // Default to 90 days if invalid
  }
  return parsed
}

/**
 * Clean up old error logs based on retention policy
 * Deletes error logs older than the retention period
 * 
 * @param db - Database instance
 * @param retentionDays - Optional override for retention days (uses env var if not provided)
 * @returns Number of deleted error logs
 */
export async function cleanupOldErrorLogs(
  db: Database,
  retentionDays?: number
): Promise<{ deleted: number; retentionDays: number }> {
  const days = retentionDays ?? getRetentionDays()
  
  // Calculate cutoff date
  const cutoffDate = new Date()
  cutoffDate.setDate(cutoffDate.getDate() - days)
  const cutoffTimestamp = cutoffDate.toISOString()
  
  try {
    // Count how many logs will be deleted
    const countResult = await db
      .select({ count: sql<number>`count(*)` })
      .from(errorLogs)
      .where(lt(errorLogs.timestamp, cutoffTimestamp))
    
    const countToDelete = countResult[0]?.count || 0
    
    // Delete error logs older than the cutoff date
    if (countToDelete > 0) {
      await db
        .delete(errorLogs)
        .where(lt(errorLogs.timestamp, cutoffTimestamp))
    }
    
    return {
      deleted: countToDelete,
      retentionDays: days,
    }
  } catch (error) {
    console.error('[ERROR_LOGGER] Failed to cleanup old error logs:', error)
    throw error
  }
}
