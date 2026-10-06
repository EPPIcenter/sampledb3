/**
 * Registration batch prepare — provenance resolution and container placement checks
 * for bulk specimen validate/create.
 */
import type { Database } from '../db/client'
import { specimen } from '../db/schema'
import { validateSpecimenData, validateContainerTypeForSpecimenType } from './validation'
import { validateContainerWriteFields } from './specimen-registration'
import {
  buildContainerPlacementCheckRow,
  collectContainerPlacementErrors,
  type ContainerPlacementCheckRow,
} from './container-placement-validation'
import {
  assertLocationCanContainCollections,
  CollectionLocationNotAllowedError,
  CollectionLocationNotFoundError,
  LOCATION_CANNOT_CONTAIN_COLLECTIONS,
} from './collections/collection-lifecycle'
import {
  assertWriteInputPlacementResolvable,
  lookupWriteInputCollectionId,
  placementContainerFromWriteInput,
  toContainerWriteInput,
  type BulkCombinedContainerInput,
} from './container-write-placement'

export type BulkSpecimenContainerInput = Omit<BulkCombinedContainerInput, 'containerType'> & {
  containerType?: BulkCombinedContainerInput['containerType']
}

export type BulkSpecimenValidateRow = {
  sourceType: 'subject' | 'control'
  sourceId?: number
  studyShortCode?: string
  subjectName?: string
  specimenTypeName: string
  collectionDate?: string
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

type ResolvedSpecimen = NonNullable<Awaited<ReturnType<typeof validateSpecimenData>>['resolved']>

export type PreparedBulkSpecimenRow = {
  index: number
  row: BulkSpecimenValidateRow
  resolved: ResolvedSpecimen
}

export type SpecimenContainerRegistrationResult =
  | {
      valid: true
      collectionId: number | null
      collectionKey: string
      placementRow: ContainerPlacementCheckRow
    }
  | { valid: false; error: string }

export async function validateSpecimenContainerRegistration(
  database: Database,
  specimenTypeId: number,
  container: BulkCombinedContainerInput
): Promise<SpecimenContainerRegistrationResult> {
  const writeInput = toContainerWriteInput(container)
  const containerType = writeInput.containerType
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

  const containerValidation = validateContainerWriteFields(writeInput)
  if (!containerValidation.valid) {
    return { valid: false, error: containerValidation.error || 'Invalid container data' }
  }

  try {
    await assertWriteInputPlacementResolvable(database, writeInput)
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Invalid container placement'
    return { valid: false, error: message }
  }

  const collection = writeInput.collection
  const locationId =
    (collection && 'locationId' in collection ? collection.locationId : undefined) ??
    (collection && 'parent' in collection ? collection.parent?.locationId : undefined)
  if (locationId != null) {
    try {
      assertLocationCanContainCollections(database, locationId)
    } catch (error) {
      if (error instanceof CollectionLocationNotFoundError) {
        return { valid: false, error: 'Location not found' }
      }
      if (error instanceof CollectionLocationNotAllowedError) {
        return { valid: false, error: LOCATION_CANNOT_CONTAIN_COLLECTIONS }
      }
      throw error
    }
  }

  const collectionResolution = await lookupWriteInputCollectionId(database, writeInput)
  return {
    valid: true,
    collectionId: collectionResolution.collectionId,
    collectionKey: collectionResolution.collectionKey,
    placementRow: buildContainerPlacementCheckRow(
      placementContainerFromWriteInput(writeInput),
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

/**
 * Resolve provenance and container placement for flat bulk specimen rows.
 */
export async function prepareRegistrationBatchForSpecimens(
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

      // Carry the normalized date so dedup keys and inserts use the same form.
      prepared.push({ index, row: { ...row, collectionDate: validation.resolved.collectionDate }, resolved: validation.resolved })

      if (!row.container?.containerType) {
        continue
      }

      const containerRegistration = await validateSpecimenContainerRegistration(
        database,
        validation.resolved.specimenTypeId,
        row.container as BulkCombinedContainerInput
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
    const originalIndex = placementIndexToRowIndex.at(placementError.rowIndex)
    if (originalIndex !== undefined) {
      errors.push({ index: originalIndex, message: placementError.message })
    }
  }

  if (errors.length > 0) {
    return { valid: false, errors }
  }

  return { valid: true, prepared }
}
