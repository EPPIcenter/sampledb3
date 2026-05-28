import type { Database } from '../../db/client'
import { getDefaultExportConfiguration } from '../settings'
import type { ContainerExportData, CSVExportOptions, ExportFilters, StudyRecord } from './types'

export function formatSimpleCSV(
  headers: string[],
  rows: any[][],
  options?: CSVExportOptions
): string {
  // Set defaults for CSV options
  const delimiter = options?.delimiter ?? ','
  const includeBOM = options?.includeBOM ?? true
  const lineEnding = options?.lineEnding ?? 'CRLF'
  const newline = lineEnding === 'CRLF' ? '\r\n' : '\n'

  // Define date fields that should be date-only (YYYY-MM-DD)
  const dateOnlyFields = new Set(['collection_date'])
  
  // Define timestamp fields that should be full ISO 8601 datetime
  const timestampFields = new Set(['created', 'last_updated'])
  
  // Define fields that should NEVER be formatted as text (these are actual numbers)
  const numericFields = new Set([
    'count',
    'target_density',
    'remaining_quantity',
  ])
  
  // Define fields that should ALWAYS be formatted as text (IDs, codes, etc.)
  const alwaysTextFields = new Set([
    'id',
    'subject_id',
    'control_batch_id',
    'specimen_type',
  ])

  // Helper function to format a cell value
  const formatCellValue = (header: string, value: any): string => {
    if (value === null || value === undefined || value === '') {
      return ''
    }

    // Format dates
    if (dateOnlyFields.has(header)) {
      // User-facing dates: ISO 8601 date format (YYYY-MM-DD) only
      if (typeof value === 'string') {
        // If already in YYYY-MM-DD format, use directly
        if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
          return value
        }
        // If in ISO datetime format (YYYY-MM-DDTHH:mm:ss or YYYY-MM-DDTHH:mm:ssZ), extract date part
        // This avoids timezone conversion issues that could shift the date
        const isoDateMatch = value.match(/^(\d{4}-\d{2}-\d{2})(T|\s|$)/)
        if (isoDateMatch) {
          return isoDateMatch[1]
        }
        // Otherwise parse and format (handles other date formats)
        const date = new Date(value)
        if (!isNaN(date.getTime())) {
          return date.toISOString().split('T')[0]
        }
      } else if (value instanceof Date) {
        return value.toISOString().split('T')[0]
      }
      return String(value)
    } else if (timestampFields.has(header)) {
      // System-generated timestamps: Full ISO 8601 datetime
      if (typeof value === 'string') {
        const date = new Date(value)
        if (!isNaN(date.getTime())) {
          return date.toISOString()
        }
      } else if (value instanceof Date) {
        return value.toISOString()
      }
      return String(value)
    }

    // Format as string
    const stringValue = String(value)
    
    // Skip text formatting for numeric fields
    if (numericFields.has(header)) {
      return stringValue
    }
    
    // Always format these fields as text
    if (alwaysTextFields.has(header)) {
      // If it looks like a number (all digits), format for Excel to preserve leading zeros
      if (/^\d+$/.test(stringValue)) {
        return `="${stringValue}"`
      }
      // Otherwise, return as-is (will be quoted later)
      return stringValue
    }
    
    // For other fields, check if they look like numbers that should be preserved as text
    // This handles cases where IDs or codes might be numeric but should remain as text
    if (/^\d+$/.test(stringValue) && stringValue.length > 0) {
      // Format as text to preserve leading zeros and prevent Excel from converting to numbers
      return `="${stringValue}"`
    }
    
    return stringValue
  }

  // Format rows
  const formattedRows = rows.map(row =>
    headers.map((header, index) => formatCellValue(header, row[index]))
  )

  // Escape and quote cells
  const escapeCell = (cell: string): string => {
    // If already formatted as Excel text (="..."), we need to escape quotes inside
    // and wrap the entire cell in CSV quotes
    if (cell.startsWith('="') && cell.endsWith('"')) {
      // Escape any quotes inside the Excel-formatted value
      // The cell is ="value", we need to escape quotes in "value" part
      const innerValue = cell.slice(2, -1) // Remove =" and trailing " to get the inner value
      const escaped = innerValue.replace(/"/g, '""')
      // Wrap the entire Excel-formatted cell in CSV quotes
      // ="value" becomes "=""value"""
      // We need: opening CSV quote + = + opening Excel quote (escaped) + value + closing Excel quote + escaped CSV quote + closing CSV quote
      return '"=""' + escaped + '"""'
    }
    // Regular cell - escape quotes and wrap in quotes
    return `"${cell.replace(/"/g, '""')}"`
  }

  const csvRows = [
    headers.map(escapeCell).join(delimiter),
    ...formattedRows.map(row => row.map(escapeCell).join(delimiter))
  ]

  const csvContent = csvRows.join(newline)
  
  // Add UTF-8 BOM if requested
  return includeBOM ? '\uFEFF' + csvContent : csvContent
}

