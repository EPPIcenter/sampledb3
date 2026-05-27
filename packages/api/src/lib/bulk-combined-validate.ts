/**
 * Upfront validation for bulk-combined import. Runs all DB and payload checks
 * without performing any inserts; returns all errors for display.
 */
import type { Database } from '../db/client'
import { location } from '../db/schema'
import { eq } from 'drizzle-orm'
import {
  validateStudyShortCode,
  validateSubjectName,
  validateCollectionDate,
  validateContainerTypeForSpecimenType,
  validateUnitForContainerType,
} from './validation'
import { getDefaultUnit } from './defaults'
import { resolveSubjectByNameAndStudy, resolveSpecimenTypeByName } from './identifier-resolution'
import {
  normalizePosition,
  type ExtendedContainerData,
  type BulkCombinedPayload,
} from './bulk-combined-import'
import { resolveContainerCollection, bulkCombinedCollectionMessages } from './registration-orchestrator'
import {
  buildContainerPlacementCheckRow,
  collectContainerPlacementErrors,
  type ContainerPlacementCheckRow,
} from './container-placement-validation'

const LOCATION_CANNOT_CONTAIN_COLLECTIONS =
  'Location cannot contain collections. Only locations with canContainCollections=true can hold collections.'

export interface BulkCombinedValidateError {
  subjectIndex: number
  specimenIndex?: number
  rowIndex?: number
  message: string
}

export interface BulkCombinedValidateResult {
  valid: boolean
  errors: BulkCombinedValidateError[]
}

/** Payload for validate: same as BulkCombinedPayload but specimens may include optional rowIndex */
export type BulkCombinedValidatePayload = Omit<BulkCombinedPayload, 'subjects'> & {
  subjects: Array<{
    subjectName: string
    specimens: Array<{
      specimenTypeName: string
      collectionDate?: string
      container?: ExtendedContainerData
      rowIndex?: number
    }>
  }>
}

interface ContainerRowContext {
  subjectIndex: number
  specimenIndex: number
  rowIndex?: number
}

