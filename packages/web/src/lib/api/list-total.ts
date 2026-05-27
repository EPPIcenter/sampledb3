type PaginatedListBody = {
  pagination?: { total?: number }
  [key: string]: unknown
}

/** Read total row count from a paginated list endpoint (`limit: 1`). */
export async function listTotal(
  fetchPage: (params: { limit: number; created_to?: string }) => Promise<PaginatedListBody>,
  arrayKey: string,
  extraParams?: { created_to?: string },
): Promise<number> {
  try {
    const res = await fetchPage({ limit: 1, ...extraParams })
    if (res.pagination?.total != null) return res.pagination.total
    const arr = res[arrayKey]
    return Array.isArray(arr) ? arr.length : 0
  } catch {
    return 0
  }
}
