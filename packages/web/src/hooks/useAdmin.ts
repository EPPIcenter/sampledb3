import { useQuery } from '@tanstack/react-query'
import { adminApi } from '../lib/api/admin'
import { errorLogsApi, type ErrorLogsQueryParams } from '../lib/api/error-logs'

export const adminKeys = {
  all: ['admin'] as const,
  systemStats: () => [...adminKeys.all, 'system-stats'] as const,
  users: (includeDeleted: boolean) => [...adminKeys.all, 'users', includeDeleted] as const,
  errorLogs: (params: Omit<ErrorLogsQueryParams, 'page' | 'limit'>) =>
    [...adminKeys.all, 'error-logs', params] as const,
  integrityReport: () => [...adminKeys.all, 'integrity-report'] as const,
}

export function useAdminSystemStats() {
  return useQuery({
    queryKey: adminKeys.systemStats(),
    queryFn: () => adminApi.getSystemStats(),
  })
}

export function useAdminUsers(includeDeleted: boolean) {
  return useQuery({
    queryKey: adminKeys.users(includeDeleted),
    queryFn: async () => {
      const res = await adminApi.getUsers(includeDeleted)
      return res.users
    },
  })
}

export function useAdminErrorLogs(params: Omit<ErrorLogsQueryParams, 'page' | 'limit'>) {
  return useQuery({
    queryKey: adminKeys.errorLogs(params),
    queryFn: async () => {
      const res = await errorLogsApi.list(params as ErrorLogsQueryParams)
      return res.logs
    },
  })
}

export function useAdminIntegrityReport() {
  return useQuery({
    queryKey: adminKeys.integrityReport(),
    queryFn: () => adminApi.getIntegrityReport(),
  })
}
