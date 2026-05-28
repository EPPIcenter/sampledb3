import type { ExportConfigurations } from './settings'

const RETIRED_EXPORT_COLUMN_KEYS: Record<string, string> = {
  state: 'tags',
}

/**
 * Idempotently rewrite retired export column keys (state → tags).
 */
export function migrateExportConfigurationColumnKeys(
  configs: ExportConfigurations,
): { configs: ExportConfigurations; changed: boolean } {
  let changed = false
  const configurations = configs.configurations.map((config) => {
    let configChanged = false
    const columns = config.columns.map((key) => {
      const migrated = RETIRED_EXPORT_COLUMN_KEYS[key]
      if (migrated) {
        configChanged = true
        return migrated
      }
      return key
    })
    if (configChanged) {
      changed = true
      return { ...config, columns }
    }
    return config
  })

  if (!changed) {
    return { configs, changed: false }
  }

  return {
    configs: { configurations },
    changed: true,
  }
}
