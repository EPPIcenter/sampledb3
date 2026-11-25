import { fitErrorReportToLimits } from '@sampledb/contract'
import { axiosApi, getLastResponseRequestId } from './api/client'

export interface FrontendError {
  message: string
  stack?: string
  errorCode?: string
  level: 'error' | 'warning' | 'info'
  context?: Record<string, unknown>
}

/** Context entries a report keeps when its context is over the API's size cap. */
const REPORT_CONTEXT_KEYS_KEPT_WHEN_TRUNCATED = [
  'requestId',
  'userAgent',
  'url',
  'timestamp',
  'requestMethod',
  'requestPath',
  'responseError',
] as const

const MAX_RESPONSE_ERROR_LENGTH = 1_000
const MAX_RESPONSE_DETAILS_JSON_LENGTH = 4_000
const TRUNCATION_MARK = '…[truncated]'

function extractRequestPath(baseURL?: string, url?: string): string | undefined {
  if (!url && !baseURL) return undefined
  const rawUrl = url ?? ''
  const rawBase = baseURL ?? ''
  let combined: string
  if (/^https?:\/\//i.test(rawUrl)) {
    combined = rawUrl
  } else if (rawBase) {
    const base = rawBase.replace(/\/+$/, '')
    const rel = rawUrl.replace(/^\/+/, '')
    combined = rel ? `${base}/${rel}` : base
  } else {
    combined = rawUrl
  }
  try {
    return new URL(combined, 'http://localhost').pathname
  } catch {
    return combined.split(/[?#]/, 1)[0] || undefined
  }
}

function capResponseDetails(details: unknown): unknown {
  try {
    const serialized = JSON.stringify(details) as string | undefined
    if (serialized === undefined) return undefined
    if (serialized.length <= MAX_RESPONSE_DETAILS_JSON_LENGTH) return details
    return serialized.slice(0, MAX_RESPONSE_DETAILS_JSON_LENGTH - TRUNCATION_MARK.length) + TRUNCATION_MARK
  } catch {
    return String(details).slice(0, MAX_RESPONSE_ERROR_LENGTH)
  }
}

/**
 * Pull safe HTTP failure metadata off an Axios-like error: method, URL path (no query/hash),
 * response status, and response `error` / `details`. Never reads request bodies, headers, or cookies.
 */
export function extractFailedRequestContext(error: unknown): Record<string, unknown> | undefined {
  if (!error || typeof error !== 'object') return undefined
  const err = error as {
    isAxiosError?: unknown
    config?: { method?: unknown; baseURL?: unknown; url?: unknown }
    response?: { status?: unknown; data?: unknown }
  }
  if (!err.isAxiosError && !err.response && !err.config) return undefined

  const info: Record<string, unknown> = {}
  if (typeof err.config?.method === 'string' && err.config.method.trim()) {
    info.requestMethod = err.config.method.trim().toUpperCase()
  }
  const requestPath = extractRequestPath(
    typeof err.config?.baseURL === 'string' ? err.config.baseURL : undefined,
    typeof err.config?.url === 'string' ? err.config.url : undefined,
  )
  if (requestPath) {
    info.requestPath = requestPath
  }
  if (typeof err.response?.status === 'number' && Number.isFinite(err.response.status)) {
    info.responseStatus = err.response.status
  }
  const data = err.response?.data
  if (data && typeof data === 'object' && !Array.isArray(data)) {
    const body = data as Record<string, unknown>
    if (body.error !== undefined) {
      const errorText = typeof body.error === 'string' ? body.error : String(body.error)
      info.responseError =
        errorText.length <= MAX_RESPONSE_ERROR_LENGTH
          ? errorText
          : errorText.slice(0, MAX_RESPONSE_ERROR_LENGTH - TRUNCATION_MARK.length) + TRUNCATION_MARK
    }
    if (body.details !== undefined) {
      const capped = capResponseDetails(body.details)
      if (capped !== undefined) info.responseDetails = capped
    }
  }
  return Object.keys(info).length > 0 ? info : undefined
}

// Error queue to batch errors and avoid overwhelming the server
const errorQueue: FrontendError[] = []
const MAX_QUEUE_SIZE = 10
let isProcessingQueue = false
let queueTimeout: ReturnType<typeof setTimeout> | null = null

/**
 * Send a single error to the backend
 */
async function sendError(error: FrontendError): Promise<void> {
  const requestId =
    (typeof error.context?.requestId === 'string' ? error.context.requestId : undefined) ??
    getLastResponseRequestId()

  try {
    // The API rejects a report over its size caps, so cut it to fit rather than lose it.
    const report = fitErrorReportToLimits(
      {
        message: error.message,
        stack: error.stack,
        errorCode: error.errorCode,
        level: error.level,
        context: {
          ...error.context,
          ...(requestId ? { requestId } : {}),
          userAgent: navigator.userAgent,
          url: window.location.href,
          timestamp: new Date().toISOString(),
        },
      },
      REPORT_CONTEXT_KEYS_KEPT_WHEN_TRUNCATED
    )
    await axiosApi.post('/error-logs', report)
  } catch (err) {
    // If logging fails, fall back to console
    console.error('[ERROR_LOGGER] Failed to send error to backend:', err)
    console.error('[ERROR_LOGGER] Original error:', error)
  }
}

/**
 * Process the error queue
 */
async function processQueue(): Promise<void> {
  if (isProcessingQueue || errorQueue.length === 0) {
    return
  }

  isProcessingQueue = true

  // Process errors one at a time to avoid overwhelming the server
  while (errorQueue.length > 0) {
    const error = errorQueue.shift()
    if (error) {
      await sendError(error)
      // Small delay between errors to avoid rate limiting
      await new Promise((resolve) => setTimeout(resolve, 100))
    }
  }

  isProcessingQueue = false
}

/**
 * Queue an error for sending
 */
function queueError(error: FrontendError): void {
  // Add to queue
  errorQueue.push(error)

  // Limit queue size to prevent memory issues
  if (errorQueue.length > MAX_QUEUE_SIZE) {
    // Remove oldest errors
    errorQueue.shift()
  }

  // Clear existing timeout
  if (queueTimeout) {
    clearTimeout(queueTimeout)
  }

  // Process queue after a short delay (batch errors)
  queueTimeout = setTimeout(() => {
    processQueue().catch((err) => {
      console.error('[ERROR_LOGGER] Error processing queue:', err)
    })
  }, 1000) // Wait 1 second to batch errors
}

/**
 * Log an error from the frontend
 * This function is non-blocking and handles failures gracefully
 */
export async function logError(error: FrontendError): Promise<void> {
  // Always log to console for immediate debugging
  if (error.level === 'error') {
    console.error('[FRONTEND_ERROR]', error.message, error)
  } else if (error.level === 'warning') {
    console.warn('[FRONTEND_WARNING]', error.message, error)
  } else {
    console.info('[FRONTEND_INFO]', error.message, error)
  }

  // Queue for sending to backend (non-blocking)
  queueError(error)
}

/**
 * Log an error from an Error object
 */
export function logErrorFromException(
  error: Error,
  level: 'error' | 'warning' | 'info' = 'error',
  context?: Record<string, unknown>,
): void {
  const httpContext = extractFailedRequestContext(error)
  logError({
    message: error.message,
    stack: error.stack,
    errorCode: error.name,
    level,
    context: httpContext ? { ...httpContext, ...context } : context,
  })
}

/**
 * Log an error from a string message
 */
export function logErrorFromMessage(
  message: string,
  level: 'error' | 'warning' | 'info' = 'error',
  context?: Record<string, unknown>,
): void {
  logError({
    message,
    level,
    context,
  })
}
