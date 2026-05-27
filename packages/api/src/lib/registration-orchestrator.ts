/**
 * Registration orchestrator — single validate-row seam for bulk specimen registration.
 * Consolidates provenance (Study → Subject → Specimen / Control batch) and container placement checks.
 */
import type { Database } from '../db/client'
import { validateSpecimenData, validateContainerTypeForSpecimenType } from './validation'
import {
  validateContainerFieldRequirements,
  type ContainerData,
  type ContainerType,
} from './container-creation'
import { resolveCollection } from './collection-resolution'
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

/**
 * Validate bulk specimen rows without creating records.
 * Used by POST /specimens/bulk/validate.
 */
export async function validateBulkSpecimenRows(
  database: Database,
  rows: BulkSpecimenValidateRow[]
): Promise<BulkSpecimenValidateResult> {
  const errors: BulkSpecimenValidateError[] = []
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

      if (!row.container?.containerType) {
        continue
      }

      const container = row.container as ExtendedContainerData
      const containerType = container.containerType
      const containerTypeValidation = await validateContainerTypeForSpecimenType(
        database,
        validation.resolved.specimenTypeId,
        containerType
      )
      if (!containerTypeValidation.valid) {
        errors.push({
          index,
          message: containerTypeValidation.error || 'Invalid container type for specimen type',
        })
        continue
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
        errors.push({ index, message: containerValidation.error || 'Invalid container data' })
        continue
      }

      const collectionResolution = await resolveContainerCollection(database, containerType, container)
      if (collectionResolution.error) {
        errors.push({ index, message: collectionResolution.error })
        continue
      }

      placementRows.push(
        buildContainerPlacementCheckRow(
          container,
          collectionResolution.collectionId,
          collectionResolution.collectionKey
        )
      )
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

  return {
    valid: errors.length === 0,
    errors,
  }
}
