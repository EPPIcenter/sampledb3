import type { UseQueryResult } from '@tanstack/react-query'

export type PresentationStatus = 'loading' | 'error' | 'empty' | 'ready'

type QueryLike = Pick<
  UseQueryResult<unknown>,
  'isPending' | 'isLoading' | 'isError' | 'isSuccess' | 'data'
>

export function fromQuery(
  query: QueryLike,
  options?: { isEmpty?: boolean }
): PresentationStatus {
  if (query.isError) return 'error'
  if (query.isPending || query.isLoading) return 'loading'
  if (options?.isEmpty) return 'empty'
  if (query.isSuccess) return 'ready'
  return 'loading'
}

export function getQueryErrorMessage(error: unknown, fallback: string): string {
  if (error && typeof error === 'object' && 'response' in error) {
    const response = (error as { response?: { data?: { error?: string } } }).response
    if (response?.data?.error) return response.data.error
  }
  if (error instanceof Error && error.message) return error.message
  return fallback
}
