import type { ApiResponse } from '../../types/api'

/** Unpack standardized API envelope `{ data, meta? }` from an unwrapped response body. */
export function extractData<T>(body: ApiResponse<T>): T {
  return body.data
}
