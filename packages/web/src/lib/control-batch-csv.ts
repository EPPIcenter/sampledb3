export interface CSVContainerRow {
  specimen_type_name: string
  position?: string
  barcode?: string
  quantity?: number
  unit_symbol?: string
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
  const optionalColumns = ['position', 'barcode', 'quantity', 'unit_symbol']
  
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

    parsedRows.push(parsedRow)
  }

  return {
    filename,
    rows: parsedRows,
    errors,
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
    // Paper examples - no position (paper goes in sheets/bags/boxes, not plates), no barcode, spots unit
    const firstType = allowedSpecimenTypes[0]
    examples.push(`${firstType.name},,5,spots`)
    if (allowedSpecimenTypes.length > 1) {
      examples.push(`${allowedSpecimenTypes[1].name},,5,spots`)
    } else {
      examples.push(`${firstType.name},,5,spots`)
    }
    // Paper template: specimen_type_name,barcode,quantity,unit_symbol (no position)
    return `specimen_type_name,barcode,quantity,unit_symbol
${examples.join('\n')}`
  } else if (containerType === 'cryovial_tube') {
    // Cryovial tube examples - with position and barcode, items or volume units
    const firstType = allowedSpecimenTypes[0]
    examples.push(`${firstType.name},B1,CV-001,1,items`)
    if (allowedSpecimenTypes.length > 1) {
      examples.push(`${allowedSpecimenTypes[1].name},B2,CV-002,500,µL`)
    } else {
      examples.push(`${firstType.name},B2,CV-002,500,µL`)
    }
    return `specimen_type_name,position,barcode,quantity,unit_symbol
${examples.join('\n')}`
  } else if (containerType === 'micronix_tube') {
    // Micronix tube examples - with position and barcode, items or volume units
    const firstType = allowedSpecimenTypes[0]
    examples.push(`${firstType.name},A1,MT-001,1,items`)
    if (allowedSpecimenTypes.length > 1) {
      examples.push(`${allowedSpecimenTypes[1].name},A2,MT-002,100,µL`)
    } else {
      examples.push(`${firstType.name},A2,MT-002,100,µL`)
    }
    return `specimen_type_name,position,barcode,quantity,unit_symbol
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

