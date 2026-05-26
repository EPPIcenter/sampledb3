import type { Database } from '../../db/client'
import { specimenType } from '../../db/schema'

export type ControlBatchCsvValidationError = {
  row: number
  field?: string
  error: string
}

export type ControlBatchCsvValidationResult = {
  valid: boolean
  errors: ControlBatchCsvValidationError[]
  preview: Array<Record<string, string>>
}

/** Validate control batch import CSV structure and specimen type names. */
export async function validateControlBatchCsv(
  database: Database,
  csvText: string,
): Promise<ControlBatchCsvValidationResult> {
  const lines = csvText.split('\n').filter((line) => line.trim())
  if (lines.length < 2) {
    return {
      valid: false,
      errors: [{ row: 0, error: 'CSV must have at least a header and one data row' }],
      preview: [],
    }
  }

  const header = lines[0].split(',').map((h) => h.trim().toLowerCase())
  const requiredColumns = ['specimen_type_name']
  const missingColumns = requiredColumns.filter((col) => !header.includes(col))
  if (missingColumns.length > 0) {
    return {
      valid: false,
      errors: [{ row: 0, error: `Missing required columns: ${missingColumns.join(', ')}` }],
      preview: [],
    }
  }

  const specimenTypeNames = new Set<string>()
  for (let i = 1; i < Math.min(lines.length, 11); i++) {
    const row = lines[i].split(',')
    const specimenTypeIdx = header.indexOf('specimen_type_name')
    if (specimenTypeIdx >= 0 && row[specimenTypeIdx]) {
      const typeName = row[specimenTypeIdx].trim()
      if (typeName) {
        specimenTypeNames.add(typeName)
      }
    }
  }

  const errors: ControlBatchCsvValidationError[] = []
  const allSpecimenTypes = await database.select().from(specimenType)
  const existingTypeNames = new Set(allSpecimenTypes.map((t) => t.name))
  for (const typeName of specimenTypeNames) {
    if (!existingTypeNames.has(typeName)) {
      errors.push({ row: 0, error: `Unknown specimen type: ${typeName}` })
    }
  }

  const preview = lines.slice(1, 6).map((line) => {
    const values = line.split(',')
    const obj: Record<string, string> = {}
    header.forEach((h, i) => {
      obj[h] = values[i]?.trim() || ''
    })
    return obj
  })

  return {
    valid: errors.length === 0,
    errors,
    preview,
  }
}
