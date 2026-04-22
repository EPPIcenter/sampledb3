import type { Database } from '../db/client'
import type { ExtractTablesWithRelations } from 'drizzle-orm'
import type { SQLiteTransaction } from 'drizzle-orm/sqlite-core'
import type * as schema from '../db/schema'

type DatabaseOrTransaction = Database | SQLiteTransaction<'sync', void, typeof schema, ExtractTablesWithRelations<typeof schema>>
import {
  containerDerivation,
  controlBatch,
  cryovialBox,
  cryovialTube,
  micronixPlate,
  micronixTube,
  paper,
  specimen,
  specimenType,
  storageContainer,
  study,
  studySubject,
} from '../db/schema'
import { and, eq, sql } from 'drizzle-orm'
import { createDerivation, type CreateDerivationInput } from './derivations'

/**
 * Map technical DB/constraint errors to messages that are clear for non-technical users.
 */
function toUserFriendlyDerivationError(rawMessage: string): string {
  const m = rawMessage
  if (
    m.includes('UNIQUE constraint failed') &&
    (m.includes('micronix_tube') || m.includes('cryovial_tube')) &&
    (m.includes('position') && m.includes('collection_id'))
  ) {
    return 'That position (e.g. A01) is already used in that plate or box. Each position in a collection must be used only once. Use a different position or a different collection name.'
  }
  if (m.includes('UNIQUE constraint failed') && m.includes('container_barcode')) {
    return 'That barcode is already used for another container. Use a different barcode. Barcodes are scanned and provided by you; the system does not assign them.'
  }
  if (m.includes('FOREIGN KEY constraint failed') || m.includes('NOT NULL constraint failed')) {
    return 'A required value is missing or does not match existing data (e.g. parent container, collection, or specimen type). Check your CSV and try again.'
  }
  return rawMessage
}

export interface BulkDerivationSettings {
  // When set, same for all rows; when empty string, column must be in CSV (per row)
  derivationType: string
  specimenTypeName: string
  containerType: 'micronix_tube' | 'cryovial_tube' | 'paper' | ''
  protocol: string
  derivationDate: string
  
  // Default fields (can be overridden per row in CSV)
  quantity?: number
  unitSymbol?: string
  quantityUsed?: number
  reduceParentQuantity?: boolean
  
  // Validation flags
  validateSourceSpecimenType?: boolean
  validateParentQuantity?: boolean
}

export interface DerivationCsvRow {
  // Parent identification
  parent_container_id?: string
  parent_container_barcode?: string
  parent_container_type?: 'micronix_tube' | 'cryovial_tube' | 'paper'
  // For study subjects (paper)
  parent_study_short_code?: string
  parent_subject_name?: string
  parent_specimen_type_name?: string
  parent_collection_date?: string
  // For control batches (paper or cryovial) - NEW, optimized for common use case
  parent_control_batch_name?: string
  parent_control_batch_id?: string
  // For cryovial tubes (study or control)
  parent_box_barcode?: string
  parent_position?: string

  // Derivation data (can be overridden by settings)
  derivation_type?: string
  specimen_type_name?: string
  container_type?: 'micronix_tube' | 'cryovial_tube' | 'paper'
  quantity?: string
  unit_symbol?: string
  quantity_used?: string
  reduce_parent_quantity?: string
  derivation_date?: string
  protocol?: string
  notes?: string
  plate_name?: string
  box_name?: string
  bag_name?: string
  collection_barcode?: string
  container_barcode?: string
  position?: string
}

export interface DerivationCsvResultRow {
  index: number
  success: boolean
  error?: string
  warnings?: string[]
  derivationId?: number
  parentContainerId?: number
  childContainerId?: number
  collectionStatus?: 'existing' | 'will_be_created'
  /** User-facing summary: derivation type name */
  derivationTypeName?: string
  /** User-facing summary: parent container/source (e.g. barcode, or box · position) */
  parentSummary?: string
  /** User-facing summary: child placement (e.g. collection · position) */
  childSummary?: string
}

export interface CollectionStatus {
  name?: string
  barcode?: string
  status: 'existing' | 'will_be_created'
  containerType: 'micronix_tube' | 'cryovial_tube' | 'paper'
}

export interface ValidationResult {
  rows: Array<{
    index: number
    valid: boolean
    error?: string
    warnings?: string[]
    parentContainerId?: number
    collectionStatus?: 'existing' | 'will_be_created'
  }>
  collections: CollectionStatus[]
  summary: {
    total: number
    valid: number
    invalid: number
    warnings: number
  }
}

