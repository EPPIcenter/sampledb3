export interface CSVContainerRow {
  specimen_type_name: string
  position?: string
  barcode?: string
  quantity?: number
  unit_symbol?: string
  /** Optional density (numeric); when present, rows are grouped by density for batch creation */
  density?: number
  /** For paper (DBS): sheet name for this row. Multiple rows can share a sheet; sheets go into the file's collection (box/bag). */
  sheet_name?: string
}

/**
 * Unique non-empty sheet_name values from rows (trimmed). Use to show "Sheet names from CSV: A, B" when multiple.
 */
export function uniqueSheetNamesFromRows(rows: { sheet_name?: string }[]): string[] {
  return [...new Set(rows.map((r) => r.sheet_name?.trim()).filter((s): s is string => Boolean(s)))]
}

/**
 * Infer a single file-level sheet name from rows when all rows share the same non-empty sheet_name.
 * Returns undefined when there are zero or multiple distinct sheet names (or all empty).
 */
export function inferSheetName(rows: { sheet_name?: string }[]): string | undefined {
  const names = uniqueSheetNamesFromRows(rows)
  return names.length === 1 ? names[0]! : undefined
}

/**
 * Normalize position string to match frontend format (e.g., "B1" -> "B01")
 */
export function normalizePosition(position: string): string {
  if (!position || !position.trim()) return position
  
  const trimmed = position.trim()
  const match = trimmed.match(/^([A-Z]+)(\d+)$/i)
  if (match) {
    const row = match[1].toUpperCase()
    const col = match[2]
    return `${row}${col.padStart(2, '0')}`
  }
  
  // If it doesn't match the pattern, return as-is
  return trimmed
}

export interface ParsedCSVFile {
  filename: string
  rows: CSVContainerRow[]
  errors: ValidationError[]
  /** Inferred from header: sheet_name → paper; position → tube (user picks cryovial vs micronix). */
  inferredContainerCategory?: 'paper' | 'tube'
  /** When category is paper, type is paper. When category is tube, type is default for UI only (user must pick). */
  inferredContainerType?: 'paper' | 'cryovial_tube' | 'micronix_tube'
}

/**
 * Infer container category from CSV header.
 * Tube templates have position (cryovial and micronix); paper has sheet_name.
 * When both exist (e.g. merged columns), prefer position so tube CSVs are not mis-inferred as paper.
 */
export function inferContainerCategoryFromHeader(header: string[]): 'paper' | 'tube' | undefined {
  const lower = header.map((h) => h.toLowerCase().trim())
  if (lower.includes('position')) return 'tube'
  if (lower.includes('sheet_name')) return 'paper'
  return undefined
}

/**
 * Infer container type from CSV header. Tube → cryovial_tube as default (user may choose micronix); paper → paper.
 */
export function inferContainerTypeFromHeader(header: string[]): 'paper' | 'cryovial_tube' | 'micronix_tube' | undefined {
  const lower = header.map((h) => h.toLowerCase().trim())
  if (lower.includes('position')) return 'cryovial_tube'
  if (lower.includes('sheet_name')) return 'paper'
  return undefined
}

export interface ValidationError {
  row: number
  field?: string
  error: string
}

/**
 * Parse CSV text into rows
 */
export function parseCSV(csvText: string): string[][] {
  const lines: string[] = []
  let currentLine = ''
  let inQuotes = false

  for (let i = 0; i < csvText.length; i++) {
    const char = csvText[i]
    const nextChar = csvText[i + 1]

    if (char === '"') {
      if (inQuotes && nextChar === '"') {
        // Escaped quote
        currentLine += '"'
        i++
      } else {
        // Toggle quote state
        inQuotes = !inQuotes
      }
    } else if (char === '\n' && !inQuotes) {
      // End of line
      lines.push(currentLine)
      currentLine = ''
    } else if (char === '\r' && !inQuotes) {
      // Ignore carriage return
      continue
    } else {
      currentLine += char
    }
  }

  // Add last line
  if (currentLine || lines.length === 0) {
    lines.push(currentLine)
  }

  // Parse each line into columns
  return lines.map(line => {
    const columns: string[] = []
    let currentColumn = ''
    let inQuotes = false

    for (let i = 0; i < line.length; i++) {
      const char = line[i]
      const nextChar = line[i + 1]

      if (char === '"') {
        if (inQuotes && nextChar === '"') {
          currentColumn += '"'
          i++
        } else {
          inQuotes = !inQuotes
        }
      } else if (char === ',' && !inQuotes) {
        columns.push(currentColumn.trim())
        currentColumn = ''
      } else {
        currentColumn += char
      }
    }
    columns.push(currentColumn.trim())

    return columns
  })
}

