import { useState, useEffect, useCallback } from 'react'
import { settingsApi, type TableViewConfiguration } from '../lib/api/settings'

export interface UseTableViewConfigurationsResult {
  configurations: TableViewConfiguration[]
  selectedConfigId: string
  setSelectedConfigId: (id: string) => void
  loading: boolean
  error: string | null
  loadConfigurations: () => Promise<void>
}

/**
 * Load table view configurations (system-wide). Used by collection table views
 * (plate, box, bag, sheet) for column selection. Default = isDefault or first.
 */
export function useTableViewConfigurations(): UseTableViewConfigurationsResult {
  const [configurations, setConfigurations] = useState<TableViewConfiguration[]>([])
  const [selectedConfigId, setSelectedConfigId] = useState<string>('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const loadConfigurations = useCallback(async () => {
    try {
      setLoading(true)
      setError(null)
      const configsValue = await settingsApi.getValue('table_view_configurations')
      const configs = configsValue?.configurations ?? []
      setConfigurations(configs)
      if (configs.length > 0) {
        const defaultConfig = configs.find((c) => c.isDefault)
        setSelectedConfigId((defaultConfig ?? configs[0]).name)
      } else {
        setSelectedConfigId('')
      }
    } catch (err: unknown) {
      const message =
        err && typeof err === 'object' && 'response' in err
          ? (err as { response?: { data?: { error?: string } } }).response?.data?.error
          : null
      setError(message ?? 'Failed to load table view configurations')
      console.error('Failed to load table view configurations:', err)
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