function parseBoolean(value?: string): boolean | undefined {
  if (value == null) return undefined
  const v = value.trim().toLowerCase()
  if (!v) return undefined
  return v === 'true' || v === '1' || v === 'yes' || v === 'y'
}

function parseNumber(value?: string): number | undefined {
  if (value == null || value.trim() === '') return undefined
  const n = Number(value)
  return Number.isNaN(n) ? undefined : n
}

/** Build a short user-facing label for the parent (no internal IDs). */
function buildParentSummary(row: DerivationCsvRow): string {
  const b = (row.parent_container_barcode ?? '').trim()
  const box = (row.parent_box_barcode ?? '').trim()
  const pos = (row.parent_position ?? '').trim()
  if (b) return b
  if (box && pos) return `${box} · ${pos}`
  const study = (row.parent_study_short_code ?? '').trim()
  const subj = (row.parent_subject_name ?? '').trim()
  const spec = (row.parent_specimen_type_name ?? '').trim()
  const date = (row.parent_collection_date ?? '').trim()
  if (study || subj || spec || date) {
    return [study, subj, spec, date].filter(Boolean).join(' · ')
  }
  const ctrl = (row.parent_control_batch_name ?? row.parent_control_batch_id ?? '').trim()
  if (ctrl) return ctrl
  return 'Parent'
}

/** Build a short user-facing label for the child placement (no internal IDs). */
function buildChildSummary(row: DerivationCsvRow): string {
  const containerType = row.container_type || 'micronix_tube'
  const name = (getCollectionNameForType(row, containerType) ?? '').trim()
  const barcode = (row.collection_barcode ?? '').trim()
  const pos = (row.position ?? '').trim()
  const parts: string[] = []
  if (name) parts.push(name)
  else if (barcode) parts.push(barcode)
  if (pos) parts.push(pos)
  if (parts.length) return parts.join(' · ')
  const cb = (row.container_barcode ?? '').trim()
  if (cb) return `Barcode ${cb}`
  return 'Child'
}

function getCollectionNameForType(
  row: DerivationCsvRow,
  containerType: DerivationCsvRow['container_type'] | 'micronix_tube',
): string | undefined {
  if (containerType === 'cryovial_tube') return row.box_name
  if (containerType === 'paper') return row.bag_name
  return row.plate_name
}

function getCollectionNameLabelForType(
  containerType: DerivationCsvRow['container_type'] | 'micronix_tube',
): string {
  if (containerType === 'cryovial_tube') return 'box_name'
  if (containerType === 'paper') return 'bag_name'
  return 'plate_name'
}

// Extremely small CSV parser: handles commas and quoted fields
export function parseCsv(text: string): DerivationCsvRow[] {
  const lines = text.split(/\r?\n/).filter(l => l.trim() !== '')
  if (lines.length === 0) return []

  const parseLine = (line: string): string[] => {
    const result: string[] = []
    let current = ''
    let inQuotes = false
    for (let i = 0; i < line.length; i++) {
      const ch = line[i]
      if (ch === '"') {
        if (inQuotes && line[i + 1] === '"') {
          current += '"'
          i++
        } else {
          inQuotes = !inQuotes
        }
      } else if (ch === ',' && !inQuotes) {
        result.push(current)
        current = ''
      } else {
        current += ch
      }
    }
    result.push(current)
    return result
  }

  const headers = parseLine(lines[0]).map(h => h.trim())
  const rows: DerivationCsvRow[] = []

  for (let i = 1; i < lines.length; i++) {
    const cols = parseLine(lines[i])
    const row: any = {}
    headers.forEach((h, idx) => {
      row[h as keyof DerivationCsvRow] = cols[idx]?.trim()
    })
    rows.push(row as DerivationCsvRow)
  }

  return rows
}

