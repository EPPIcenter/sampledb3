import { axiosApi, getLastResponseRequestId } from './api/client'

export interface FrontendError {
  message: string
  stack?: string
  errorCode?: string
  level: 'error' | 'warning' | 'info'
  context?: Record<string, unknown>
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
    await axiosApi.post('/error-logs', {
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
    })
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
  logError({
    message: error.message,
    stack: error.stack,
    errorCode: error.name,
    level,
    context,
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
