/**
 * Structured logging utility
 * Provides consistent JSON-formatted logs for better observability
 */

export enum LogLevel {
  DEBUG = 'debug',
  INFO = 'info',
  WARN = 'warn',
  ERROR = 'error',
}

interface LogEntry {
  timestamp: string
  level: LogLevel
  message: string
  context?: Record<string, any>
  error?: {
    name: string
    message: string
    stack?: string
  }
  requestId?: string
  duration?: number
}

/**
 * Generate a request ID for tracking requests across logs
 */
export function generateRequestId(): string {
  return `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
}

/**
 * Create a structured log entry
 */
function createLogEntry(
  level: LogLevel,
  message: string,
  context?: Record<string, any>,
  error?: Error
): LogEntry {
  const entry: LogEntry = {
    timestamp: new Date().toISOString(),
    level,
    message,
  }

  if (context) {
    entry.context = context
  }

  if (error) {
    entry.error = {
      name: error.name,
      message: error.message,
      stack: error.stack,
    }
  }

  return entry
}

/**
 * Log a debug message
 */
export function logDebug(message: string, context?: Record<string, any>) {
  if (process.env.NODE_ENV === 'development') {
    const entry = createLogEntry(LogLevel.DEBUG, message, context)
    console.log(JSON.stringify(entry))
  }
}

/**
 * Log an info message
 */
export function logInfo(message: string, context?: Record<string, any>) {
  const entry = createLogEntry(LogLevel.INFO, message, context)
  console.log(JSON.stringify(entry))
}

/**
 * Log a warning message
 */
export function logWarn(message: string, context?: Record<string, any>, error?: Error) {
  const entry = createLogEntry(LogLevel.WARN, message, context, error)
  console.warn(JSON.stringify(entry))
}

/**
 * Log an error message
 */
export function logError(message: string, error?: Error, context?: Record<string, any>) {
  const entry = createLogEntry(LogLevel.ERROR, message, context, error)
  console.error(JSON.stringify(entry))
}

/**
 * Log performance metrics
 */
export function logPerformance(
  operation: string,
  duration: number,
  context?: Record<string, any>
) {
  const entry = createLogEntry(LogLevel.INFO, `Performance: ${operation}`, {
    ...context,
    duration,
    operation,
  })
  console.log(JSON.stringify(entry))
}

/**
 * Create a performance timer
 */
export function createTimer(operation: string, context?: Record<string, any>) {
  const start = Date.now()
  return {
    end: () => {
      const duration = Date.now() - start
      logPerformance(operation, duration, context)
      return duration
    },
    getDuration: () => Date.now() - start,
  }
}