async function resolveParentContainerId(database: DatabaseOrTransaction, row: DerivationCsvRow): Promise<number> {
  // 1. Explicit ID
  const explicitId = parseNumber(row.parent_container_id)
  if (explicitId) {
    const existing = await database
      .select({ id: storageContainer.id })
      .from(storageContainer)
      .where(eq(storageContainer.id, explicitId))
      .get()
    if (!existing) {
      throw new Error(`Parent container id '${explicitId}' not found`)
    }
    return explicitId
  }

  // 2. Barcode across known subtypes
  if (row.parent_container_barcode) {
    const barcode = row.parent_container_barcode.trim()

    const micronix = await database
      .select({ id: micronixTube.id })
      .from(micronixTube)
      .where(eq(micronixTube.barcode, barcode))
      .get()
    if (micronix) return micronix.id

    const cryovial = await database
      .select({ id: cryovialTube.id })
      .from(cryovialTube)
      .where(eq(cryovialTube.barcode, barcode))
      .get()
    if (cryovial) return cryovial.id

    const paperRec = await database
      .select({ id: paper.id })
      .from(paper)
      .where(eq(paper.barcode, barcode))
      .get()
    if (paperRec) return paperRec.id

    throw new Error(`Parent container barcode '${barcode}' not found`)
  }

  // 3. Control batch identification (NEW - optimized for common use case)
  if (row.parent_control_batch_name || row.parent_control_batch_id) {
    if (!row.parent_specimen_type_name) {
      throw new Error('Control batch parents require parent_specimen_type_name')
    }

    // Resolve control batch
    let batchId: number | undefined
    if (row.parent_control_batch_id) {
      const batchIdNum = parseNumber(row.parent_control_batch_id)
      if (batchIdNum) {
        const batch = await database
          .select({ id: controlBatch.id })
          .from(controlBatch)
          .where(eq(controlBatch.id, batchIdNum))
          .get()
        if (!batch) {
          throw new Error(`Control batch id '${batchIdNum}' not found`)
        }
        batchId = batch.id
      }
    } else if (row.parent_control_batch_name) {
      const batch = await database
        .select({ id: controlBatch.id })
        .from(controlBatch)
        .where(eq(controlBatch.name, row.parent_control_batch_name.trim()))
        .get()
      if (!batch) {
        throw new Error(`Control batch '${row.parent_control_batch_name}' not found`)
      }
      batchId = batch.id
    }

    if (!batchId) {
      throw new Error('Unable to resolve control batch')
    }

    // Find specimen type
    const typeRec = await database
      .select({ id: specimenType.id })
      .from(specimenType)
      .where(eq(specimenType.name, row.parent_specimen_type_name.trim()))
      .get()
    if (!typeRec) {
      throw new Error(`Specimen type '${row.parent_specimen_type_name}' not found`)
    }

    // Find specimen in batch
    const where = and(
      eq(specimen.controlBatchId, batchId),
      eq(specimen.specimenTypeId, typeRec.id),
      sql`${specimen.studySubjectId} IS NULL`,
    ) as any

    const candidates = await database
      .select({ id: specimen.id })
      .from(specimen)
      .where(row.parent_collection_date
        ? and(where, eq(specimen.collectionDate, row.parent_collection_date.trim())) as any
        : where,
      )

    if (candidates.length === 0) {
      throw new Error(`No ${row.parent_specimen_type_name} specimen found in control batch '${row.parent_control_batch_name || row.parent_control_batch_id}'`)
    }
    if (candidates.length > 1 && !row.parent_collection_date) {
      throw new Error(`Multiple ${row.parent_specimen_type_name} specimens found in batch; add parent_collection_date to disambiguate`)
    }

    const specId = candidates[0].id

    // Determine container type from row or infer
    const containerType = row.parent_container_type || 'paper'

    if (containerType === 'paper') {
      const parentContainer = await database
        .select({ id: storageContainer.id })
        .from(storageContainer)
        .innerJoin(paper, eq(paper.id, storageContainer.id))
        .where(eq(storageContainer.specimenId, specId))
        .get()

      if (!parentContainer) {
        throw new Error(`No paper container found for ${row.parent_specimen_type_name} specimen in control batch`)
      }

      return parentContainer.id
    }

    if (containerType === 'cryovial_tube') {
      if (!row.parent_box_barcode || !row.parent_position) {
        throw new Error('Cryovial control parents require parent_box_barcode and parent_position')
      }
      const box = await database
        .select({ id: cryovialBox.id })
        .from(cryovialBox)
        .where(eq(cryovialBox.barcode, row.parent_box_barcode.trim()))
        .get()
      if (!box) {
        throw new Error(`Cryovial box barcode '${row.parent_box_barcode}' not found`)
      }
      const tube = await database
        .select({ id: cryovialTube.id })
        .from(cryovialTube)
        .where(and(
          eq(cryovialTube.collectionId, box.id),
          eq(cryovialTube.position, row.parent_position.trim()),
        ) as any)
        .get()
      if (!tube) {
        throw new Error(`Cryovial tube not found at position '${row.parent_position}' in box '${row.parent_box_barcode}'`)
      }
      // Verify tube belongs to the specimen
      const container = await database
        .select({ specimenId: storageContainer.specimenId })
        .from(storageContainer)
        .where(eq(storageContainer.id, tube.id))
        .get()
      if (!container || container.specimenId !== specId) {
        throw new Error(`Cryovial tube at position '${row.parent_position}' does not belong to the specified control batch specimen`)
      }
      return tube.id
    }
  }

  const type = row.parent_container_type

  if (type === 'micronix_tube') {
    throw new Error('Micronix parent containers require parent_container_barcode or parent_container_id')
  }

  if (type === 'cryovial_tube') {
    if (!row.parent_box_barcode || !row.parent_position) {
      throw new Error('Cryovial parents require parent_box_barcode and parent_position')
    }
    const box = await database
      .select({ id: cryovialBox.id })
      .from(cryovialBox)
      .where(eq(cryovialBox.barcode, row.parent_box_barcode.trim()))
      .get()
    if (!box) {
      throw new Error(`Cryovial box barcode '${row.parent_box_barcode}' not found`)
    }
    const tube = await database
      .select({ id: cryovialTube.id })
      .from(cryovialTube)
      .where(and(
        eq(cryovialTube.collectionId, box.id),
        eq(cryovialTube.position, row.parent_position.trim()),
      ) as any)
      .get()
    if (!tube) {
      throw new Error(`Cryovial tube not found at position '${row.parent_position}' in box '${row.parent_box_barcode}'`)
    }
    return tube.id
  }

  if (type === 'paper') {
    // Check if it's a control batch or study subject
    if (row.parent_control_batch_name || row.parent_control_batch_id) {
      // Already handled above
      throw new Error('Control batch paper parents should be resolved via control batch logic')
    }

    if (!row.parent_study_short_code || !row.parent_subject_name || !row.parent_specimen_type_name) {
      throw new Error('Paper parents require either control batch identification (parent_control_batch_name + parent_specimen_type_name) or study subject identification (parent_study_short_code + parent_subject_name + parent_specimen_type_name)')
    }

    const studyRec = await database
      .select({ id: study.id })
      .from(study)
      .where(eq(study.shortCode, row.parent_study_short_code.trim()))
      .get()
    if (!studyRec) {
      throw new Error(`Study short code '${row.parent_study_short_code}' not found`)
    }

    const subjectRec = await database
      .select({ id: studySubject.id })
      .from(studySubject)
      .where(and(
        eq(studySubject.studyId, studyRec.id),
        eq(studySubject.name, row.parent_subject_name.trim()),
      ) as any)
      .get()
    if (!subjectRec) {
      throw new Error(`Subject '${row.parent_subject_name}' not found in study '${row.parent_study_short_code}'`)
    }

    const typeRec = await database
      .select({ id: specimenType.id })
      .from(specimenType)
      .where(eq(specimenType.name, row.parent_specimen_type_name.trim()))
      .get()
    if (!typeRec) {
      throw new Error(`Specimen type '${row.parent_specimen_type_name}' not found`)
    }

    const where = and(
      eq(specimen.studySubjectId, subjectRec.id),
      eq(specimen.specimenTypeId, typeRec.id),
    ) as any

    const candidates = await database
      .select({ id: specimen.id })
      .from(specimen)
      .where(row.parent_collection_date
        ? and(where, eq(specimen.collectionDate, row.parent_collection_date.trim())) as any
        : where,
      )

    if (candidates.length === 0) {
      throw new Error('No matching parent specimen/paper container found for subject/specimen criteria')
    }
    if (candidates.length > 1) {
      throw new Error('Multiple candidate parent specimens found; add parent_collection_date or use a more specific identifier')
    }

    const specId = candidates[0].id

    const parentContainer = await database
      .select({ id: storageContainer.id })
      .from(storageContainer)
      .innerJoin(paper, eq(paper.id, storageContainer.id))
      .where(eq(storageContainer.specimenId, specId))
      .get()

    if (!parentContainer) {
      throw new Error('No paper container found for resolved parent specimen')
    }

    return parentContainer.id
  }

  throw new Error('Unable to resolve parent container; provide parent_container_id, parent_container_barcode, or type-specific parent columns')
}

