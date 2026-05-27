import { useQuery } from '@tanstack/react-query'
import { qpcrExperimentsApi } from '../lib/api/qpcr'
import { scannerConfigurationsApi } from '../lib/api/settings'

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
