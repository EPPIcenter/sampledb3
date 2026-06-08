/**
 * Upfront validation for bulk-combined import. Runs all DB and payload checks
 * without performing any inserts; returns all errors for display.
 */
import type { Database } from '../db/client'
import {
  validateStudyShortCode,
  validateSubjectName,
  validateCollectionDate,
  validateUnitForContainerType,
} from './validation'
import { getDefaultUnit } from './defaults'
import { resolveSubjectByNameAndStudy, resolveSpecimenTypeByName } from './identifier-resolution'
import {
  type BulkCombinedContainerInput,
  type BulkCombinedPayload,
} from './bulk-combined-import'
import {
  bulkCombinedCollectionMessages,
  prepareCombinedSubjectContainerBatch,
} from './registration-prepare'
import {
  collectContainerPlacementErrors,
  type ContainerPlacementCheckRow,
} from './container-placement-validation'
/** Map orchestrator field messages to combined-import UX copy. */
function combinedContainerErrorMessage(message: string): string {
  if (message.includes('Position (well) is required')) {
    return 'Position is required for this container type (e.g. A01)'
  }
  return message
}

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
      container?: BulkCombinedContainerInput
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
  const { studyShortCode, subjects } = payload

  const add = (subjectIndex: number, specimenIndex: number, message: string, rowIndex?: number) => {
    errors.push({ subjectIndex, specimenIndex, message, ...(rowIndex !== undefined && { rowIndex }) })
  }

  const studyValidation = await validateStudyShortCode(database, studyShortCode)
  let studyId: number | null = null
  if (!studyValidation.valid || !studyValidation.studyId) {
    add(0, 0, studyValidation.error ?? 'Invalid study')
  } else {
    studyId = studyValidation.studyId
  }

  const placementRows: ContainerPlacementCheckRow[] = []
  const placementContexts: ContainerRowContext[] = []
  const toBeCreatedKeys = new Set<string>()

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

    const resolvedForPrepare: Array<{
      specimenTypeId: number
      collectionDate?: string
      container?: BulkCombinedContainerInput
      specimenIndex: number
      rowIndex?: number
    }> = []

    for (let specimenIndex = 0; specimenIndex < subj.specimens.length; specimenIndex++) {
      const spec = subj.specimens[specimenIndex]
      const rowIndex = 'rowIndex' in spec ? spec.rowIndex : undefined

      const specimenTypeId = await resolveSpecimenTypeByName(database, spec.specimenTypeName)
      if (!specimenTypeId) {
        add(subjectIndex, specimenIndex, `Specimen type '${spec.specimenTypeName}' not found`, rowIndex)
        continue
      }

      const dateValidation = validateCollectionDate(spec.collectionDate)
      if (!dateValidation.valid) {
        add(subjectIndex, specimenIndex, dateValidation.error ?? 'Invalid collection date', rowIndex)
        continue
      }

      if (spec.container?.containerType) {
        const containerType = spec.container.containerType
        try {
          const unitId = spec.container.unitId ?? (await getDefaultUnit(database, containerType))
          const unitValidation = await validateUnitForContainerType(database, containerType, unitId)
          if (!unitValidation.valid) {
            add(subjectIndex, specimenIndex, unitValidation.error ?? 'Invalid unit for container type', rowIndex)
          }
        } catch {
          add(subjectIndex, specimenIndex, 'Default unit not configured for this container type', rowIndex)
        }
      }

      resolvedForPrepare.push({
        specimenTypeId,
        collectionDate: spec.collectionDate,
        container: spec.container,
        specimenIndex,
        rowIndex,
      })
    }

    if (resolvedForPrepare.length === 0) {
      continue
    }

    const containerPrep = await prepareCombinedSubjectContainerBatch(
      database,
      resolvedForPrepare.map(({ specimenTypeId, collectionDate, container }) => ({
        specimenTypeId,
        collectionDate,
        container,
      })),
      { messages: bulkCombinedCollectionMessages }
    )
    if (!containerPrep.valid) {
      const failed = resolvedForPrepare[containerPrep.specimenIndex]
      add(
        subjectIndex,
        failed?.specimenIndex ?? containerPrep.specimenIndex,
        combinedContainerErrorMessage(containerPrep.message),
        failed?.rowIndex
      )
      continue
    }

    let placementRowIndex = 0
    for (const resolvedRow of resolvedForPrepare) {
      if (!resolvedRow.container?.containerType) continue
      const prepRow = containerPrep.result.placementRows[placementRowIndex]
      if (!prepRow) break

      const c = resolvedRow.container.collection
      const willCreateByName =
        (c && 'locationId' in c && c.locationId != null) ||
        (c && 'parent' in c && c.parent?.locationId != null)
      if (willCreateByName) {
        toBeCreatedKeys.add(prepRow.collectionKey)
      }

      placementRows.push(prepRow)
      placementContexts.push({
        subjectIndex,
        specimenIndex: resolvedRow.specimenIndex,
        rowIndex: resolvedRow.rowIndex,
      })
      placementRowIndex++
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