// Format as CSV
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

  // Set defaults for CSV options
  const delimiter = options?.delimiter ?? ','
  const includeBOM = options?.includeBOM ?? true
  const lineEnding = options?.lineEnding ?? 'CRLF'
  const newline = lineEnding === 'CRLF' ? '\r\n' : '\n'

  // Define date fields that should be date-only (YYYY-MM-DD)
  const dateOnlyFields = new Set(['collection_date'])
  
  // Define timestamp fields that should be full ISO 8601 datetime
  const timestampFields = new Set(['created', 'last_updated'])
  
  // Define fields that should NEVER be formatted as text (these are actual numbers)
  const numericFields = new Set([
    'target_density',
    'remaining_quantity',
  ])
  
  // Define fields that should ALWAYS be formatted as text (IDs, codes, etc.)
  const alwaysTextFields = new Set([
    'barcode',
    'position',
    'container_id',
    'specimen_id',
    'subject_id',
    'study_code',
    'control_batch_id',
    'location_id',
    'study_id',
    'label',
    'subject_name',
    'control_batch_name',
    'control_definition_name',
    'specimen_type',
    'container_type',
    'tags',
    'status',
    'comment',
    'collection_name',
    'location_path',
    'location_name',
    'study_title',
    'study_lead_person',
    'control_type',
    'target_density_unit',
    'strain_composition',
  ])

  // Helper function to format a cell value
  const formatCellValue = (header: string, value: any): string => {
    if (value === null || value === undefined) {
      return ''
    }

    // Format dates
    if (dateOnlyFields.has(header)) {
      // User-facing dates: ISO 8601 date format (YYYY-MM-DD) only
      if (typeof value === 'string') {
        // If already in YYYY-MM-DD format, use directly
        if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
          return value
        }
        // If in ISO datetime format (YYYY-MM-DDTHH:mm:ss or YYYY-MM-DDTHH:mm:ssZ), extract date part
        // This avoids timezone conversion issues that could shift the date
        const isoDateMatch = value.match(/^(\d{4}-\d{2}-\d{2})(T|\s|$)/)
        if (isoDateMatch) {
          return isoDateMatch[1]
        }
        // Otherwise parse and format (handles other date formats)
        const date = new Date(value)
        if (!isNaN(date.getTime())) {
          return date.toISOString().split('T')[0]
        }
      } else if (value instanceof Date) {
        return value.toISOString().split('T')[0]
      }
      return String(value)
    } else if (timestampFields.has(header)) {
      // System-generated timestamps: Full ISO 8601 datetime
      if (typeof value === 'string') {
        const date = new Date(value)
        if (!isNaN(date.getTime())) {
          return date.toISOString()
        }
      } else if (value instanceof Date) {
        return value.toISOString()
      }
      return String(value)
    }

    // Format as string
    const stringValue = String(value)
    
    // Skip text formatting for numeric fields
    if (numericFields.has(header)) {
      return stringValue
    }
    
    // Always format these fields as text
    if (alwaysTextFields.has(header)) {
      // If it looks like a number (all digits), format for Excel to preserve leading zeros
      if (/^\d+$/.test(stringValue)) {
        return `="${stringValue}"`
      }
      // Otherwise, return as-is (will be quoted later)
      return stringValue
    }
    
    // For other fields, check if they look like numbers that should be preserved as text
    // This handles cases where IDs or codes might be numeric but should remain as text
    if (/^\d+$/.test(stringValue) && stringValue.length > 0) {
      // Format as text to preserve leading zeros and prevent Excel from converting to numbers
      return `="${stringValue}"`
    }
    
    return stringValue
  }

  let headers: string[]
  const availableKeys = Object.keys(data[0])

  // If columns are explicitly provided, use them
  if (columns && columns.length > 0) {
    headers = columns.filter(col => availableKeys.includes(col))
    if (headers.length === 0) {
      // No valid columns provided, fall back to all columns
      headers = availableKeys
    }
  } else {
    // No columns specified, use default configuration
    const defaultConfig = await getDefaultExportConfiguration(database, userId)
    const defaultColumns = defaultConfig?.columns ?? []
    if (defaultColumns.length > 0) {
      headers = defaultColumns.filter(col => availableKeys.includes(col))
      if (headers.length === 0) headers = availableKeys
    } else {
      headers = availableKeys
    }
  }

  const rows = data.map(row => 
    headers.map(header => {
      const value = (row as any)[header]
      return formatCellValue(header, value)
    })
  )

  // Escape and quote cells
  const escapeCell = (cell: string): string => {
    // If already formatted as Excel text (="..."), we need to escape quotes inside
    // and wrap the entire cell in CSV quotes
    if (cell.startsWith('="') && cell.endsWith('"')) {
      // Escape any quotes inside the Excel-formatted value
      // The cell is ="value", we need to escape quotes in "value" part
      const innerValue = cell.slice(2, -1) // Remove =" and trailing " to get the inner value
      const escaped = innerValue.replace(/"/g, '""')
      // Wrap the entire Excel-formatted cell in CSV quotes
      // ="value" becomes "=""value"""
      // We need: opening CSV quote + = + opening Excel quote (escaped) + value + closing Excel quote + escaped CSV quote + closing CSV quote
      return '"=""' + escaped + '"""'
    }
    // Regular cell - escape quotes and wrap in quotes
    return `"${cell.replace(/"/g, '""')}"`
  }

  const csvRows = [
    headers.map(escapeCell).join(delimiter),
    ...rows.map(row => row.map(escapeCell).join(delimiter))
  ]

  const csvContent = csvRows.join(newline)
  
  // Add UTF-8 BOM if requested
  return includeBOM ? '\uFEFF' + csvContent : csvContent
}

