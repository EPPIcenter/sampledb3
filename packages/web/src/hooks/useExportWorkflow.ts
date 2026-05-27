import { useEffect, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { tagsApi } from '../lib/api/reference-data'
import { collectionsApi } from '../lib/api/collections'
import { settingsApi, type ExportConfiguration, type ScannerConfiguration } from '../lib/api/settings'
import { formatExportConfigId } from '../lib/export-config-selection'
import { getQueryErrorMessage } from '../ui'
import { useSpecimenTypes } from './useReferenceData'

export type ExportConfigurationWithSource = ExportConfiguration & {
  source?: 'shared' | 'personal'
}

export const exportWorkflowKeys = {
  all: ['export-workflow'] as const,
  referenceData: () => [...exportWorkflowKeys.all, 'reference-data'] as const,
  configurations: () => [...exportWorkflowKeys.all, 'configurations'] as const,
  plateScanBootstrap: () => [...exportWorkflowKeys.all, 'plate-scan-bootstrap'] as const,
}

async function fetchMergedExportConfigurations(): Promise<ExportConfigurationWithSource[]> {
  const [sharedRes, personalRes] = await Promise.all([
    settingsApi.getValue('export_configurations', { scope: 'shared' }),
    settingsApi
      .getValue('export_configurations', { scope: 'personal' })
      .catch(() => ({ configurations: [] as ExportConfiguration[] })),
  ])

  const sharedConfigs = sharedRes?.configurations ?? []
  const personalConfigs = personalRes?.configurations ?? []
  const hasPersonalDefault = personalConfigs.some((c) => c.isDefault === true)

  return [
    ...personalConfigs.map((c) => ({ ...c, source: 'personal' as const })),
    ...sharedConfigs.map((c) => ({
      ...c,
      isDefault: hasPersonalDefault ? false : c.isDefault,
      source: 'shared' as const,
    })),
  ]
}

/** Specimen types + tags for Export page filters. */
export function useExportReferenceData() {
  const specimenTypesQuery = useSpecimenTypes({ silent: true })
  const tagsQuery = useQuery({
    queryKey: [...exportWorkflowKeys.referenceData(), 'tags'] as const,
    queryFn: async () => (await tagsApi.list()).data,
  })

  const isLoading = specimenTypesQuery.isLoading || tagsQuery.isLoading
  const isError = specimenTypesQuery.isError || tagsQuery.isError
  const errorMessage = specimenTypesQuery.isError
    ? getQueryErrorMessage(specimenTypesQuery.error, 'Failed to load specimen types')
    : tagsQuery.isError
      ? getQueryErrorMessage(tagsQuery.error, 'Failed to load tags')
      : null

  const specimenTypes = (specimenTypesQuery.data ?? []).map((st) => ({
    ...st,
    created: st.created || '',
    lastUpdated: st.lastUpdated || '',
  }))

  return {
    specimenTypes,
    tags: tagsQuery.data ?? [],
    isLoading,
    isError,
    errorMessage,
    refetch: () => {
      void specimenTypesQuery.refetch()
      void tagsQuery.refetch()
    },
  }
}

export interface UseExportConfigurationsResult {
  configurations: ExportConfigurationWithSource[]
  selectedConfigId: string
  setSelectedConfigId: (id: string) => void
  loading: boolean
  error: string | null
  loadConfigurations: () => Promise<unknown>
}

/**
 * Load shared and personal export configurations, merge with source, set default selection.
 */
export function useExportConfigurations(): UseExportConfigurationsResult {
  const query = useQuery({
    queryKey: exportWorkflowKeys.configurations(),
    queryFn: fetchMergedExportConfigurations,
  })

  const [selectedConfigId, setSelectedConfigId] = useState('')

  useEffect(() => {
    const merged = query.data
    if (!merged) return
    if (merged.length === 0) {
      setSelectedConfigId('')
      return
    }
    setSelectedConfigId((prev) => {
      if (prev && merged.some((c) => formatExportConfigId(c.source!, c.name) === prev)) {
        return prev
      }
      const defaultConfig = merged.find((c) => c.isDefault)
      const pick = defaultConfig ?? merged[0]
      return formatExportConfigId(pick.source!, pick.name)
    })
  }, [query.data])

  return {
    configurations: query.data ?? [],
    selectedConfigId,
    setSelectedConfigId,
    loading: query.isLoading,
    error: query.isError
      ? getQueryErrorMessage(query.error, 'Failed to load export configurations')
      : null,
    loadConfigurations: () => query.refetch(),
  }
}

export type PlateScanPlate = { id: number; name: string }

/** Micronix plates + effective scanner configurations for plate scan validation. */
export function usePlateScanBootstrap() {
  const platesQuery = useQuery({
    queryKey: [...exportWorkflowKeys.plateScanBootstrap(), 'plates'] as const,
    queryFn: async (): Promise<PlateScanPlate[]> => {
      const res = await collectionsApi.listCollectionsByType('micronix_plate')
      return (res.collections ?? []).map((c) => ({
        id: c.id,
        name: c.name,
      }))
    },
  })

  const scannerQuery = useQuery({
    queryKey: [...exportWorkflowKeys.plateScanBootstrap(), 'scanner-configs'] as const,
    queryFn: async (): Promise<ScannerConfiguration[]> => {
      const value = await settingsApi.getValue('scanner_configurations')
      return value?.configurations ?? []
    },
  })

  const isLoading = platesQuery.isLoading || scannerQuery.isLoading
  const isError = platesQuery.isError || scannerQuery.isError
  const errorMessage = platesQuery.isError
    ? getQueryErrorMessage(platesQuery.error, 'Failed to load plate list')
    : scannerQuery.isError
      ? getQueryErrorMessage(scannerQuery.error, 'Failed to load scanner configurations')
      : null

  return {
    plates: platesQuery.data ?? [],
    scannerConfigurations: scannerQuery.data ?? [],
    isLoading,
    isError,
    errorMessage,
    refetch: () => {
      void platesQuery.refetch()
      void scannerQuery.refetch()
    },
  }
}
