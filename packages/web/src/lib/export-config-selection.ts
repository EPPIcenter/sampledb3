export type ExportConfigSource = 'shared' | 'personal'

export interface ParsedExportConfigId {
  source: ExportConfigSource
  name: string
}

/** Build the composite id used for export configuration radio selection. */
export function formatExportConfigId(source: ExportConfigSource, name: string): string {
  return `${source}:${name}`
}

/**
 * Parse `source:name` export configuration id (first colon only).
 * Returns null for empty, malformed, or unknown source values.
 */
export function parseExportConfigId(configId: string): ParsedExportConfigId | null {
  if (!configId) return null
  const colonIndex = configId.indexOf(':')
  if (colonIndex <= 0) return null
  const source = configId.substring(0, colonIndex)
  const name = configId.substring(colonIndex + 1)
  if (!name) return null
  if (source !== 'shared' && source !== 'personal') return null
  return { source, name }
}

export type ExportConfigurationRef = {
  source?: ExportConfigSource | string
  name: string
  columns?: string[]
}

/** Find a merged export configuration by composite id. */
export function findExportConfiguration<T extends ExportConfigurationRef>(
  configurations: T[],
  configId: string
): T | undefined {
  const parsed = parseExportConfigId(configId)
  if (!parsed) return undefined
  return configurations.find((c) => c.source === parsed.source && c.name === parsed.name)
}

/** Resolve export column list from composite config id, or undefined if invalid/unset. */
export function getExportColumnsForConfigId<T extends ExportConfigurationRef & { columns: string[] }>(
  configurations: T[],
  configId: string
): string[] | undefined {
  return findExportConfiguration(configurations, configId)?.columns
}