/**
 * Parse CSV file into container rows
 */
export function parseContainerCSV(csvText: string, filename: string): ParsedCSVFile {
  const rows = parseCSV(csvText)
  if (rows.length === 0) {
    return {
      filename,
      rows: [],
      errors: [{ row: 0, error: 'CSV file is empty' }],
    }
  }

  // Parse header
  const header = rows[0].map(h => h.toLowerCase().trim())
  const requiredColumns = ['specimen_type_name']
  const optionalColumns = ['position', 'barcode', 'quantity', 'unit_symbol', 'density', 'sheet_name']

  // Check for required columns
  const missingRequired = requiredColumns.filter(col => !header.includes(col))
  if (missingRequired.length > 0) {
    return {
      filename,
      rows: [],
      errors: [{ row: 0, error: `Missing required columns: ${missingRequired.join(', ')}` }],
    }
  }

  // Find column indices
  const specimenTypeIdx = header.indexOf('specimen_type_name')
  const positionIdx = header.indexOf('position')
  const barcodeIdx = header.indexOf('barcode')
  const quantityIdx = header.indexOf('quantity')
  const unitSymbolIdx = header.indexOf('unit_symbol')
  const densityIdx = header.indexOf('density')
  const sheetNameIdx = header.indexOf('sheet_name')

  if (specimenTypeIdx === -1) {
    return {
      filename,
      rows: [],
      errors: [{ row: 0, error: 'Missing required column: specimen_type_name' }],
    }
  }

  // Parse data rows
  const parsedRows: CSVContainerRow[] = []
  const errors: ValidationError[] = []

  for (let i = 1; i < rows.length; i++) {
    const row = rows[i]
    
    // Skip empty rows
    if (row.every(cell => !cell.trim())) {
      continue
    }

    const specimenTypeName = row[specimenTypeIdx]?.trim()
    if (!specimenTypeName) {
      errors.push({ row: i + 1, field: 'specimen_type_name', error: 'Specimen type name is required' })
      continue
    }

    const parsedRow: CSVContainerRow = {
      specimen_type_name: specimenTypeName,
    }

    if (positionIdx >= 0 && row[positionIdx]) {
      parsedRow.position = normalizePosition(row[positionIdx])
    }

    if (barcodeIdx >= 0 && row[barcodeIdx]) {
      parsedRow.barcode = row[barcodeIdx].trim()
    }

    if (quantityIdx >= 0 && row[quantityIdx]) {
      const quantity = parseFloat(row[quantityIdx].trim())
      if (isNaN(quantity)) {
        errors.push({ row: i + 1, field: 'quantity', error: 'Quantity must be a number' })
      } else {
        parsedRow.quantity = quantity
      }
    }

    if (unitSymbolIdx >= 0 && row[unitSymbolIdx]) {
      parsedRow.unit_symbol = row[unitSymbolIdx].trim()
    }

    if (densityIdx >= 0 && row[densityIdx] !== undefined) {
      const densityVal = row[densityIdx].trim()
      if (densityVal === '') {
        parsedRow.density = undefined
      } else {
        const densityNum = parseFloat(densityVal)
        if (Number.isNaN(densityNum)) {
          errors.push({ row: i + 1, field: 'density', error: 'Density must be a number' })
          continue
        }
        parsedRow.density = densityNum
      }
    }

    if (sheetNameIdx >= 0 && row[sheetNameIdx] !== undefined) {
      const val = row[sheetNameIdx].trim()
      if (val) parsedRow.sheet_name = val
    }

    parsedRows.push(parsedRow)
  }

  const inferredCategory = inferContainerCategoryFromHeader(header)
  const inferredType = inferContainerTypeFromHeader(header)
  return {
    filename,
    rows: parsedRows,
    errors,
    inferredContainerCategory: inferredCategory,
    inferredContainerType: inferredType,
  }
}

/**
 * Validate parsed CSV rows against specimen types
 */
