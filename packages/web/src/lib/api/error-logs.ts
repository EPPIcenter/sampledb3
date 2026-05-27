import { api } from './client'
export interface ErrorLog {
  id: number
  timestamp: string
  source: 'frontend' | 'backend'
  level: 'error' | 'warning' | 'info'
  message: string
  errorCode?: string
  stack?: string
  context?: Record<string, unknown>
  userId?: number
  url?: string
  userAgent?: string
  resolved: boolean
  resolvedAt?: string
  resolvedBy?: number
}

export interface ErrorLogsResponse {
  logs: ErrorLog[]
  pagination: {
    page: number
    limit: number
    total: number
    totalPages: number
  }
}

export interface ErrorLogsQueryParams {
  source?: 'frontend' | 'backend'
  level?: 'error' | 'warning' | 'info'
  resolved?: boolean
  page?: number
  limit?: number
  search?: string
}

export interface CleanupResponse {
  success: boolean
  deleted: number
  retentionDays: number
  message: string
}
export const errorLogsApi = {
  list: (params?: ErrorLogsQueryParams) =>
    api.get<ErrorLogsResponse>('/error-logs', { params }),
  get: (id: number) =>
    api.get<ErrorLog>(`/error-logs/${id}`),
  resolve: (id: number) =>
    api.patch<{ success: boolean }>(`/error-logs/${id}/resolve`),
  cleanup: (retentionDays?: number) =>
    api.post<CleanupResponse>('/error-logs/cleanup', retentionDays ? { retentionDays } : {}),
}
