import React, { Component, ErrorInfo, ReactNode } from 'react'
import { logErrorFromException } from '../lib/error-logger'

interface Props {
  children: ReactNode
  fallback?: ReactNode
}

interface State {
  hasError: boolean
  error: Error | null
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('ErrorBoundary caught an error:', error, errorInfo)
    
    // Log error to backend
    logErrorFromException(error, 'error', {
      componentStack: errorInfo.componentStack,
      errorBoundary: true,
    })
  }

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback
      }

      return (
        <div className="min-h-screen flex items-center justify-center bg-app-bg">
          <div className="max-w-md w-full bg-app-card shadow-lg rounded-lg p-6 border border-app-border">
            <div className="flex items-center gap-3 mb-4">
              <svg
                className="w-8 h-8 text-app-trend-down"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
                />
              </svg>
              <h2 className="text-xl font-semibold text-app-text">Something went wrong</h2>
            </div>
            <p className="text-app-text-muted mb-4">
              {this.state.error?.message || 'An unexpected error occurred'}
            </p>
            <button
              onClick={() => {
                this.setState({ hasError: false, error: null })
                window.location.reload()
              }}
              className="w-full px-4 py-2 bg-app-accent text-white rounded-lg hover:bg-app-accent-hover transition-colors"
            >
              Reload Page
            </button>
          </div>
        </div>
      )
    }

    return this.props.children
  }
}

// Hook-based error boundary for functional components
export function ErrorBoundaryWrapper({ children }: { children: ReactNode }) {
  return (
    <ErrorBoundary
      fallback={
        <div className="min-h-screen flex items-center justify-center bg-app-bg">
          <div className="max-w-md w-full bg-app-card shadow-lg rounded-lg p-6 border border-app-border">
            <h2 className="text-xl font-semibold text-app-text mb-4">Something went wrong</h2>
            <p className="text-app-text-muted mb-4">
              An unexpected error occurred. Please try refreshing the page.
            </p>
            <button
              onClick={() => window.location.reload()}
              className="w-full px-4 py-2 bg-app-accent text-white rounded-lg hover:bg-app-accent-hover transition-colors"
            >
              Reload Page
            </button>
          </div>
        </div>
      }
    >
      {children}
    </ErrorBoundary>
  )
}