async function resolveCollectionId(
  database: DatabaseOrTransaction,
  containerType: DerivationCsvRow['container_type'],
  collectionName?: string,
  collectionBarcode?: string,
): Promise<{ id?: number; status: 'existing' | 'will_be_created' }> {
  if (!collectionName && !collectionBarcode) {
    return { status: 'will_be_created' }
  }

  if (containerType === 'micronix_tube') {
    if (collectionBarcode) {
      const plate = await database
        .select({ id: micronixPlate.id })
        .from(micronixPlate)
        .where(eq(micronixPlate.barcode, collectionBarcode.trim()))
        .get()
      if (plate) return { id: plate.id, status: 'existing' }
    }
    if (collectionName) {
      const plate = await database
        .select({ id: micronixPlate.id })
        .from(micronixPlate)
        .where(eq(micronixPlate.name, collectionName.trim()))
        .get()
      if (plate) return { id: plate.id, status: 'existing' }
    }
    return { status: 'will_be_created' }
  }

  if (containerType === 'cryovial_tube') {
    if (collectionBarcode) {
      const box = await database
        .select({ id: cryovialBox.id })
        .from(cryovialBox)
        .where(eq(cryovialBox.barcode, collectionBarcode.trim()))
        .get()
      if (box) return { id: box.id, status: 'existing' }
    }
    if (collectionName) {
      const box = await database
        .select({ id: cryovialBox.id })
        .from(cryovialBox)
        .where(eq(cryovialBox.name, collectionName.trim()))
        .get()
      if (box) return { id: box.id, status: 'existing' }
    }
    return { status: 'will_be_created' }
  }

  if (containerType === 'paper') {
    const sheetRec = await database
      .select({ id: paper.sheetId })
      .from(paper)
      .limit(1)
      .get()
    return { id: sheetRec?.id, status: sheetRec?.id ? 'existing' : 'will_be_created' }
  }

  return { status: 'will_be_created' }
}

