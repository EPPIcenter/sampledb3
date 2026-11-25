import { serializeCsv } from '@sampledb/contract'
import { parseCsvFileRows } from '../csv-file-rows'
import { findMissingCollectionLocationId } from './collections'
import type { MissingDerivationCollection } from './types'

/**
 * Parse CSV text into header-keyed rows, dropping rows whose cells are all blank as the
 * API does. `fileRows[i]` is the spreadsheet row of `rows[i]`, counting the header as row 1.
 */
export function parseFullCsv(csv: string): {
  headers: string[]
  rows: Record<string, string>[]
  fileRows: number[]
} {
  const parsed = parseCsvFileRows(csv)
  if (!parsed || parsed.rows.length === 0) return { headers: [], rows: [], fileRows: [] }
  const headers = parsed.header.map(h => h.trim())
  const rows = parsed.rows.map(({ cells }) => {
    const row: Record<string, string> = {}
    headers.forEach((header, j) => {
      row[header] = cells[j]?.trim() ?? ''
    })
    return row
  })
  return { headers, rows, fileRows: parsed.rows.map(r => r.fileRow) }
}

/** First few data rows for the upload-step preview table. */
export function parseCsvPreview(csv: string, limit = 5): Record<string, string>[] {
  return parseFullCsv(csv).rows.slice(0, limit)
}

/** Serialize edited review rows back to CSV (no BOM, LF, proper quoting). */
export function serializeToCsv(headers: string[], rows: Record<string, string>[]): string {
  return serializeCsv(
    headers,
    rows.map(r => headers.map(h => r[h] ?? '')),
    { bom: false, lineEnding: 'lf' },
  )
}

export function csvForImport(
  csvContent: string,
  reviewHeaders: string[],
  reviewRows: Record<string, string>[],
  missingCollections: MissingDerivationCollection[] = [],
  defaultContainerType?: 'micronix_tube' | 'cryovial_tube' | 'paper' | '',
): string {
  if (reviewHeaders.length > 0 && reviewRows.length > 0) {
    const hasAssignedLocation = missingCollections.some((c) => c.locationId != null)
    if (!hasAssignedLocation) {
      return serializeToCsv(reviewHeaders, reviewRows)
    }
    const existingLocationHeaders = reviewHeaders.filter((h) => {
      const lower = h.trim().toLowerCase()
      return lower === 'collection_location_id' || lower === 'location_id'
    })
    const targetHeaders =
      existingLocationHeaders.length > 0 ? existingLocationHeaders : ['collection_location_id']
    const headers =
      existingLocationHeaders.length > 0
        ? reviewHeaders
        : [...reviewHeaders, 'collection_location_id']
    const rows = reviewRows.map((row) => {
      const locationId = findMissingCollectionLocationId(
        row,
        reviewHeaders,
        missingCollections,
        defaultContainerType,
      )
      if (locationId == null) return row
      const next = { ...row }
      for (const header of targetHeaders) {
        next[header] = String(locationId)
      }
      return next
    })
    return serializeToCsv(headers, rows)
  }
  return csvContent
}
