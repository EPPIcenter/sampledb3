export type CsvLineEnding = 'crlf' | 'lf'

export interface CSVExportOptions {
  delimiter?: string
  bom?: boolean
  lineEnding?: CsvLineEnding
  /**
   * Prefix text cells a spreadsheet would run as a formula with `'`.
   * Use for exports of stored data; leave off for templates meant to be re-imported.
   */
  neutralizeFormulas?: boolean
}

export type CsvCellValue = string | number | null | undefined

const DEFAULT_DELIMITER = ','
const DEFAULT_BOM = true
const DEFAULT_LINE_ENDING: CsvLineEnding = 'crlf'

/**
 * Text a spreadsheet would evaluate: leading =, +, @, tab, or CR, and "-" unless it starts a
 * number or a phrase ("-131", "-2 in SubjID") so stored negative values export unchanged.
 */
function looksLikeFormula(s: string): boolean {
  return /^[=+@\t\r]/.test(s) || /^-[^\d\s.]/.test(s)
}

export function escapeCsvCell(
  value: CsvCellValue,
  options: { delimiter?: string; neutralizeFormulas?: boolean } = {},
): string {
  if (value === null || value === undefined) return ''
  const delimiter = options.delimiter ?? DEFAULT_DELIMITER
  let s = String(value)
  if (options.neutralizeFormulas && typeof value === 'string' && looksLikeFormula(s)) {
    s = `'${s}`
  }
  if (s.includes(delimiter) || s.includes('"') || s.includes('\n') || s.includes('\r')) {
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

  const cellOptions = { delimiter, neutralizeFormulas: options.neutralizeFormulas }
  const formatRow = (row: CsvCellValue[]) =>
    row.map((cell) => escapeCsvCell(cell, cellOptions)).join(delimiter)

  const header = columns.map((cell) => escapeCsvCell(cell, { delimiter })).join(delimiter)
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
