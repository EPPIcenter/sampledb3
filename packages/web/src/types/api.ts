/**
 * Frontend API response types matching backend
 */

export interface ApiResponse<T> {
  data: T
  meta?: {
    pagination?: PaginationMeta
    filters?: Record<string, any>
  }
}

export interface PaginationMeta {
  page: number
  limit: number
  total: number
  totalPages: number
}

export interface ApiError {
  error: string
  errorCode: string
  details?: any
}
