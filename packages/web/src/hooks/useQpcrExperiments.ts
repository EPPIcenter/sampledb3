import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query'
import { qpcrExperimentsApi } from '../lib/api/qpcr'
import { scannerConfigurationsApi } from '../lib/api/settings'
import { dashboardKeys } from './useDashboard'

export const qpcrKeys = {
  all: ['qpcr-experiments'] as const,
  list: (status?: string) => [...qpcrKeys.all, 'list', status ?? ''] as const,
  detail: (id: number) => [...qpcrKeys.all, 'detail', id] as const,
  scannerConfigs: () => [...qpcrKeys.all, 'scanner-configs'] as const,
}

export function useQpcrExperimentsList(statusFilter?: string) {
  return useQuery({
    queryKey: qpcrKeys.list(statusFilter),
    queryFn: async () => {
      const res = await qpcrExperimentsApi.list(
        statusFilter ? { status: statusFilter } : undefined
      )
      return res.experiments
    },
  })
}

export function useQpcrExperiment(experimentId: number) {
  return useQuery({
    queryKey: qpcrKeys.detail(experimentId),
    queryFn: () => qpcrExperimentsApi.get(experimentId),
    enabled: Number.isFinite(experimentId) && experimentId > 0,
  })
}

export function useQpcrScannerConfigurations() {
  return useQuery({
    queryKey: qpcrKeys.scannerConfigs(),
    queryFn: async () => {
      const res = await scannerConfigurationsApi.getShared()
      return res.configurations ?? []
    },
  })
}

/** Invalidate list, detail, and dashboard widgets after qPCR experiment changes. */
export function invalidateQpcrExperimentQueries(queryClient: QueryClient) {
  void queryClient.invalidateQueries({ queryKey: qpcrKeys.all })
  void queryClient.invalidateQueries({ queryKey: dashboardKeys.qpcr() })
}

export function useCreateQpcrExperiment() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (data: Parameters<typeof qpcrExperimentsApi.create>[0]) =>
      qpcrExperimentsApi.create(data),
    onSuccess: () => {
      invalidateQpcrExperimentQueries(queryClient)
    },
  })
}

export function useDeleteQpcrExperiment() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (id: number) => qpcrExperimentsApi.delete(id),
    onSuccess: () => {
      invalidateQpcrExperimentQueries(queryClient)
    },
  })
}
