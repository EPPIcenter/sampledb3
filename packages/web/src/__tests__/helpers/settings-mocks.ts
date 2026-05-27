import { vi } from 'vitest'
import type {
  ExportConfigurations,
  ExportConfiguration,
  ScannerConfigurations,
  ScannerConfiguration,
  TableViewConfigurations,
  SettingsValueScope,
} from '../../lib/api/settings'

/**
 * Wire shapes for GET/PUT /settings/:key (what `api.get` / `api.put` resolve to before unwrap).
 * Domain mocks for `settingsApi.getValue` / `putValue` should use the unwrapped helpers below.
 */

export function settingsGetEnvelope<T extends string>(key: T, value: unknown) {
  return { key, value } as { key: T; value: unknown }
}

export function settingsPutEnvelope<T extends string>(
  key: T,
  value: unknown,
  userId?: number | null,
) {
  return { key, value, ...(userId !== undefined ? { userId } : {}) } as {
    key: T
    value: unknown
    userId?: number | null
  }
}

/** Unwrapped setting value — use when mocking `settingsApi.getValue` / `putValue` return values. */
export function scannerConfigurationsValue(
  configurations: ScannerConfiguration[],
): ScannerConfigurations {
  return { configurations }
}

export function exportConfigurationsValue(
  configurations: ExportConfiguration[],
): ExportConfigurations {
  return { configurations }
}

export function tableViewConfigurationsValue(
  configurations: TableViewConfigurations['configurations'],
): TableViewConfigurations {
  return { configurations }
}

export const DEFAULT_SCANNER_CONFIGS: ScannerConfiguration[] = [
  {
    id: 'traxcer',
    name: 'Traxcer',
    barcodeColumn: 'Tube ID',
    positionType: 'single',
    positionColumn: 'Position',
    skipRows: 0,
    isDefault: true,
  },
]

export type SettingsGetValueMockOptions = {
  scanner?: ScannerConfigurations | null
  exportShared?: ExportConfigurations
  exportPersonal?: ExportConfigurations
  tableView?: TableViewConfigurations | null
  fallback?: unknown
}

/** Mock `settingsApi.getValue` with correct unwrapped return types per key/scope. */
export function mockSettingsApiGetValue(options: SettingsGetValueMockOptions = {}) {
  return vi.fn().mockImplementation(
    async (key: string, scopeOpts?: { scope?: SettingsValueScope }) => {
      if (key === 'scanner_configurations') {
        return options.scanner ?? scannerConfigurationsValue(DEFAULT_SCANNER_CONFIGS)
      }
      if (key === 'export_configurations') {
        if (scopeOpts?.scope === 'personal') {
          return options.exportPersonal ?? exportConfigurationsValue([])
        }
        if (scopeOpts?.scope === 'shared') {
          return options.exportShared ?? exportConfigurationsValue([])
        }
        return (
          options.exportShared ??
          options.exportPersonal ??
          exportConfigurationsValue([])
        )
      }
      if (key === 'table_view_configurations') {
        return options.tableView ?? tableViewConfigurationsValue([])
      }
      return options.fallback ?? null
    },
  )
}
