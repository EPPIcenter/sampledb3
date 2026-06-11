import { parseCsv, serializeCsv } from '@sampledb/contract'
import type { BulkDerivationSettings, ValidationResult } from './api/derivations'
import type { TemplateOptions } from './template-generator'

export type SourceType = 'control_batch' | 'study_subject'
export type ParentContainerType = 'paper' | 'cryovial_tube' | 'micronix_tube'

export interface MissingDerivationCollection {
  name?: string
  barcode?: string
  containerType: 'micronix_tube' | 'cryovial_tube'
  locationId: number | null
  status: 'pending' | 'creating' | 'success' | 'error'
  error?: string
}

/** Parse CSV text into header-keyed rows via the shared contract parser. */
export function parseFullCsv(csv: string): { headers: string[]; rows: Record<string, string>[] } {
  const cells = parseCsv(csv).filter(row => !(row.length === 1 && row[0].trim() === ''))
  if (cells.length < 2) return { headers: [], rows: [] }
  const headers = cells[0].map(h => h.trim())
  const rows = cells.slice(1).map(cols => {
    const row: Record<string, string> = {}
    headers.forEach((header, j) => {
      row[header] = cols[j]?.trim() ?? ''
    })
    return row
  })
  return { headers, rows }
}

/** First few data rows for the upload-step preview table. */
export function parseCsvPreview(csv: string, limit = 5): Record<string, string>[] {
  return parseFullCsv(csv).rows.slice(0, limit)
}

/** Serialize edited review rows back to CSV (no BOM, LF, proper quoting). */
export function serializeToCsv(headers: string[], rows: Record<string, string>[]): string {
  return serializeCsv(
    headers,
    rows.map(r => headers.map(h => r[h] ?? '')),
    { bom: false, lineEnding: 'lf' },
  )
}

/** Validation collections that must be created before import (tube types only). */
export function deriveMissingCollections(
  validationResult: ValidationResult | null,
): MissingDerivationCollection[] {
  if (!validationResult?.collections.length) return []
  return validationResult.collections
    .filter(
      (c): c is typeof c & { containerType: 'micronix_tube' | 'cryovial_tube' } =>
        c.status === 'will_be_created' &&
        (c.containerType === 'micronix_tube' || c.containerType === 'cryovial_tube'),
    )
    .map(c => ({
      name: c.name,
      barcode: c.barcode,
      containerType: c.containerType,
      locationId: null,
      status: 'pending' as const,
    }))
}

/** Template parent-type for the source/parent-container combination. */
export function resolveTemplateParentType(
  sourceType: SourceType,
  parentContainerType: ParentContainerType,
): TemplateOptions['parentType'] {
  if (sourceType === 'control_batch') return 'control_batch'
  if (parentContainerType === 'paper') return 'study_subject'
  if (parentContainerType === 'cryovial_tube') return 'cryovial_position'
  return 'barcode'
}

/** Required and optional CSV columns for the current source, parent type, and settings. */
export function getRequiredAndOptionalColumns(
  sourceType: SourceType,
  parentContainerType: ParentContainerType,
  settings: BulkDerivationSettings,
): { required: string[]; optional: string[] } {
  const required: string[] = []
  const optional: string[] = []

  // Parent identification (required)
  if (sourceType === 'control_batch') {
    required.push('parent_control_batch_name', 'parent_specimen_type_name')
    if (parentContainerType === 'cryovial_tube') {
      required.push('parent_box_barcode', 'parent_position')
    }
  } else {
    if (parentContainerType === 'paper') {
      required.push('parent_study_short_code', 'parent_subject_name', 'parent_specimen_type_name')
      optional.push('parent_collection_date')
    } else if (parentContainerType === 'cryovial_tube') {
      required.push('parent_box_barcode', 'parent_position')
    } else {
      required.push('parent_container_barcode')
    }
  }

  // Per-row derivation fields (required in CSV when not set in Import settings)
  if (!settings.derivationType) required.push('derivation_type')
  if (!settings.specimenTypeName) required.push('specimen_type_name')
  if (!settings.containerType) required.push('container_type')
  if (!settings.protocol) required.push('protocol')
  if (!settings.derivationDate) required.push('derivation_date')

  // Derived container placement
  const fixedContainerType = settings.containerType
  if (fixedContainerType === 'micronix_tube') {
    required.push('plate_name or collection_barcode')
  } else if (fixedContainerType === 'cryovial_tube') {
    required.push('box_name or collection_barcode')
  } else if (fixedContainerType === 'paper') {
    required.push('bag_name')
  } else {
    required.push('plate_name / box_name / bag_name (depends on container_type)')
    optional.push('collection_barcode')
  }
  required.push('position')
  optional.push('container_barcode')
  optional.push('notes')

  // Quantity fields: only optional in CSV when not set in Import settings
  if (settings.quantity === undefined) optional.push('quantity')
  if (!settings.unitSymbol) optional.push('unit_symbol')
  if (settings.quantityUsed === undefined) optional.push('quantity_used')
  if (settings.reduceParentQuantity === undefined) optional.push('reduce_parent_quantity')

  return { required, optional }
}
