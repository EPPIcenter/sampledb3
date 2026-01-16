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

export interface BulkDerivationSettings {
  // Required fields (must be same for all rows, cannot be overridden in CSV)
  derivationType: string
  specimenTypeName: string
  containerType: 'micronix_tube' | 'cryovial_tube' | 'paper'
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
  collection_name?: string
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
      const containerType = row.container_type || settings?.containerType || 'micronix_tube'
      const collectionInfo = await resolveCollectionId(
        database,
        containerType,
        row.collection_name,
        row.collection_barcode,
      )
      validationRow.collectionStatus = collectionInfo.status

      // Track unique collections
      const collectionKey = `${row.collection_name || ''}_${row.collection_barcode || ''}_${containerType}`
      if (!collectionsMap.has(collectionKey) && (row.collection_name || row.collection_barcode)) {
        collectionsMap.set(collectionKey, {
          name: row.collection_name,
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
              row.collection_name,
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

            results.push({
              index: i,
              success: true,
              derivationId: result.derivation.id,
              parentContainerId,
              childContainerId: result.childContainer.id,
              warnings: result.warnings.map(w => w.message),
              collectionStatus: collectionInfo.status,
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
      if (failedRowIndex !== null) {
        const transactionErrorMessage = transactionError instanceof Error ? transactionError.message : String(transactionError || 'Unknown error')
        const errorMessage = error instanceof Error ? error.message : String(error)
        const finalMessage = transactionErrorMessage !== 'null' && transactionErrorMessage !== 'Unknown error' ? transactionErrorMessage : errorMessage
        results.push({
          index: failedRowIndex,
          success: false,
          error: `Row ${failedRowIndex + 1}: ${finalMessage}. All changes rolled back (all-or-nothing transaction).`,
        })
        // Mark all previous rows as failed due to transaction rollback
        for (let i = 0; i < failedRowIndex; i++) {
          results[i] = {
            index: i,
            success: false,
            error: `Transaction rolled back due to error in row ${failedRowIndex + 1}`,
          }
        }
      } else {
        // Unknown error
        throw error
      }
    }
  } else {
    // Dry run: can return partial results
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i]
      try {
        const parentContainerId = await resolveParentContainerId(database, row)
        const collectionInfo = await resolveCollectionId(
          database,
          row.container_type || settings?.containerType || 'micronix_tube',
          row.collection_name,
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

        const result = await createDerivation(database, input)

        results.push({
          index: i,
          success: true,
          derivationId: result.derivation.id,
          parentContainerId,
          childContainerId: result.childContainer.id,
          warnings: result.warnings.map(w => w.message),
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


