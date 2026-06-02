export type CsvLineEnding = 'crlf' | 'lf'

export interface CSVExportOptions {
  delimiter?: string
  bom?: boolean
  lineEnding?: CsvLineEnding
}

export type CsvCellValue = string | number | null | undefined

const DEFAULT_DELIMITER = ','
const DEFAULT_BOM = true
const DEFAULT_LINE_ENDING: CsvLineEnding = 'crlf'

export function escapeCsvCell(value: CsvCellValue): string {
  if (value === null || value === undefined) return ''
  const s = String(value)
  if (s.includes(',') || s.includes('"') || s.includes('\n') || s.includes('\r')) {
    return `"${s.replace(/"/g, '""')}"`
  }
  return s
}

export function serializeCsv(
  columns: string[],
  rows: CsvCellValue[][],
  options: CSVExportOptions = {}
): string {
  const delimiter = options.delimiter ?? DEFAULT_DELIMITER
  const bom = options.bom ?? DEFAULT_BOM
  const lineEnding = options.lineEnding ?? DEFAULT_LINE_ENDING
  const eol = lineEnding === 'crlf' ? '\r\n' : '\n'

  const formatRow = (row: CsvCellValue[]) =>
    row.map((cell) => escapeCsvCell(cell)).join(delimiter)

  const header = formatRow(columns)
  const body = rows.map(formatRow).join(eol)
  const content = rows.length ? `${header}${eol}${body}` : header
  return bom ? `\uFEFF${content}` : content
}

export function parseCsv(input: string, options: { delimiter?: string } = {}): string[][] {
  const delimiter = options.delimiter ?? DEFAULT_DELIMITER
  let text = input
  if (text.charCodeAt(0) === 0xfeff) {
    text = text.slice(1)
  }
  if (text === '') return []

  const rows: string[][] = []
  let row: string[] = []
  let field = ''
  let inQuotes = false
  let i = 0

  const pushRow = () => {
    row.push(field)
    rows.push(row)
    row = []
    field = ''
  }

  while (i < text.length) {
    const ch = text[i]

    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"'
          i += 2
          continue
        }
        inQuotes = false
        i++
        continue
      }
      field += ch
      i++
      continue
    }

    if (ch === '"') {
      inQuotes = true
      i++
      continue
    }

    if (ch === delimiter) {
      row.push(field)
      field = ''
      i++
      continue
    }

    if (ch === '\r') {
      pushRow()
      if (text[i + 1] === '\n') i += 2
      else i++
      continue
    }

    if (ch === '\n') {
      pushRow()
      i++
      continue
    }

    field += ch
    i++
  }

  if (inQuotes) {
    throw new Error('Unclosed quoted CSV field')
  }

  if (field.length > 0 || row.length > 0) {
    row.push(field)
    rows.push(row)
  }

  return rows
}
