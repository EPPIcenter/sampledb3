import { useState, useEffect, useCallback } from 'react'
import { exportConfigurationsApi, type ExportConfiguration } from '../lib/api/settings'

export type ExportConfigurationWithSource = ExportConfiguration & {
  source?: 'shared' | 'personal'
}

export interface UseExportConfigurationsResult {
  configurations: ExportConfigurationWithSource[]
  selectedConfigId: string
  setSelectedConfigId: (id: string) => void
  loading: boolean
  error: string | null
  loadConfigurations: () => Promise<void>
}

/**
 * Load shared and personal export configurations, merge with source, set default selection.
 * Used by Export page, BarcodeExport, ExportModal, and collection table view (plate, box, bag, sheet).
 */
export function useExportConfigurations(): UseExportConfigurationsResult {
  const [configurations, setConfigurations] = useState<ExportConfigurationWithSource[]>([])
  const [selectedConfigId, setSelectedConfigId] = useState<string>('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const loadConfigurations = useCallback(async () => {
    try {
      setLoading(true)
      setError(null)
      const [sharedRes, personalRes] = await Promise.all([
        exportConfigurationsApi.getShared(),
        exportConfigurationsApi.getPersonal().catch(() => ({ configurations: [] })),
      ])

      const sharedConfigs = sharedRes.configurations
      const personalConfigs = personalRes.configurations
      const hasPersonalDefault = personalConfigs.some((c) => c.isDefault === true)

      const merged: ExportConfigurationWithSource[] = [
        ...personalConfigs.map((c) => ({ ...c, source: 'personal' as const })),
        ...sharedConfigs.map((c) => ({
          ...c,
          isDefault: hasPersonalDefault ? false : c.isDefault,
          source: 'shared' as const,
        })),
      ]

      setConfigurations(merged)

      if (merged.length > 0) {
        const defaultConfig = merged.find((c) => c.isDefault)
        if (defaultConfig) {
          setSelectedConfigId(`${defaultConfig.source}:${defaultConfig.name}`)
        } else {
          setSelectedConfigId(`${merged[0].source}:${merged[0].name}`)
        }
      } else {
        setSelectedConfigId('')
      }
    } catch (err: unknown) {
      const message = err && typeof err === 'object' && 'response' in err
        ? (err as { response?: { data?: { error?: string } } }).response?.data?.error
        : null
      setError(message ?? 'Failed to load export configurations')
      console.error('Failed to load export configurations:', err)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadConfigurations()
  }, [loadConfigurations])

  return {
    configurations,
    selectedConfigId,
    setSelectedConfigId,
    loading,
    error,
    loadConfigurations,
  }
}
