import {
  formatExportCellValue,
  getExportColumnKind,
  serializeCsv,
  type CsvCellValue,
  type CSVExportOptions as ContractCSVOptions,
} from '@sampledb/contract'
import type { Database } from '../../db/client'
import { filterContainerExportColumns, resolveExportColumnKeys } from './columns'
import type { ContainerExportData, CSVExportOptions, ExportFilters, StudyRecord } from './types'

function toContractCsvOptions(options?: CSVExportOptions): ContractCSVOptions {
  return {
    delimiter: options?.delimiter ?? ',',
    bom: options?.includeBOM ?? true,
    lineEnding: options?.lineEnding === 'LF' ? 'lf' : 'crlf',
  }
}

function formatExportRow(headers: string[], row: unknown[]): CsvCellValue[] {
  return headers.map((header, index) => formatExportCellValue(header, row[index]))
}

export function formatSimpleCSV(
  headers: string[],
  rows: unknown[][],
  options?: CSVExportOptions
): string {
  if (headers.length === 0 && rows.length === 0) {
    return ''
  }

  const formattedRows = rows.map((row) => formatExportRow(headers, row))
  return serializeCsv(headers, formattedRows, toContractCsvOptions(options))
}

export async function formatAsCSV(
  database: Database,
  data: ContainerExportData[],
  columns?: string[],
  options?: CSVExportOptions,
  userId?: number | null
): Promise<string> {
  if (data.length === 0) {
    return ''
  }

  const columnKeys = await resolveExportColumnKeys(database, data, columns, userId)
  const rows = data.map((row) =>
    columnKeys.map((header) => formatExportCellValue(header, (row as any)[header]))
  )

  return serializeCsv(columnKeys, rows, toContractCsvOptions(options))
}

export async function formatAsJSON(
  database: Database,
  data: ContainerExportData[],
  filters: ExportFilters,
  study: StudyRecord,
  columns?: string[],
  userId?: number | null
): Promise<{
  export_metadata: {
    study: string
    study_title: string
    filters: ExportFilters
    exported_at: string
    count: number
  }
  containers: ContainerExportData[]
}> {
  const columnKeys = await resolveExportColumnKeys(database, data, columns, userId)
  const filteredData = filterContainerExportColumns(data, columnKeys)

  return {
    export_metadata: {
      study: study.shortCode,
      study_title: study.title,
      filters,
      exported_at: new Date().toISOString(),
      count: filteredData.length,
    },
    containers: filteredData,
  }
}

function applyXlsxColumnFormats(
  ws: Record<string, unknown>,
  headers: string[],
  rows: unknown[][],
  encodeCell: (cell: { r: number; c: number }) => string
): void {
  for (let rowIndex = 0; rowIndex < rows.length; rowIndex++) {
    for (let colIndex = 0; colIndex < headers.length; colIndex++) {
      const kind = getExportColumnKind(headers[colIndex])
      const cellRef = encodeCell({ r: rowIndex + 1, c: colIndex })
      const cell = ws[cellRef] as { t?: string; v?: unknown; z?: string } | undefined
      if (!cell) continue

      const rawValue = rows[rowIndex][colIndex]

      if (kind === 'identifier') {
        cell.t = 's'
        cell.v = rawValue === null || rawValue === undefined || rawValue === '' ? '' : String(rawValue)
        cell.z = '@'
      } else if (kind === 'numeric' && typeof rawValue === 'number') {
        cell.t = 'n'
        cell.v = rawValue
      }
    }
  }
}

export async function formatAsExcel(
  database: Database,
  data: ContainerExportData[],
  columns?: string[],
  userId?: number | null
): Promise<Buffer> {
  const XLSX = await import('xlsx')

  if (data.length === 0) {
    const wb = XLSX.utils.book_new()
    const ws = XLSX.utils.aoa_to_sheet([['No data to export']])
    XLSX.utils.book_append_sheet(wb, ws, 'Containers')
    return Buffer.from(XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }))
  }

  const columnKeys = await resolveExportColumnKeys(database, data, columns, userId)
  const rows = data.map((row) =>
    columnKeys.map((header) => {
      const value = (row as any)[header]
      return value !== null && value !== undefined ? value : ''
    })
  )

  const ws = XLSX.utils.aoa_to_sheet([columnKeys, ...rows])
  applyXlsxColumnFormats(ws, columnKeys, rows, XLSX.utils.encode_cell)

  const colWidths = columnKeys.map((_, colIndex) => {
    const maxLength = Math.max(
      columnKeys[colIndex].length,
      ...rows.map((row) => String(row[colIndex] ?? '').length)
    )
    return { wch: Math.min(Math.max(maxLength + 2, 10), 50) }
  })
  ws['!cols'] = colWidths

  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'Containers')

  return Buffer.from(XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }))
}
