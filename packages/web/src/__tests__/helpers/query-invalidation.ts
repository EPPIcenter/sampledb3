import { QueryClient, QueryObserver, type QueryKey } from '@tanstack/react-query'
import { expect, vi } from 'vitest'

/** A query client for hook tests: no retries, and cached data kept until the test ends. */
export function createInvalidationTestClient(): QueryClient {
  return new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
}

/** Cache data under each key, as pages elsewhere in the app would have, so a test can see which a write invalidates. */
export function seedQueries(client: QueryClient, keys: readonly QueryKey[]): void {
  for (const key of keys) client.setQueryData(key, { seeded: true })
}

/** The keys among `keys` whose cached query is not invalidated. */
export function keysNotInvalidated(client: QueryClient, keys: readonly QueryKey[]): QueryKey[] {
  return keys.filter((key) => client.getQueryState(key)?.isInvalidated !== true)
}

/**
 * Keep a query on screen, as a mounted page would, and resolve once its first fetch is done.
 * The returned `queryFn` counts fetches, so a test can tell whether a write refetched the query.
 */
export async function observeQuery(client: QueryClient, key: QueryKey) {
  const queryFn = vi.fn().mockResolvedValue({ observed: true })
  const observer = new QueryObserver(client, { queryKey: key, queryFn })
  const unsubscribe = observer.subscribe(() => {})
  await vi.waitFor(() => expect(queryFn).toHaveBeenCalledTimes(1))
  await vi.waitFor(() => expect(client.getQueryState(key)?.status).toBe('success'))
  return { queryFn, unsubscribe }
}