export function validateCSVRows(
  rows: CSVContainerRow[],
  availableSpecimenTypes: Array<{ name: string }>,
  containerType?: 'paper' | 'cryovial_tube' | 'micronix_tube'
): ValidationError[] {
  const errors: ValidationError[] = []
  const specimenTypeNames = new Set(availableSpecimenTypes.map(t => t.name))

  rows.forEach((row, index) => {
    const rowNum = index + 2 // +2 because row 1 is header, and we're 0-indexed

    // Validate specimen type exists
    if (!specimenTypeNames.has(row.specimen_type_name)) {
      errors.push({
        row: rowNum,
        field: 'specimen_type_name',
        error: `Unknown specimen type: ${row.specimen_type_name}`,
      })
    }

    // Validate position for tubes
    if (containerType === 'cryovial_tube' || containerType === 'micronix_tube') {
      if (!row.position || !row.position.trim()) {
        errors.push({
          row: rowNum,
          field: 'position',
          error: 'Position is required for tubes',
        })
      }
    }

    // For paper (DBS), each row must have sheet_name OR the file can have a single sheet name (validated in wizard).
    // We don't require sheet_name here so one-sheet-per-file (wizard field) still works.

    // Validate quantity if provided
    if (row.quantity !== undefined && (isNaN(row.quantity) || row.quantity < 0)) {
      errors.push({
        row: rowNum,
        field: 'quantity',
        error: 'Quantity must be a positive number',
      })
    }
  })

  return errors
}

/**
 * Generate CSV template for a specific container type
 */
export function generateCSVTemplate(
  containerType: 'paper' | 'cryovial_tube' | 'micronix_tube',
  allowedSpecimenTypes: Array<{ id: number; name: string }>
): string {
  const examples: string[] = []
  
  if (containerType === 'paper') {
    // Paper: each row has sheet_name (required). Multiple rows can share a sheet; all sheets go into the file's collection (box/bag).
    const firstType = allowedSpecimenTypes[0]
    examples.push(`${firstType.name},,5,spots,100,Sheet1`)
    if (allowedSpecimenTypes.length > 1) {
      examples.push(`${allowedSpecimenTypes[1].name},,5,spots,200,Sheet2`)
    } else {
      examples.push(`${firstType.name},,5,spots,200,Sheet2`)
    }
    return `specimen_type_name,barcode,quantity,unit_symbol,density,sheet_name
${examples.join('\n')}`
  } else if (containerType === 'cryovial_tube') {
    const firstType = allowedSpecimenTypes[0]
    examples.push(`${firstType.name},B1,CV-001,1,items,100`)
    if (allowedSpecimenTypes.length > 1) {
      examples.push(`${allowedSpecimenTypes[1].name},B2,CV-002,500,µL,200`)
    } else {
      examples.push(`${firstType.name},B2,CV-002,500,µL,200`)
    }
    return `specimen_type_name,position,barcode,quantity,unit_symbol,density
${examples.join('\n')}`
  } else if (containerType === 'micronix_tube') {
    const firstType = allowedSpecimenTypes[0]
    examples.push(`${firstType.name},A1,MT-001,1,items,100`)
    if (allowedSpecimenTypes.length > 1) {
      examples.push(`${allowedSpecimenTypes[1].name},A2,MT-002,100,µL,200`)
    } else {
      examples.push(`${firstType.name},A2,MT-002,100,µL,200`)
    }
    return `specimen_type_name,position,barcode,quantity,unit_symbol,density
${examples.join('\n')}`
  }

  // Fallback (should not reach here)
  return `specimen_type_name,position,barcode,quantity,unit_symbol`
}

/**
 * Group rows by specimen type
 */
export function groupRowsBySpecimenType(rows: CSVContainerRow[]): Map<string, CSVContainerRow[]> {
  const grouped = new Map<string, CSVContainerRow[]>()
  
  rows.forEach(row => {
    const type = row.specimen_type_name
    if (!grouped.has(type)) {
      grouped.set(type, [])
    }
    grouped.get(type)!.push(row)
  })

  return grouped
}

/**
 * Group rows by density. Rows without density (or with undefined density) are grouped under undefined.
 * Used when creating multiple batches from one CSV (one batch per density).
 */
export function groupRowsByDensity(rows: CSVContainerRow[]): Map<number | undefined, CSVContainerRow[]> {
  const grouped = new Map<number | undefined, CSVContainerRow[]>()
  for (const row of rows) {
    const key = row.density !== undefined ? row.density : undefined
    if (!grouped.has(key)) {
      grouped.set(key, [])
    }
    grouped.get(key)!.push(row)
  }
  return grouped
}

