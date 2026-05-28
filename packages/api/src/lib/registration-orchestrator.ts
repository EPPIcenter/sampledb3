/**
 * Registration orchestrator — validate/create entry points for bulk specimen registration.
 * Prepare logic lives in registration-prepare.ts.
 */
import type { Database } from '../db/client'
import { specimen } from '../db/schema'
import {
  createContainerForSpecimen,
  type ContainerData,
} from './container-creation'
import { findExistingStudySpecimen, findExistingControlSpecimen } from './specimen-helpers'
import { utcNow } from './datetime'
import type { ExtendedContainerData } from './bulk-combined-import'
import {
  bulkSpecimenPayloadKey,
  prepareRegistrationBatchForSpecimens,
  type BulkSpecimenValidateRow,
  type BulkSpecimenValidateError,
  type BulkSpecimenValidateResult,
  type BulkSpecimenCreateResult,
} from './registration-prepare'

export type {
  BulkSpecimenContainerInput,
  BulkSpecimenValidateRow,
  BulkSpecimenValidateError,
  BulkSpecimenValidateResult,
  BulkSpecimenCreateResult,
  PreparedBulkSpecimenRow,
  SpecimenContainerRegistrationResult,
} from './registration-prepare'

export {
  bulkCombinedCollectionMessages,
  bulkSpecimenPayloadKey,
  prepareRegistrationBatchForSpecimens,
  prepareCombinedSubjectContainerBatch,
  resolveContainerCollection,
  validateSpecimenContainerRegistration,
} from './registration-prepare'

/**
 * Validate bulk specimen rows without creating records.
 * Used by POST /specimens/bulk/validate.
 */
export async function validateBulkSpecimenRows(
  database: Database,
  rows: BulkSpecimenValidateRow[]
): Promise<BulkSpecimenValidateResult> {
  const result = await prepareRegistrationBatchForSpecimens(database, rows)
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
  const prep = await prepareRegistrationBatchForSpecimens(database, rows)
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
        collectionLocationId: container.collectionLocationId,
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