export async function validateDerivationsCsv(
  database: Database,
  text: string,
  settings?: BulkDerivationSettings,
): Promise<ValidationResult> {
  const rows = parseCsv(text)
  const validationRows: ValidationResult['rows'] = []
  const collectionsMap = new Map<string, CollectionStatus>()
  /** Track (collectionKey, position) to catch duplicate position in same collection within the CSV */
  const seenCollectionPosition = new Set<string>()
  /** Track micronix container_barcode to catch duplicates within the CSV */
  const seenMicronixBarcode = new Set<string>()
  let validCount = 0
  let invalidCount = 0
  let warningCount = 0
  let firstParentSpecimenTypeId: number | null = null

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i]
    const validationRow: ValidationResult['rows'][0] = {
      index: i,
      valid: false,
    }

    try {
      // Validate required fields from settings
      if (settings) {
        if (row.derivation_type && row.derivation_type !== settings.derivationType) {
          validationRow.error = 'derivation_type in CSV conflicts with shared settings. Remove derivation_type from CSV.'
          validationRows.push(validationRow)
          invalidCount++
          continue
        }
        if (row.specimen_type_name && row.specimen_type_name !== settings.specimenTypeName) {
          validationRow.error = 'specimen_type_name in CSV conflicts with shared settings. Remove specimen_type_name from CSV.'
          validationRows.push(validationRow)
          invalidCount++
          continue
        }
        if (row.container_type && row.container_type !== settings.containerType) {
          validationRow.error = 'container_type in CSV conflicts with shared settings. Remove container_type from CSV.'
          validationRows.push(validationRow)
          invalidCount++
          continue
        }
        if (row.protocol && row.protocol !== settings.protocol) {
          validationRow.error = 'protocol in CSV conflicts with shared settings. Remove protocol from CSV.'
          validationRows.push(validationRow)
          invalidCount++
          continue
        }
        if (row.derivation_date && row.derivation_date !== settings.derivationDate) {
          validationRow.error = 'derivation_date in CSV conflicts with shared settings. Remove derivation_date from CSV.'
          validationRows.push(validationRow)
          invalidCount++
          continue
        }
      }

      const containerType = row.container_type || settings?.containerType || 'micronix_tube'
      const collectionName = getCollectionNameForType(row, containerType)
      if ((containerType === 'micronix_tube' || containerType === 'cryovial_tube') && !collectionName && !row.collection_barcode) {
        validationRow.error = `${getCollectionNameLabelForType(containerType)} or collection_barcode is required for ${containerType} derivations`
        validationRows.push(validationRow)
        invalidCount++
        continue
      }
      if (containerType === 'paper' && !collectionName) {
        validationRow.error = 'bag_name is required for paper derivations'
        validationRows.push(validationRow)
        invalidCount++
        continue
      }

      // Resolve parent container
      const parentContainerId = await resolveParentContainerId(database, row)
      validationRow.parentContainerId = parentContainerId

      // Get parent specimen type for validation
      let currentParentSpecimenTypeId: number | null = null
      if (settings?.validateSourceSpecimenType && parentContainerId) {
        const parentContainer = await database
          .select({ specimenId: storageContainer.specimenId })
          .from(storageContainer)
          .where(eq(storageContainer.id, parentContainerId))
          .get()
        
        if (parentContainer) {
          const parentSpecimen = await database
            .select({ specimenTypeId: specimen.specimenTypeId })
            .from(specimen)
            .where(eq(specimen.id, parentContainer.specimenId))
            .get()
          
          if (parentSpecimen) {
            currentParentSpecimenTypeId = parentSpecimen.specimenTypeId
            
            // Store first row's specimen type for comparison
            if (i === 0) {
              firstParentSpecimenTypeId = currentParentSpecimenTypeId
            } else if (firstParentSpecimenTypeId !== null && currentParentSpecimenTypeId !== firstParentSpecimenTypeId) {
              validationRow.warnings = validationRow.warnings || []
              validationRow.warnings.push('Source specimen type does not match other rows')
              warningCount++
            }
          }
        }
      }

      // Validate parent quantity if enabled
      if (settings?.validateParentQuantity && parentContainerId) {
        const parentContainer = await database
          .select({ 
            remainingQuantity: storageContainer.remainingQuantity,
            unitId: storageContainer.unitId,
          })
          .from(storageContainer)
          .where(eq(storageContainer.id, parentContainerId))
          .get()
        
        if (parentContainer) {
          const quantityUsed = row.quantity_used 
            ? parseNumber(row.quantity_used) 
            : settings.quantityUsed
          
          if (quantityUsed && parentContainer.remainingQuantity !== null && parentContainer.remainingQuantity < quantityUsed) {
            validationRow.warnings = validationRow.warnings || []
            validationRow.warnings.push(`Insufficient parent quantity: ${parentContainer.remainingQuantity} available, ${quantityUsed} requested`)
            warningCount++
          }
        }
      }

      // Resolve collection and track status
      const collectionInfo = await resolveCollectionId(
        database,
        containerType,
        collectionName,
        row.collection_barcode,
      )
      validationRow.collectionStatus = collectionInfo.status

      // For tube types, validate position and check for duplicate (existing collection or within CSV)
      if (containerType === 'micronix_tube' || containerType === 'cryovial_tube') {
        const position = (row.position ?? '').toString().trim()
        if (!position) {
          validationRow.error = 'position is required for each row when deriving to a plate or box'
          validationRows.push(validationRow)
          invalidCount++
          continue
        }
        const collectionKey = `${collectionName || ''}_${row.collection_barcode || ''}_${containerType}`
        const positionKey = `${collectionKey}\t${position}`

        // Check if position is already used in an existing collection
        if (collectionInfo.id !== undefined) {
          if (containerType === 'micronix_tube') {
            const existing = await database
              .select({ id: micronixTube.id })
              .from(micronixTube)
              .where(and(eq(micronixTube.collectionId, collectionInfo.id), eq(micronixTube.position, position)))
              .get()
            if (existing) {
              validationRow.error = 'That position is already used in that plate. Each position in a plate can only be used once. Use a different position or a different plate.'
              validationRows.push(validationRow)
              invalidCount++
              continue
            }
          } else {
            const existing = await database
              .select({ id: cryovialTube.id })
              .from(cryovialTube)
              .where(and(eq(cryovialTube.collectionId, collectionInfo.id), eq(cryovialTube.position, position)))
              .get()
            if (existing) {
              validationRow.error = 'That position is already used in that box. Each position in a box can only be used once. Use a different position or a different box.'
              validationRows.push(validationRow)
              invalidCount++
              continue
            }
          }
        }

        // Check for duplicate (collection + position) within the CSV
        if (seenCollectionPosition.has(positionKey)) {
          validationRow.error = 'This position in this plate or box is used more than once in your file. Each position can only be used once.'
          validationRows.push(validationRow)
          invalidCount++
          continue
        }
        seenCollectionPosition.add(positionKey)
      }

      // For micronix tubes, container_barcode is required (barcodes are scanned and provided externally)
      if (containerType === 'micronix_tube') {
        const barcode = (row.container_barcode ?? '').toString().trim()
        if (!barcode) {
          validationRow.error =
            'container_barcode is required for micronix tube derivations. Barcodes are scanned and provided by you; the system does not assign them.'
          validationRows.push(validationRow)
          invalidCount++
          continue
        }
        if (seenMicronixBarcode.has(barcode)) {
          validationRow.error =
            'That micronix barcode is used more than once in your file. Each barcode must be unique.'
          validationRows.push(validationRow)
          invalidCount++
          continue
        }
        const existingTube = await database
          .select({ id: micronixTube.id })
          .from(micronixTube)
          .where(eq(micronixTube.barcode, barcode))
          .get()
        if (existingTube) {
          validationRow.error =
            'That barcode is already used for another container. Use a different barcode. Barcodes are scanned and provided by you; the system does not assign them.'
          validationRows.push(validationRow)
          invalidCount++
          continue
        }
        seenMicronixBarcode.add(barcode)
      }

      // Track unique collections
      const collectionKey = `${collectionName || ''}_${row.collection_barcode || ''}_${containerType}`
      if (!collectionsMap.has(collectionKey) && (collectionName || row.collection_barcode)) {
        collectionsMap.set(collectionKey, {
          name: collectionName,
          barcode: row.collection_barcode,
          status: collectionInfo.status,
          containerType: containerType as 'micronix_tube' | 'cryovial_tube' | 'paper',
        })
      }

      validationRow.valid = true
      validCount++
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      validationRow.error = errorMessage
      invalidCount++
    }

    validationRows.push(validationRow)
  }

  return {
    rows: validationRows,
    collections: Array.from(collectionsMap.values()),
    summary: {
      total: rows.length,
      valid: validCount,
      invalid: invalidCount,
      warnings: warningCount,
    },
  }
}

