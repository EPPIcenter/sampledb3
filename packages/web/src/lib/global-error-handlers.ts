import { logErrorFromException, logErrorFromMessage } from './error-logger'

/**
 * Initialize global error handlers for the application
 * This should be called once when the app starts
 */
export function initializeGlobalErrorHandlers(): void {
  // Handle unhandled promise rejections
  window.addEventListener('unhandledrejection', (event: PromiseRejectionEvent) => {
    const reason = event.reason
    
    // Log to console
    console.error('[UNHANDLED_REJECTION]', reason)
    
    // Log to backend
    if (reason instanceof Error) {
      logErrorFromException(reason, 'error', {
        type: 'unhandledRejection',
        promise: true,
      })
    } else {
      logErrorFromMessage(
        `Unhandled promise rejection: ${String(reason)}`,
        'error',
        {
          type: 'unhandledRejection',
          promise: true,
          reason: String(reason),
        }
      )
    }
    
    // Prevent default browser behavior (optional - you may want to keep it for debugging)
    // event.preventDefault()
  })

  // Handle JavaScript errors
  window.addEventListener('error', (event: ErrorEvent) => {
    // Log to console
    console.error('[WINDOW_ERROR]', event.error || event.message)
    
    // Log to backend
    if (event.error) {
      logErrorFromException(event.error, 'error', {
        type: 'windowError',
        filename: event.filename,
        lineno: event.lineno,
        colno: event.colno,
        message: event.message,
      })
    } else {
      logErrorFromMessage(
        event.message || 'Unknown error',
        'error',
        {
          type: 'windowError',
          filename: event.filename,
          lineno: event.lineno,
          colno: event.colno,
        }
      )
    }
  })

  // Handle resource loading errors (images, scripts, etc.)
  window.addEventListener('error', (event: ErrorEvent) => {
    // Check if it's a resource loading error (not a JavaScript error)
    if (event.target && event.target !== window) {
      const target = event.target as HTMLElement
      const tagName = target.tagName.toLowerCase()
      
      if (tagName === 'img' || tagName === 'script' || tagName === 'link') {
        const src = (target as HTMLImageElement).src || 
                   (target as HTMLScriptElement).src ||
                   (target as HTMLLinkElement).href
        
        logErrorFromMessage(
          `Failed to load resource: ${tagName}`,
          'warning',
          {
            type: 'resourceLoadError',
            tagName,
            src,
          }
        )
      }
    }
  }, true) // Use capture phase to catch resource errors
}
