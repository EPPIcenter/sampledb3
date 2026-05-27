/**
 * Registration orchestrator — single validate-row seam for bulk specimen registration.
 * Consolidates provenance (Study → Subject → Specimen / Control batch) and container placement checks.
 */
import type { Database } from '../db/client'
import { specimen } from '../db/schema'
import { validateSpecimenData, validateContainerTypeForSpecimenType } from './validation'
import {
  validateContainerFieldRequirements,
  createContainerForSpecimen,
  type ContainerData,
  type ContainerType,
} from './container-creation'
import { resolveCollection } from './collections/collection-resolve'
import {
  buildContainerPlacementCheckRow,
  collectContainerPlacementErrors,
  type ContainerPlacementCheckRow,
} from './container-placement-validation'
import { findExistingStudySpecimen, findExistingControlSpecimen } from './specimen-helpers'
import { utcNow } from './datetime'
import type { ExtendedContainerData } from './bulk-combined-import'

export type BulkSpecimenContainerInput = Omit<ExtendedContainerData, 'containerType'> & {
  containerType?: ExtendedContainerData['containerType']
}

export type BulkSpecimenValidateRow = {
  sourceType: 'subject' | 'control'
  sourceId?: number
  studyShortCode?: string
  subjectName?: string
  specimenTypeName: string
  collectionDate?: string
  containerBarcode?: string
  container?: BulkSpecimenContainerInput
}

export type BulkSpecimenValidateError = {
  index: number
  message: string
}

export type BulkSpecimenValidateResult = {
  valid: boolean
  errors: BulkSpecimenValidateError[]
}

export type BulkSpecimenCreateResult = {
  specimens: Array<typeof specimen.$inferSelect>
  created: number
  containersCreated: number
}

type CollectionResolutionMessages = {
  collectionNotFound: (identifier: string) => string
  boxNotFound: (name: string) => string
}

const bulkSpecimenCollectionMessages: CollectionResolutionMessages = {
  collectionNotFound: (identifier) =>
    `Collection '${identifier}' not found. Create it first or use Combined import with a location.`,
  boxNotFound: (name) =>
    `Box '${name}' not found. Create it first or use Combined import with a location.`,
}

const bulkCombinedCollectionMessages: CollectionResolutionMessages = {
  collectionNotFound: (identifier) =>
    `Collection '${identifier}' not found. Provide collectionLocationId to create it.`,
  boxNotFound: (name) => `Box '${name}' not found. Provide collectionLocationId to create it.`,
}

export { bulkCombinedCollectionMessages }

type ResolvedSpecimen = NonNullable<Awaited<ReturnType<typeof validateSpecimenData>>['resolved']>

type PreparedBulkSpecimenRow = {
  index: number
  row: BulkSpecimenValidateRow
  resolved: ResolvedSpecimen
}

export async function resolveContainerCollection(
  database: Database,
  containerType: ContainerType,
  container: ExtendedContainerData,
  options?: { messages?: CollectionResolutionMessages }
): Promise<{ collectionId: number | null; collectionKey: string; error?: string }> {
  const messages = options?.messages ?? bulkSpecimenCollectionMessages

  if (containerType === 'paper') {
    if (!container.collectionName) {
      return { collectionId: null, collectionKey: '', error: 'Box name (collection name) is required for paper' }
    }
    const collectionKey = `box-${container.collectionName}`
    const existingBox = await resolveCollection(container.collectionName, 'box', database)
    if (!existingBox && !container.collectionLocationId) {
      return {
        collectionId: null,
        collectionKey,
        error: messages.boxNotFound(container.collectionName),
      }
    }
    return { collectionId: existingBox, collectionKey }
  }

  const collectionType = containerType === 'cryovial_tube' ? 'cryovial_box' : 'micronix_plate'
  const identifier = container.collectionName || container.collectionBarcode
  if (!identifier) {
    return { collectionId: null, collectionKey: '', error: 'Plate/box name or barcode is required' }
  }
  const collectionKey = `${collectionType}-${identifier}`
  const existingId = await resolveCollection(identifier, collectionType, database)
  if (!existingId && !container.collectionLocationId) {
    return {
      collectionId: null,
      collectionKey,
      error: messages.collectionNotFound(identifier),
    }
  }
  return { collectionId: existingId, collectionKey }
}

export type SpecimenContainerRegistrationResult =
  | {
      valid: true
      collectionId: number | null
      collectionKey: string
      placementRow: ContainerPlacementCheckRow
    }
  | { valid: false; error: string }

