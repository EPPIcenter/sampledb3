export type PaginatedListBody = {
  pagination?: { total?: number }
  [key: string]: unknown
}

export type ListTotalParams = { limit: number; created_from?: string; created_to?: string }

/**
 * Read the total row count from a paginated list endpoint (`limit: 1`). A failed request
 * rejects, so the caller can show an error instead of a count of 0.
 */
export async function listTotal(
  fetchPage: (params: ListTotalParams) => Promise<PaginatedListBody>,
  arrayKey: string,
  extraParams?: Omit<ListTotalParams, 'limit'>,
): Promise<number> {
  const res = await fetchPage({ limit: 1, ...extraParams })
  if (res.pagination?.total != null) return res.pagination.total
  const arr = res[arrayKey]
  if (Array.isArray(arr)) return arr.length
  throw new Error(`List response has neither pagination.total nor a "${arrayKey}" array`)
}
