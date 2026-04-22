import type { ScannerConfiguration } from './settings'

/** Normalize well position to A01 style (row + 2-digit column) */
export function normalizeWellPosition(pos: string): string {
  const t = pos.trim()
  if (!t) return t
  const match = t.match(/^([A-H])(\d{1,2})$/i)
  if (match) {
    const row = match[1].toUpperCase()
    const col = parseInt(match[2], 10)
    return `${row}${col.toString().padStart(2, '0')}`
  }
  return t
}

/** Validate and normalize well position (A–H, 1–12). Returns normalized position or null if invalid. */
export function validateWellPosition(pos: string): string | null {
  const normalized = normalizeWellPosition(pos)
  if (!normalized) return null
  const col = parseInt(normalized.slice(1), 10)
  if (Number.isNaN(col) || col < 1 || col > 12) return null
  return normalized
}

/**
 * Parse plate CSV with scanner config; returns rows with wellPosition and barcode.
 * Includes rows with empty barcode (scanned empty well). Duplicate positions: last row wins.
 */
export function parsePlateCSV(
  csvText: string,
  config: ScannerConfiguration
): { wellPosition: string; barcode: string }[] {
  const lines = csvText.split('\n').map((l) => l.trim()).filter(Boolean)
  if (lines.length <= config.skipRows) return []
  const headerLine = lines[config.skipRows]
  const headers = headerLine.split(',').map((h) => h.trim())
  const rows: { wellPosition: string; barcode: string }[] = []
  for (let i = config.skipRows + 1; i < lines.length; i++) {
    const values = lines[i].split(',').map((v) => v.trim())
    const row: Record<string, string> = {}
    headers.forEach((h, j) => {
      row[h] = values[j] ?? ''
    })
    const barcode = (row[config.barcodeColumn] ?? '').trim()
    let wellPosition: string
    if (config.positionType === 'single') {
      wellPosition = (row[config.positionColumn ?? ''] ?? '').trim()
    } else {
      const rowVal = (row[config.rowColumn ?? ''] ?? '').trim()
      const colVal = (row[config.columnColumn ?? ''] ?? '').trim()
      wellPosition = `${rowVal}${colVal.padStart(2, '0')}`
    }
    wellPosition = normalizeWellPosition(wellPosition)
    if (!wellPosition) continue
    rows.push({ wellPosition, barcode })
  }
  // Dedupe by position: last wins
  const byPosition = new Map<string, { wellPosition: string; barcode: string }>()
  for (const r of rows) {
    byPosition.set(r.wellPosition, r)
  }
  return [...byPosition.values()]
}