export async function importDerivationsFromCsv(
  database: Database,
  text: string,
  options: { dryRun?: boolean; settings?: BulkDerivationSettings } = {},
): Promise<{ rows: DerivationCsvResultRow[] }> {
  const rows = parseCsv(text)
  const results: DerivationCsvResultRow[] = []
  const settings = options.settings

  // Validate that required fields from settings are not in CSV
  if (settings) {
    for (const row of rows) {
      if (row.derivation_type && row.derivation_type !== settings.derivationType) {
        throw new Error(`Row ${rows.indexOf(row) + 1}: derivation_type in CSV conflicts with shared settings. Remove derivation_type from CSV.`)
      }
      if (row.specimen_type_name && row.specimen_type_name !== settings.specimenTypeName) {
        throw new Error(`Row ${rows.indexOf(row) + 1}: specimen_type_name in CSV conflicts with shared settings. Remove specimen_type_name from CSV.`)
      }
      if (row.container_type && row.container_type !== settings.containerType) {
        throw new Error(`Row ${rows.indexOf(row) + 1}: container_type in CSV conflicts with shared settings. Remove container_type from CSV.`)
      }
      if (row.protocol && row.protocol !== settings.protocol) {
        throw new Error(`Row ${rows.indexOf(row) + 1}: protocol in CSV conflicts with shared settings. Remove protocol from CSV.`)
      }
      if (row.derivation_date && row.derivation_date !== settings.derivationDate) {
        throw new Error(`Row ${rows.indexOf(row) + 1}: derivation_date in CSV conflicts with shared settings. Remove derivation_date from CSV.`)
      }
    }
  }

  const useTx = !options.dryRun

  if (useTx) {
    // All-or-nothing: throw on first error to trigger rollback
    // Wrap in try-catch to capture which row failed, but still let transaction rollback
    let failedRowIndex: number | null = null
    let transactionError: unknown = null
    
    try {
      await database.transaction(async (tx) => {
        for (let i = 0; i < rows.length; i++) {
          const row = rows[i]
          try {
            const parentContainerId = await resolveParentContainerId(tx, row)
            const collectionInfo = await resolveCollectionId(
              tx,
              row.container_type || settings?.containerType || 'micronix_tube',
              getCollectionNameForType(row, row.container_type || settings?.containerType || 'micronix_tube'),
              row.collection_barcode,
            )

            // Use settings for required fields, allow CSV override for defaults
            const input: CreateDerivationInput = {
              parentContainerId,
              derivationType: settings?.derivationType || row.derivation_type!,
              specimenTypeName: settings?.specimenTypeName || row.specimen_type_name!,
              containerType: (settings?.containerType || row.container_type!) as 'micronix_tube' | 'cryovial_tube' | 'paper',
              quantity: row.quantity ? parseNumber(row.quantity) : settings?.quantity,
              unitSymbol: row.unit_symbol || settings?.unitSymbol,
              quantityUsed: row.quantity_used ? parseNumber(row.quantity_used) : settings?.quantityUsed,
              reduceParentQuantity: row.reduce_parent_quantity !== undefined 
                ? parseBoolean(row.reduce_parent_quantity) 
                : settings?.reduceParentQuantity,
              derivationDate: settings?.derivationDate || row.derivation_date!,
              protocol: settings?.protocol || row.protocol!,
              notes: row.notes,
              collectionId: collectionInfo.id,
              containerBarcode: row.container_barcode,
              position: row.position,
            }

            const result = await createDerivation(tx, input)
            const derivationTypeName = ((settings?.derivationType || row.derivation_type) ?? '').trim() || undefined
            const parentSummary = buildParentSummary(row)
            const childSummary = buildChildSummary(row)

            results.push({
              index: i,
              success: true,
              derivationId: result.derivation.id,
              parentContainerId,
              childContainerId: result.childContainer.id,
              warnings: result.warnings.map(w => w.message),
              collectionStatus: collectionInfo.status,
              derivationTypeName,
              parentSummary,
              childSummary,
            })
          } catch (error: unknown) {
            // Track which row failed and throw to trigger rollback
            failedRowIndex = i
            transactionError = error
            throw error
          }
        }
      })
    } catch (error: unknown) {
      // Transaction failed and rolled back - return error for failed row
      // All other rows are marked as not processed (transaction rolled back)
      // failedRowIndex is set in the inner catch before rethrow; control flow narrows it to number here
      const idx = failedRowIndex as number | null
      if (idx !== null) {
        const transactionErrorMessage = transactionError instanceof Error ? transactionError.message : String(transactionError || 'Unknown error')
        const errorMessage = error instanceof Error ? error.message : String(error)
        const rawMessage = transactionErrorMessage !== 'null' && transactionErrorMessage !== 'Unknown error' ? transactionErrorMessage : errorMessage
        const friendlyMessage = toUserFriendlyDerivationError(rawMessage)
        results.push({
          index: idx,
          success: false,
          error: `Row ${idx + 1}: ${friendlyMessage} No derivations were created; please fix the error and try again.`,
        })
        // Mark all previous rows as failed due to transaction rollback
        for (let i = 0; i < idx; i++) {
          results[i] = {
            index: i,
            success: false,
            error: `Stopped at row ${idx + 1}. No derivations were created.`,
          }
        }
      } else {
        // Unknown error
        throw error
      }
    }
  } else {
    // Dry run: validation only, no DB writes
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i]
      try {
        const parentContainerId = await resolveParentContainerId(database, row)
        const containerType = (settings?.containerType || row.container_type || 'micronix_tube') as 'micronix_tube' | 'cryovial_tube' | 'paper'
        const collectionInfo = await resolveCollectionId(
          database,
          row.container_type || settings?.containerType || 'micronix_tube',
          getCollectionNameForType(row, row.container_type || settings?.containerType || 'micronix_tube'),
          row.collection_barcode,
        )

        if (collectionInfo.id === undefined && (containerType === 'micronix_tube' || containerType === 'cryovial_tube')) {
          results.push({
            index: i,
            success: false,
            error: `collectionId is required for ${containerType} derivations`,
          })
          continue
        }
        if (collectionInfo.id === undefined && containerType === 'paper') {
          results.push({
            index: i,
            success: false,
            error: 'collectionId (sheetId) is required for paper derivations',
          })
          continue
        }

        results.push({
          index: i,
          success: true,
          collectionStatus: collectionInfo.status,
        })
      } catch (error: unknown) {
        const errorMessage = error instanceof Error ? error.message : String(error)
        results.push({
          index: i,
          success: false,
          error: errorMessage,
        })
      }
    }
  }

  return { rows: results }
}


