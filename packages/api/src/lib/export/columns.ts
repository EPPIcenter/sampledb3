import type { ContainerExportData } from '@sampledb/contract'
import type { Database } from '../../db/client'
import { getDefaultExportConfiguration } from '../settings'

export async function resolveExportColumnKeys(
  database: Database,
  data: ContainerExportData[],
  columns?: string[],
  userId?: number | null
): Promise<string[]> {
  if (data.length === 0) return []

  const availableKeys = Object.keys(data[0] ?? {})

  if (columns && columns.length > 0) {
    const filtered = columns.filter((col) => availableKeys.includes(col))
    return filtered.length > 0 ? filtered : availableKeys
  }

  const defaultConfig = await getDefaultExportConfiguration(database, userId)
  const defaultColumns = defaultConfig?.columns ?? []
  if (defaultColumns.length > 0) {
    const filtered = defaultColumns.filter((col) => availableKeys.includes(col))
    return filtered.length > 0 ? filtered : availableKeys
  }

  return availableKeys
}

export function filterContainerExportColumns(
  data: ContainerExportData[],
  columnKeys: string[]
): ContainerExportData[] {
  if (data.length === 0 || columnKeys.length === 0) return data

  return data.map((row) => {
    const filtered: Record<string, unknown> = {}
    for (const key of columnKeys) {
      filtered[key] = (row as any)[key]
    }
    return filtered as any as ContainerExportData
  })
}
