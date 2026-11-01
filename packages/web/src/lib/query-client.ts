import { QueryClient, partialMatchKey, type QueryKey } from '@tanstack/react-query'

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
 *
 * `deleted` lists the keys of records the write removed (for example a deleted
 * Collection's detail key). Their queries are marked stale without refetching, so
 * the page still showing them can navigate away instead of refetching into a 404.
 */
export async function invalidateAfterBulkWrite(
  client: QueryClient,
  options: { deleted?: readonly QueryKey[] } = {}
): Promise<void> {
  const deleted = options.deleted ?? []
  if (deleted.length === 0) return client.invalidateQueries()
  const isDeleted = (key: QueryKey) => deleted.some((d) => partialMatchKey(key, d))
  await Promise.all([
    client.invalidateQueries({ predicate: (query) => !isDeleted(query.queryKey) }),
    client.invalidateQueries({ predicate: (query) => isDeleted(query.queryKey), refetchType: 'none' }),
  ])
}
