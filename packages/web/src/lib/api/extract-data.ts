import type { ApiResponse } from '../../types/api'
import { parseApiResponseData } from './parse-response'

/** Unpack and validate CRUD list envelope `{ data, meta? }` from an unwrapped response body. */
export function extractData<T>(body: ApiResponse<T> | unknown): T {
  return parseApiResponseData<T>(body, 'ApiResponse')
}
