import { QueryClient } from '@tanstack/react-query'

/**
 * Default query client configuration
 * Note: React Query errors are handled by:
 * - Error boundaries (ErrorBoundary component)
 * - Global error handlers (global-error-handlers.ts)
 * - Individual query/mutation error handlers in hooks
 */
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60 * 1000, // 5 minutes
      gcTime: 10 * 60 * 1000, // 10 minutes (formerly cacheTime)
      retry: 1,
      refetchOnWindowFocus: false,
    },
    mutations: {
      retry: false,
    },
  },
})



