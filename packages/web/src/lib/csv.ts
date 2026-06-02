/**
 * Utilities for building and downloading CSV (e.g. collection table export).
 * Serialization delegates to @sampledb/contract (canonical BOM + CRLF defaults).
 */
import {
  escapeCsvCell,
  serializeCsv,
  type CSVExportOptions,
} from '@sampledb/contract'
import { downloadExportFile } from './export-download'

export { escapeCsvCell }
export type BuildCsvOptions = CSVExportOptions

/**
 * Build a CSV string from column headers and row arrays.
 * Each row must have the same length as columns.
 */
export function buildCsv(
  columns: string[],
  rows: (string | number | null)[][],
  options: BuildCsvOptions = {}
): string {
  return serializeCsv(columns, rows, options)
}

/**
 * Trigger a file download of the CSV string with the given filename.
 */
export function downloadCsv(csv: string, filename: string): void {
  downloadExportFile({ kind: 'csv-text', data: csv, filename })
}
