import type { ScannerConfiguration } from './api/settings'
import { normalizeWellPosition, validateFullPlatePositions } from './micronix-plate-positions'

export type ScannerPlateCsvRow = Record<string, string>

function buildPosition(config: ScannerConfiguration, row: ScannerPlateCsvRow): string {
  if (config.positionType === 'single') {
    return (row[config.positionColumn!] ?? '').trim() || ''
  }
  const rowVal = (row[config.rowColumn!] ?? '').trim() || ''
  const colVal = (row[config.columnColumn!] ?? '').trim() || ''
  const paddedCol = colVal.padStart(2, '0')
  return `${rowVal}${paddedCol}`
}

/**
 * Parse a scanner plate CSV using column mapping from scanner configuration.
 */
export function parseScannerPlateCsv(text: string, config: ScannerConfiguration): ScannerPlateCsvRow[] {
  const lines = text.split('\n').filter((line) => line.trim())
  if (lines.length < 2 + config.skipRows) return []

  const headerLine = lines[config.skipRows]
  const headers = headerLine.split(',').map((h) => h.trim())
  const rows: ScannerPlateCsvRow[] = []

  for (let i = config.skipRows + 1; i < lines.length; i++) {
    const values = lines[i].split(',')
    const row: ScannerPlateCsvRow = {}
    headers.forEach((header, j) => {
      row[header] = values[j]?.trim() || ''
    })

    row.container_barcode = row[config.barcodeColumn] || ''
    if (config.positionType === 'single') {
      row.target_position = row[config.positionColumn!] || ''
    } else {
      row.target_position = buildPosition(config, row)
    }

    rows.push(row)
  }

  return rows
}

export interface ScannerPlateCsvValidationError {
  row: number
  error: string
}

export function validateScannerPlateCsv(
  rows: ScannerPlateCsvRow[],
  config: ScannerConfiguration
): { valid: boolean; errors: ScannerPlateCsvValidationError[] } {
  const errors: ScannerPlateCsvValidationError[] = []

  if (rows.length === 0) {
    return { valid: false, errors: [{ row: 0, error: 'CSV file is empty' }] }
  }

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i]
    if (!row.target_position || row.target_position.trim() === '') {
      const positionDesc =
        config.positionType === 'single'
          ? `Position column "${config.positionColumn}"`
          : `Row column "${config.rowColumn}" and Column column "${config.columnColumn}"`
      errors.push({
        row: i + 1,
        error: `${positionDesc} is required but missing or empty`,
      })
    }
  }

  const positionSet = new Set<string>()
  for (const row of rows) {
    const pos = row.target_position.trim()
    if (pos) {
      const normalized = normalizeWellPosition(pos)
      if (normalized) positionSet.add(normalized)
    }
  }
  const fullPlate = validateFullPlatePositions(positionSet)
  if (!fullPlate.valid) {
    const parts: string[] = [
      `CSV must list all 96 well positions (A01–H12) exactly once, as produced by scanning software.`,
      `Found ${positionSet.size} valid position(s).`,
    ]
    if (fullPlate.missing && fullPlate.missing.length > 0) {
      const sample = fullPlate.missing.slice(0, 5).join(', ')
      const more = fullPlate.missing.length > 5 ? ` and ${fullPlate.missing.length - 5} more` : ''
      parts.push(`Missing: ${sample}${more}.`)
    }
    if (fullPlate.extra && fullPlate.extra.length > 0) {
      const sample = fullPlate.extra.slice(0, 5).join(', ')
      const more = fullPlate.extra.length > 5 ? ` and ${fullPlate.extra.length - 5} more` : ''
      parts.push(`Invalid or duplicate: ${sample}${more}.`)
    }
    errors.push({ row: 0, error: parts.join(' ') })
  }

  return {
    valid: errors.length === 0,
    errors,
  }
}