/**
 * Shared container type, field, collection resolution, and placement-row build.
 * Used by bulk specimen validate/create and combined import validate/import paths.
 */
export async function validateSpecimenContainerRegistration(
  database: Database,
  specimenTypeId: number,
  container: ExtendedContainerData,
  options?: { messages?: CollectionResolutionMessages }
): Promise<SpecimenContainerRegistrationResult> {
  const containerType = container.containerType
  const containerTypeValidation = await validateContainerTypeForSpecimenType(
    database,
    specimenTypeId,
    containerType
  )
  if (!containerTypeValidation.valid) {
    return {
      valid: false,
      error: containerTypeValidation.error || 'Invalid container type for specimen type',
    }
  }

  const containerDataForValidation: ContainerData = {
    containerType,
    collectionName: container.collectionName,
    collectionBarcode: container.collectionBarcode,
    barcode: container.barcode,
    position: container.position,
    label: container.label,
  }
  const containerValidation = validateContainerFieldRequirements(containerType, containerDataForValidation)
  if (!containerValidation.valid) {
    return { valid: false, error: containerValidation.error || 'Invalid container data' }
  }

  const collectionResolution = await resolveContainerCollection(database, containerType, container, options)
  if (collectionResolution.error) {
    return { valid: false, error: collectionResolution.error }
  }

  return {
    valid: true,
    collectionId: collectionResolution.collectionId,
    collectionKey: collectionResolution.collectionKey,
    placementRow: buildContainerPlacementCheckRow(
      container,
      collectionResolution.collectionId,
      collectionResolution.collectionKey
    ),
  }
}

/** Stable dedupe key for bulk specimen rows (subject/control + type + date). */
export function bulkSpecimenPayloadKey(row: BulkSpecimenValidateRow, resolved: ResolvedSpecimen): string {
  return row.sourceType === 'subject'
    ? `s:${String(row.studyShortCode ?? '')}:${String(row.subjectName ?? '')}:${String(row.specimenTypeName)}:${String(row.collectionDate ?? '')}`
    : `c:${String(resolved.controlBatchId ?? '')}:${String(resolved.specimenTypeId)}:${String(row.collectionDate ?? '')}`
}

async function prepareBulkSpecimenRows(
  database: Database,
  rows: BulkSpecimenValidateRow[]
): Promise<
  | { valid: true; prepared: PreparedBulkSpecimenRow[] }
  | { valid: false; errors: BulkSpecimenValidateError[] }
> {
  const errors: BulkSpecimenValidateError[] = []
  const prepared: PreparedBulkSpecimenRow[] = []
  const placementRows: ContainerPlacementCheckRow[] = []
  const placementIndexToRowIndex: number[] = []

  for (let index = 0; index < rows.length; index++) {
    const row = rows[index]
    try {
      const validation = await validateSpecimenData(
        {
          sourceType: row.sourceType,
          sourceId: row.sourceId,
          studyShortCode: row.studyShortCode,
          subjectName: row.subjectName,
          specimenTypeName: row.specimenTypeName,
          collectionDate: row.collectionDate,
        },
        database
      )
      if (!validation.valid || !validation.resolved) {
        errors.push({ index, message: validation.error || 'Invalid specimen data' })
        continue
      }

      prepared.push({ index, row, resolved: validation.resolved })

      if (!row.container?.containerType) {
        continue
      }

      const containerRegistration = await validateSpecimenContainerRegistration(
        database,
        validation.resolved.specimenTypeId,
        row.container as ExtendedContainerData
      )
      if (!containerRegistration.valid) {
        errors.push({ index, message: containerRegistration.error })
        continue
      }

      placementRows.push(containerRegistration.placementRow)
      placementIndexToRowIndex.push(index)
    } catch (error: unknown) {
      errors.push({
        index,
        message: error instanceof Error ? error.message : 'Validation failed',
      })
    }
  }

  const placementErrors = await collectContainerPlacementErrors(database, placementRows)
  for (const placementError of placementErrors) {
    const originalIndex = placementIndexToRowIndex[placementError.rowIndex]
    if (originalIndex !== undefined) {
      errors.push({ index: originalIndex, message: placementError.message })
    }
  }

  if (errors.length > 0) {
    return { valid: false, errors }
  }

  return { valid: true, prepared }
}

/**
 * Validate bulk specimen rows without creating records.
 * Used by POST /specimens/bulk/validate.
 */
export async function validateBulkSpecimenRows(
  database: Database,
  rows: BulkSpecimenValidateRow[]
): Promise<BulkSpecimenValidateResult> {
  const result = await prepareBulkSpecimenRows(database, rows)
  return {
    valid: result.valid,
    errors: result.valid ? [] : result.errors,
  }
}

