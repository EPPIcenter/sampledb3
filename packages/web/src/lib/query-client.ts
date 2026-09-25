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

/**
 * Mark every cached query stale after a write that touches many kinds of records
 * (bulk import, move, cascade delete). Queries on screen refetch now; the rest
 * refetch when next used, so no page shows pre-write data for the 5-minute staleTime.
 */
export function invalidateAfterBulkWrite(client: QueryClient): Promise<void> {
  return client.invalidateQueries()
}
