import { parseCsv, serializeCsv } from '@sampledb/contract'

/** Parse CSV text into header-keyed rows via the shared contract parser. */
export function parseFullCsv(csv: string): { headers: string[]; rows: Record<string, string>[] } {
  const cells = parseCsv(csv).filter(row => !(row.length === 1 && row[0].trim() === ''))
  if (cells.length < 2) return { headers: [], rows: [] }
  const headers = cells[0].map(h => h.trim())
  const rows = cells.slice(1).map(cols => {
    const row: Record<string, string> = {}
    headers.forEach((header, j) => {
      row[header] = cols[j]?.trim() ?? ''
    })
    return row
  })
  return { headers, rows }
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
): string {
  if (reviewHeaders.length > 0 && reviewRows.length > 0) {
    return serializeToCsv(reviewHeaders, reviewRows)
  }
  return csvContent
}