/**
 * Create bulk specimen rows after the same validation as validateBulkSpecimenRows.
 * Used by POST /specimens/bulk.
 */
export async function createBulkSpecimenRows(
  database: Database,
  rows: BulkSpecimenValidateRow[],
  userId?: number
): Promise<
  | { success: true; result: BulkSpecimenCreateResult }
  | { success: false; errors: BulkSpecimenValidateError[] }
> {
  const prep = await prepareBulkSpecimenRows(database, rows)
  if (!prep.valid) {
    return { success: false, errors: prep.errors }
  }

  const { prepared } = prep
  const now = utcNow()

  const orderedPayloadKeys = prepared.map(({ row, resolved }) => bulkSpecimenPayloadKey(row, resolved))
  const payloadKeyToFirstIndex = new Map<string, number>()
  for (let idx = 0; idx < orderedPayloadKeys.length; idx++) {
    const key = orderedPayloadKeys[idx]
    if (!payloadKeyToFirstIndex.has(key)) payloadKeyToFirstIndex.set(key, idx)
  }
  const uniqueSpecimenOrder: number[] = []
  const indexToUniqueIndex: number[] = []
  for (let idx = 0; idx < orderedPayloadKeys.length; idx++) {
    const first = payloadKeyToFirstIndex.get(orderedPayloadKeys[idx]) ?? idx
    if (first === idx) uniqueSpecimenOrder.push(idx)
    indexToUniqueIndex.push(uniqueSpecimenOrder.indexOf(first))
  }

  const specimenRecordsByUniqueIndex: Array<typeof specimen.$inferSelect> = []
  const syncResult = database.transaction((tx) => {
    const dbTx = tx as unknown as Database
    let newCount = 0
    for (const uniqueIdx of uniqueSpecimenOrder) {
      const { row, resolved } = prepared[uniqueIdx]
      const studySubjectId = resolved.studySubjectId
      const existing =
        row.sourceType === 'subject' && studySubjectId != null
          ? findExistingStudySpecimen(dbTx, studySubjectId, resolved.specimenTypeId, row.collectionDate)
          : row.sourceType === 'control' && resolved.controlBatchId != null
            ? findExistingControlSpecimen(dbTx, resolved.controlBatchId, resolved.specimenTypeId, row.collectionDate)
            : null
      if (existing) {
        specimenRecordsByUniqueIndex.push(existing)
      } else {
        const insertResult = tx
          .insert(specimen)
          .values({
            studySubjectId: resolved.studySubjectId,
            controlBatchId: resolved.controlBatchId,
            specimenTypeId: resolved.specimenTypeId,
            collectionDate: row.collectionDate ?? null,
            created: now,
            lastUpdated: now,
            createdBy: userId,
            updatedBy: userId,
          })
          .returning()
          .get()
        const inserted = Array.isArray(insertResult) ? insertResult[0] : insertResult
        if (!inserted) throw new Error('Insert did not return specimen row')
        specimenRecordsByUniqueIndex.push(inserted as typeof specimen.$inferSelect)
        newCount += 1
      }
    }
    return { newCount }
  })

  const specimensOut = indexToUniqueIndex.map((ui) => specimenRecordsByUniqueIndex[ui])
  let containersCount = 0
  await database.transaction(async (tx) => {
    const dbTx = tx as unknown as Database
    for (let i = 0; i < prepared.length; i++) {
      const { row, index } = prepared[i]
      const specimenRecord = specimensOut[i]
      if (!row.container?.containerType) continue
      const container = row.container as ExtendedContainerData
      const containerData: ContainerData = {
        containerType: container.containerType,
        collectionName: container.collectionName,
        collectionBarcode: container.collectionBarcode,
        barcode: container.barcode,
        position: container.position,
        label: container.label,
        unitId: container.unitId,
        totalQuantity: container.totalQuantity,
        remainingQuantity: container.remainingQuantity,
        comment: container.comment,
      }
      const containerResult = await createContainerForSpecimen(
        specimenRecord.id,
        containerData,
        dbTx,
        userId
      )
      if (!containerResult.success || !containerResult.containerId) {
        throw new Error(containerResult.error ?? `Row ${index}: failed to create container`)
      }
      containersCount += 1
    }
  })

  return {
    success: true,
    result: {
      specimens: specimensOut,
      created: syncResult.newCount,
      containersCreated: containersCount,
    },
  }
}