export async function validateBulkCombinedPayload(
  database: Database,
  payload: BulkCombinedValidatePayload
): Promise<BulkCombinedValidateResult> {
  const errors: BulkCombinedValidateError[] = []
  const { studyShortCode, createCollections = [], subjects } = payload

  const add = (subjectIndex: number, specimenIndex: number, message: string, rowIndex?: number) => {
    errors.push({ subjectIndex, specimenIndex, message, ...(rowIndex !== undefined && { rowIndex }) })
  }

  // 1. Validate createCollections locations
  for (let c = 0; c < createCollections.length; c++) {
    const coll = createCollections[c]
    const loc = await database.select().from(location).where(eq(location.id, coll.locationId)).get()
    if (!loc) {
      add(0, 0, `Location not found for collection '${coll.name}' (${coll.type})`)
      continue
    }
    if (!loc.canContainCollections) {
      add(0, 0, `${LOCATION_CANNOT_CONTAIN_COLLECTIONS} Collection '${coll.name}' uses location ID ${coll.locationId}.`)
    }
  }

  // 2. Validate study
  const studyValidation = await validateStudyShortCode(database, studyShortCode)
  let studyId: number | null = null
  if (!studyValidation.valid || !studyValidation.studyId) {
    add(0, 0, studyValidation.error ?? 'Invalid study')
  } else {
    studyId = studyValidation.studyId
  }

  const placementRows: ContainerPlacementCheckRow[] = []
  const placementContexts: ContainerRowContext[] = []
  const collectionKeyToId = new Map<string, number>()
  const toBeCreatedKeys = new Set<string>()
  for (const coll of createCollections) {
    toBeCreatedKeys.add(`${coll.type}-${coll.name}`)
  }

  // 3. Per-subject and per-specimen validation (first pass)
  for (let subjectIndex = 0; subjectIndex < subjects.length; subjectIndex++) {
    const subj = subjects[subjectIndex]
    const trimmedName = subj.subjectName.trim()

    if (studyId !== null) {
      const existingSubjectId = await resolveSubjectByNameAndStudy(database, trimmedName, studyId)
      if (!existingSubjectId) {
        const nameValidation = await validateSubjectName(database, studyId, trimmedName)
        if (!nameValidation.valid) {
          add(subjectIndex, 0, nameValidation.error ?? 'Invalid subject name')
        }
      }
    }

    for (let specimenIndex = 0; specimenIndex < subj.specimens.length; specimenIndex++) {
      const spec = subj.specimens[specimenIndex]
      const rowIndex = 'rowIndex' in spec ? spec.rowIndex : undefined

      const specimenTypeId = await resolveSpecimenTypeByName(database, spec.specimenTypeName)
      if (!specimenTypeId) {
        add(subjectIndex, specimenIndex, `Specimen type '${spec.specimenTypeName}' not found`, rowIndex)
      }

      const dateValidation = validateCollectionDate(spec.collectionDate)
      if (!dateValidation.valid) {
        add(subjectIndex, specimenIndex, dateValidation.error ?? 'Invalid collection date', rowIndex)
      }

      if (!spec.container?.containerType) {
        continue
      }

      const container = spec.container
      const containerType = container.containerType

      if (specimenTypeId) {
        const containerTypeValidation = await validateContainerTypeForSpecimenType(
          database,
          specimenTypeId,
          containerType
        )
        if (!containerTypeValidation.valid) {
          add(
            subjectIndex,
            specimenIndex,
            containerTypeValidation.error ?? 'Invalid container type for specimen type',
            rowIndex
          )
        }
      }

      const collectionResolution = await resolveContainerCollection(database, containerType, container, {
        messages: bulkCombinedCollectionMessages,
      })
      if (collectionResolution.error) {
        add(subjectIndex, specimenIndex, collectionResolution.error, rowIndex)
        continue
      }

      const { collectionKey, collectionId } = collectionResolution
      if (container.collectionLocationId) {
        toBeCreatedKeys.add(collectionKey)
      } else if (collectionId !== null) {
        collectionKeyToId.set(collectionKey, collectionId)
      }

      if (containerType !== 'paper') {
        try {
          const unitId = container.unitId ?? (await getDefaultUnit(database, containerType))
          const unitValidation = await validateUnitForContainerType(database, containerType, unitId)
          if (!unitValidation.valid) {
            add(subjectIndex, specimenIndex, unitValidation.error ?? 'Invalid unit for container type', rowIndex)
          }
        } catch {
          add(subjectIndex, specimenIndex, 'Default unit not configured for this container type', rowIndex)
        }
      }

      const normalizedPosition = normalizePosition(container.position)
      if (
        (containerType === 'micronix_tube' || containerType === 'cryovial_tube' || containerType === 'static_well') &&
        !normalizedPosition
      ) {
        add(subjectIndex, specimenIndex, 'Position is required for this container type (e.g. A01)', rowIndex)
      }
      if (containerType === 'paper' && !container.label?.trim()) {
        add(subjectIndex, specimenIndex, 'Label (sheet name) is required for paper', rowIndex)
      }
      if (containerType === 'micronix_tube' && (!container.barcode || !container.barcode.trim())) {
        add(subjectIndex, specimenIndex, 'Barcode is required for micronix tubes', rowIndex)
      }

      const resolvedId = collectionId ?? collectionKeyToId.get(collectionKey) ?? null
      placementRows.push(
        buildContainerPlacementCheckRow(container, resolvedId, collectionKey)
      )
      placementContexts.push({ subjectIndex, specimenIndex, rowIndex })
    }
  }

  const placementErrors = await collectContainerPlacementErrors(database, placementRows)
  for (const placementError of placementErrors) {
    const context = placementContexts[placementError.rowIndex]
    if (context) {
      add(context.subjectIndex, context.specimenIndex, placementError.message, context.rowIndex)
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  }
}
