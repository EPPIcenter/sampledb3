import type { ApiResponse } from '../../types/api'

/** Unpack standardized API response `data` field. */
export function extractData<T>(response: { data: ApiResponse<T> }): T {
  return response.data.data
}
