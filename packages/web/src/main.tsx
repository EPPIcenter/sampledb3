import React from 'react'
import ReactDOM from 'react-dom/client'
import { QueryClientProvider } from '@tanstack/react-query'
import { queryClient } from './lib/query-client'
import { ToastProvider } from './contexts/ToastContext'
import { ErrorBoundaryWrapper } from './components/ErrorBoundary'
import { initializeGlobalErrorHandlers } from './lib/global-error-handlers'
import App from './App'
import './index.css'

// Initialize global error handlers
initializeGlobalErrorHandlers()

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ErrorBoundaryWrapper>
      <QueryClientProvider client={queryClient}>
        <ToastProvider>
          <App />
        </ToastProvider>
      </QueryClientProvider>
    </ErrorBoundaryWrapper>
  </React.StrictMode>,
)
