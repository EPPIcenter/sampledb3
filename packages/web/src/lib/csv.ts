/**
 * Utilities for building and downloading CSV (e.g. collection table export).
 */

export function escapeCsvCell(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return ''
  const s = String(value)
  if (s.includes(',') || s.includes('"') || s.includes('\n') || s.includes('\r')) {
    return '"' + s.replace(/"/g, '""') + '"'
  }
  return s
}

export interface BuildCsvOptions {
  bom?: boolean
}

/**
 * Build a CSV string from column headers and row arrays.
 * Each row must have the same length as columns.
 */
export function buildCsv(
  columns: string[],
  rows: (string | number | null)[][],
  options: BuildCsvOptions = {}
): string {
  const { bom = false } = options
  const header = columns.map((c) => escapeCsvCell(c)).join(',')
  const body = rows
    .map((row) => row.map((cell) => escapeCsvCell(cell)).join(','))
    .join('\n')
  const content = header + (rows.length ? '\n' + body : '')
  return bom ? '\uFEFF' + content : content
}

/**
 * Trigger a file download of the CSV string with the given filename.
 */
export function downloadCsv(csv: string, filename: string): void {
  const blob = new Blob([csv], { type: 'text/csv' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}
