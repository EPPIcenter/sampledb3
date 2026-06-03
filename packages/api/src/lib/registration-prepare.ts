/**
 * Registration batch prepare — provenance resolution and container placement checks
 * shared by bulk specimen validate/create and combined import validate/import.
 */
import type { Database } from '../db/client'
import { specimen } from '../db/schema'
import { validateSpecimenData, validateContainerTypeForSpecimenType } from './validation'
import {
  validateContainerFieldRequirements,
  type ContainerData,
  type ContainerType,
} from './container-creation'
import { resolveCollection } from './collections/collection-resolve'
import {
  buildContainerPlacementCheckRow,
  collectContainerPlacementErrors,
  type ContainerPlacementCheckRow,
} from './container-placement-validation'
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

type ResolvedSpecimen = NonNullable<Awaited<ReturnType<typeof validateSpecimenData>>['resolved']>

export type PreparedBulkSpecimenRow = {
  index: number
  row: BulkSpecimenValidateRow
  resolved: ResolvedSpecimen
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

export const bulkCombinedCollectionMessages: CollectionResolutionMessages = {
  collectionNotFound: (identifier) =>
    `Collection '${identifier}' not found. Provide collectionLocationId to create it.`,
  boxNotFound: (name) => `Box '${name}' not found. Provide collectionLocationId to create it.`,
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
    sheetName: container.sheetName,
    sublabel: container.sublabel,
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

export type CombinedSubjectSpecimenRow = {
  specimenTypeId: number
  collectionDate?: string
  container?: ExtendedContainerData
}

export type CombinedContainerPrepareResult = {
  placementRows: ContainerPlacementCheckRow[]
  collectionMap: Map<string, number>
}

/**
 * Validate containers for combined-import subject specimens with resolved specimen types.
 * Builds placement rows and a collection key map for downstream placement checks.
 */
export async function prepareCombinedSubjectContainerBatch(
  database: Database,
  specimens: CombinedSubjectSpecimenRow[],
  options?: { messages?: CollectionResolutionMessages }
): Promise<
  | { valid: true; result: CombinedContainerPrepareResult }
  | { valid: false; specimenIndex: number; message: string }
> {
  const messages = options?.messages ?? bulkCombinedCollectionMessages
  const placementRows: ContainerPlacementCheckRow[] = []
  const collectionMap = new Map<string, number>()

  for (let specimenIndex = 0; specimenIndex < specimens.length; specimenIndex++) {
    const spec = specimens[specimenIndex]
    if (!spec.container?.containerType) {
      continue
    }

    const containerRegistration = await validateSpecimenContainerRegistration(
      database,
      spec.specimenTypeId,
      spec.container,
      { messages }
    )
    if (!containerRegistration.valid) {
      return { valid: false, specimenIndex, message: containerRegistration.error }
    }

    const collectionResolution = await resolveContainerCollection(
      database,
      spec.container.containerType,
      spec.container,
      { messages }
    )
    if (collectionResolution.error) {
      return { valid: false, specimenIndex, message: collectionResolution.error }
    }
    if (collectionResolution.collectionId !== null) {
      collectionMap.set(collectionResolution.collectionKey, collectionResolution.collectionId)
    }

    placementRows.push(containerRegistration.placementRow)
  }

  return { valid: true, result: { placementRows, collectionMap } }
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