// Format as JSON
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
  let filteredData = data

  // If columns are explicitly provided, use them
  if (columns && columns.length > 0) {
    const availableKeys = Object.keys(data[0] || {})
    const validColumns = columns.filter(col => availableKeys.includes(col))
    if (validColumns.length > 0) {
      filteredData = data.map(row => {
        const filtered: any = {}
        for (const col of validColumns) {
          filtered[col] = (row as any)[col]
        }
        return filtered as ContainerExportData
      })
    }
  } else {
    const defaultConfig = await getDefaultExportConfiguration(database, userId)
    const defaultColumns = defaultConfig?.columns ?? []
    if (defaultColumns.length > 0) {
      const availableKeys = Object.keys(data[0] || {})
      const validColumns = defaultColumns.filter(col => availableKeys.includes(col))
      if (validColumns.length > 0) {
        filteredData = data.map(row => {
          const filtered: any = {}
          for (const col of validColumns) {
            filtered[col] = (row as any)[col]
          }
          return filtered as ContainerExportData
        })
      }
    }
  }

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

// Format as Excel (XLSX)
export async function formatAsExcel(
  database: Database,
  data: ContainerExportData[],
  columns?: string[],
  userId?: number | null
): Promise<Buffer> {
  // Dynamic import to avoid loading xlsx if not needed
  const XLSX = await import('xlsx')
  
  if (data.length === 0) {
    const wb = XLSX.utils.book_new()
    const ws = XLSX.utils.aoa_to_sheet([['No data to export']])
    XLSX.utils.book_append_sheet(wb, ws, 'Containers')
    return Buffer.from(XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }))
  }

  let headers: string[]
  const availableKeys = Object.keys(data[0])

  // If columns are explicitly provided, use them
  if (columns && columns.length > 0) {
    headers = columns.filter(col => availableKeys.includes(col))
    if (headers.length === 0) {
      // No valid columns provided, fall back to all columns
      headers = availableKeys
    }
  } else {
    const defaultConfig = await getDefaultExportConfiguration(database, userId)
    const defaultColumns = defaultConfig?.columns ?? []
    if (defaultColumns.length > 0) {
      headers = defaultColumns.filter(col => availableKeys.includes(col))
      if (headers.length === 0) headers = availableKeys
    } else {
      headers = availableKeys
    }
  }

  // Convert data to worksheet format
  const rows = data.map(row => 
    headers.map(header => {
      const value = (row as any)[header]
      return value !== null && value !== undefined ? value : ''
    })
  )

  // Create worksheet
  const ws = XLSX.utils.aoa_to_sheet([headers, ...rows])

  // Set column widths (auto-size based on content)
  const colWidths = headers.map((_, colIndex) => {
    const maxLength = Math.max(
      headers[colIndex].length,
      ...rows.map(row => String(row[colIndex] || '').length)
    )
    return { wch: Math.min(Math.max(maxLength + 2, 10), 50) }
  })
  ws['!cols'] = colWidths

  // Create workbook and add worksheet
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'Containers')

  // Write to buffer
  return Buffer.from(XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }))
}
