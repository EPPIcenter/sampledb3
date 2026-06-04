import type { ExportConfigurations } from './settings'

const RETIRED_EXPORT_COLUMN_KEYS: Record<string, string> = {
  state: 'tags',
  label: 'sheet_name',
}

function rewriteRetiredColumnKeys(columns: string[]): { columns: string[]; changed: boolean } {
  let changed = false
  const rewritten = columns.map((key) => {
    const migrated = RETIRED_EXPORT_COLUMN_KEYS[key]
    if (migrated) {
      changed = true
      return migrated
    }
    return key
  })
  return { columns: rewritten, changed }
}

function appendSublabelWhenNeeded(columns: string[]): { columns: string[]; changed: boolean } {
  const hasPaperContext = columns.some((key) => key === 'barcode' || key === 'sheet_name')
  if (!hasPaperContext || columns.includes('sublabel')) {
    return { columns, changed: false }
  }

  const sheetIdx = columns.indexOf('sheet_name')
  if (sheetIdx >= 0) {
    return {
      columns: [...columns.slice(0, sheetIdx + 1), 'sublabel', ...columns.slice(sheetIdx + 1)],
      changed: true,
    }
  }

  const barcodeIdx = columns.indexOf('barcode')
  if (barcodeIdx >= 0) {
    return {
      columns: [...columns.slice(0, barcodeIdx + 1), 'sublabel', ...columns.slice(barcodeIdx + 1)],
      changed: true,
    }
  }

  return { columns: [...columns, 'sublabel'], changed: true }
}

/**
 * Idempotently rewrite retired export column keys and append sublabel for mixed tube+paper configs.
 */
export function migrateExportConfigurationColumnKeys(
  configs: ExportConfigurations,
): { configs: ExportConfigurations; changed: boolean } {
  let changed = false
  const configurations = configs.configurations.map((config) => {
    const retired = rewriteRetiredColumnKeys(config.columns)
    const withSublabel = appendSublabelWhenNeeded(retired.columns)
    if (!retired.changed && !withSublabel.changed) {
      return config
    }
    changed = true
    return { ...config, columns: withSublabel.columns }
  })

  if (!changed) {
    return { configs, changed: false }
  }

  return {
    configs: { configurations },
    changed: true,
  }
}
