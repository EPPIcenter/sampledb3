import type {
  ScanMoveCsvRow,
  ScanMoveEvent,
  ScanMoveFile,
  ScanMoveFileSource,
  ScanMoveIngestContext,
  ScanMoveValidationError,
  ScanMoveVariant,
} from './types'

const PREVIEW_ROWS = 5

/** Split one CSV line honoring double-quoted fields (RFC 4180 quoting + "" escapes). */
export function splitCsvLine(line: string): string[] {
  const fields: string[] = []
  let current = ''
  let inQuotes = false
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (inQuotes) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          current += '"'
          i++
        } else {
          inQuotes = false
        }
      } else {
        current += ch
      }
    } else if (ch === '"') {
      inQuotes = true
    } else if (ch === ',') {
      fields.push(current)
      current = ''
    } else {
      current += ch
    }
  }
  fields.push(current)
  return fields
}

/**
 * Parse a fixed-format move CSV (built-in spec): header row maps columns,
 * each required column must be non-empty on every data row.
 */
export function parseBuiltinMoveCsv(
  text: string,
  spec: { requiredColumns: readonly string[]; skipRows: number },
): { csvRows: ScanMoveCsvRow[]; errors: ScanMoveValidationError[] } {
  const lines = text.split(/\r?\n/).filter((line) => line.trim() !== '')
  if (lines.length < 2 + spec.skipRows) {
    return { csvRows: [], errors: [{ row: 0, error: 'CSV file is empty' }] }
  }

  const headers = splitCsvLine(lines[spec.skipRows]).map((h) => h.trim())
  const csvRows: ScanMoveCsvRow[] = []
  for (let i = spec.skipRows + 1; i < lines.length; i++) {
    const values = splitCsvLine(lines[i])
    const row: ScanMoveCsvRow = {}
    headers.forEach((header, j) => {
      row[header] = values[j]?.trim() ?? ''
    })
    csvRows.push(row)
  }

  const errors: ScanMoveValidationError[] = []
  csvRows.forEach((row, i) => {
    for (const column of spec.requiredColumns) {
      if (!row[column] || row[column].trim() === '') {
        errors.push({ row: i + 1, error: `${column} is required but missing or empty` })
      }
    }
  })

  return { csvRows, errors }
}

/**
 * Ingest one file's text: parse + format-validate + infer destination.
 * Pure given the text — exported as the shared stage that plate scan
 * validation can adopt (ADR 0008).
 */
export function ingestScanCsvText(
  variant: ScanMoveVariant,
  file: ScanMoveFileSource,
  text: string,
  ctx: ScanMoveIngestContext,
): ScanMoveFile {
  const { csvRows, errors } = variant.parseAndValidate(text, ctx)
  const inference = variant.inferDestination(file.name, csvRows, ctx)
  return {
    file,
    filename: file.name,
    csvRows,
    preview: csvRows.slice(0, PREVIEW_ROWS),
    inferredDestinationName: inference.inferredDestinationName,
    inferredMatches: inference.inferredMatches,
    selectedDestinationName: inference.selectedDestinationName,
    resolvedContainers: [],
    unresolvedContainers: [],
    validationErrors: [...errors, ...inference.inferenceErrors],
    isResolved: false,
  }
}

/** Read and ingest a batch of files; replaces the current file list. */
export async function ingestScanFiles(
  variant: ScanMoveVariant,
  sources: ScanMoveFileSource[],
  ctx: ScanMoveIngestContext,
): Promise<ScanMoveEvent> {
  const files: ScanMoveFile[] = []
  for (const source of sources) {
    try {
      const text = await source.text()
      files.push(ingestScanCsvText(variant, source, text, ctx))
    } catch (err) {
      files.push({
        file: source,
        filename: source.name,
        csvRows: [],
        preview: [],
        inferredDestinationName: null,
        inferredMatches: [],
        selectedDestinationName: null,
        resolvedContainers: [],
        unresolvedContainers: [],
        validationErrors: [
          { row: 0, error: err instanceof Error ? err.message : 'Failed to read or parse file' },
        ],
        isResolved: false,
      })
    }
  }
  return { type: 'FILES_INGESTED', files }
}

/** Re-ingest already-uploaded files (e.g. after a scanner config change). */
export async function reingestScanFiles(
  variant: ScanMoveVariant,
  files: ScanMoveFile[],
  ctx: ScanMoveIngestContext,
): Promise<ScanMoveEvent> {
  return ingestScanFiles(
    variant,
    files.map((f) => f.file),
    ctx,
  )
}
