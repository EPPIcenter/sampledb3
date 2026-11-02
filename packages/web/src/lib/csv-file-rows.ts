import { parseCsv } from '@sampledb/contract'

/** A CSV data row and the row a spreadsheet shows it on, counting the header as row 1. */
export interface CsvFileRow {
  cells: string[]
  fileRow: number
}

/**
 * Parse CSV text into its header and data rows, dropping rows whose cells are all blank.
 * Each data row keeps its spreadsheet row number, so dropped rows don't shift the rows after them.
 */
export function parseCsvFileRows(text: string): { header: string[]; rows: CsvFileRow[] } | null {
  const records = parseCsv(text)
  const filled = records.flatMap((cells, i) =>
    cells.every((cell) => cell.trim() === '') ? [] : [{ cells, fileRow: i + 1 }],
  )
  if (filled.length === 0) return null
  const [header, ...rows] = filled
  return { header: header.cells, rows }
}
