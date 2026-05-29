/**
 * Structured stdout observability (Fly logs, local dev).
 * DB persistence lives in error-logger.ts — not here.
 */

export enum LogLevel {
  DEBUG = 'debug',
  INFO = 'info',
  WARN = 'warn',
  ERROR = 'error',
}

export type LogFormat = 'pretty' | 'json'

export interface LogEntry {
  timestamp: string
  level: LogLevel
  message: string
  context?: Record<string, unknown>
  error?: {
    name: string
    message: string
    stack?: string
  }
  requestId?: string
  duration?: number
}

export function generateRequestId(): string {
  return `req_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`
}

export function resolveLogFormat(): LogFormat {
  const configured = process.env.LOG_FORMAT?.toLowerCase()
  if (configured === 'pretty' || configured === 'json') {
    return configured
  }
  if (process.env.NODE_ENV !== 'production' && process.stdout.isTTY) {
    return 'pretty'
  }
  return 'json'
}

function createLogEntry(
  level: LogLevel,
  message: string,
  context?: Record<string, unknown>,
  error?: Error,
): LogEntry {
  const entry: LogEntry = {
    timestamp: new Date().toISOString(),
    level,
    message,
  }

  if (context && Object.keys(context).length > 0) {
    entry.context = context
    if (typeof context.requestId === 'string') {
      entry.requestId = context.requestId
    }
    if (typeof context.duration === 'number') {
      entry.duration = context.duration
    }
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

function formatPretty(entry: LogEntry): string {
  const header = `${entry.timestamp} ${entry.level.toUpperCase()} ${entry.message}`
  const lines = [header]

  if (entry.requestId) {
    lines.push(`  requestId: ${entry.requestId}`)
  }
  if (entry.duration !== undefined) {
    lines.push(`  duration: ${entry.duration}ms`)
  }
  if (entry.context) {
    for (const [key, value] of Object.entries(entry.context)) {
      if (key === 'requestId' || key === 'duration') continue
      lines.push(`  ${key}: ${typeof value === 'string' ? value : JSON.stringify(value)}`)
    }
  }
  if (entry.error) {
    lines.push(`  error: ${entry.error.name}: ${entry.error.message}`)
  }

  return lines.join('\n')
}

function emit(level: LogLevel, entry: LogEntry): void {
  const formatted =
    resolveLogFormat() === 'json' ? JSON.stringify(entry) : formatPretty(entry)

  switch (level) {
    case LogLevel.WARN:
      console.warn(formatted)
      break
    case LogLevel.ERROR:
      console.error(formatted)
      break
    default:
      console.log(formatted)
  }
}

export function logDebug(message: string, context?: Record<string, unknown>): void {
  if (process.env.NODE_ENV === 'development') {
    emit(LogLevel.DEBUG, createLogEntry(LogLevel.DEBUG, message, context))
  }
}

export function logInfo(message: string, context?: Record<string, unknown>): void {
  emit(LogLevel.INFO, createLogEntry(LogLevel.INFO, message, context))
}

export function logWarn(
  message: string,
  context?: Record<string, unknown>,
  error?: Error,
): void {
  emit(LogLevel.WARN, createLogEntry(LogLevel.WARN, message, context, error))
}

export function logError(
  message: string,
  error?: Error,
  context?: Record<string, unknown>,
): void {
  emit(LogLevel.ERROR, createLogEntry(LogLevel.ERROR, message, context, error))
}

export function logPerformance(
  operation: string,
  duration: number,
  context?: Record<string, unknown>,
): void {
  logInfo(`Performance: ${operation}`, {
    ...context,
    duration,
    operation,
  })
}

export function logRequest(params: {
  method: string
  path: string
  status: number
  duration: number
  requestId: string
}): void {
  logInfo('HTTP request', {
    type: 'request',
    method: params.method,
    path: params.path,
    status: params.status,
    duration: params.duration,
    requestId: params.requestId,
  })
}

export function createTimer(operation: string, context?: Record<string, unknown>) {
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
