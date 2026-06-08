/**
 * Bulk combined import (subjects + specimens + containers) with configurable atomicity.
 * Used by POST /imports/bulk-combined and shares logic with POST /subjects/with-specimens.
 */
import type { Database } from '../db/client'
import {
  studySubject,
  specimen,
  specimenType,
} from '../db/schema'
import { eq } from 'drizzle-orm'
import { findExistingStudySpecimen } from './specimen-helpers'
import {
  validateStudyShortCode,
  validateSubjectName,
  validateCollectionDate,
  validateContainerTypeForSpecimenType,
  validateUnitForContainerType,
} from './validation'
import { getDefaultUnit, getDefaultTotalQuantity, getDefaultRemainingQuantity } from './defaults'
import { utcNow } from './datetime'
import { resolveSubjectByNameAndStudy, resolveSpecimenTypeByName } from './identifier-resolution'
import { ValidationError } from './error-handler'
import { collectContainerPlacementErrors } from './container-placement-validation'
import {
  bulkCombinedCollectionMessages,
  prepareCombinedSubjectContainerBatch,
} from './registration-prepare'
import {
  createContainerForSpecimen,
  type ContainerData,
} from './container-creation'
import {
  resolveContainerPlacement,
  toContainerWriteInput,
  type BulkCombinedContainerInput,
} from './container-write-placement'

export type { BulkCombinedContainerInput }

export { normalizePosition } from './normalize-position'

export interface WithSpecimensPayload {
  studyShortCode: string
  subjectName: string
  specimens: Array<{
    specimenTypeName: string
    collectionDate?: string
    container?: BulkCombinedContainerInput
  }>
}

export interface OneSubjectResult {
  subject: typeof studySubject.$inferSelect
  subjectCreated: boolean
  specimens: Array<{
    specimen: typeof specimen.$inferSelect
    containerCreated: boolean
    containerId?: number
    specimenCreated: boolean
  }>
  summary: {
    subjectsCreated: number
    subjectsUpdated: number
    specimensCreated: number
    containersCreated: number
  }
}

interface PreparedSubject {
  studyId: number
  existingSubjectId: number | null
  trimmedName: string
  resolvedSpecimens: Array<{
    specimenTypeId: number
    collectionDate?: string
    container?: BulkCombinedContainerInput
  }>
  preparedContainers: Array<{ unitId: number; totalQuantity: number; remainingQuantity: number }>
  collectionMap: Map<string, number>
}

async function revalidatePreparedSubjectInTx(
  tx: Parameters<Parameters<Database['transaction']>[0]>[0],
  prepared: PreparedSubject,
  subjectIndex: number
): Promise<void> {
  const dbTx = tx as unknown as Database
  const subjectLabel = `subject ${subjectIndex + 1} ('${prepared.trimmedName}')`

  if (prepared.existingSubjectId) {
    const existing = tx.select({ id: studySubject.id }).from(studySubject).where(eq(studySubject.id, prepared.existingSubjectId)).get()
    if (!existing) {
      throw new ValidationError(`${subjectLabel}: existing subject no longer exists`)
    }
  }

  for (let i = 0; i < prepared.resolvedSpecimens.length; i++) {
    const spec = prepared.resolvedSpecimens[i]
    const specimenLabel = `${subjectLabel}, specimen ${i + 1}`
    const typeExists = tx.select({ id: specimenType.id }).from(specimenType).where(eq(specimenType.id, spec.specimenTypeId)).get()
    if (!typeExists) {
      throw new ValidationError(`${specimenLabel}: specimen type no longer exists`)
    }

    if (spec.container?.containerType) {
      const container = spec.container
      const containerTypeValidation = await validateContainerTypeForSpecimenType(
        dbTx,
        spec.specimenTypeId,
        container.containerType
      )
      if (!containerTypeValidation.valid) {
        throw new ValidationError(`${specimenLabel}: ${containerTypeValidation.error ?? 'invalid container type for specimen type'}`)
      }
      const unitValidation = await validateUnitForContainerType(
        dbTx,
        container.containerType,
        prepared.preparedContainers[i].unitId
      )
      if (!unitValidation.valid) {
        throw new ValidationError(`${specimenLabel}: ${unitValidation.error ?? 'invalid unit for container type'}`)
      }

      try {
        await resolveContainerPlacement(dbTx, toContainerWriteInput(container), prepared.collectionMap)
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : 'Invalid container placement'
        throw new ValidationError(`${specimenLabel}: ${message}`)
      }
    }
  }
}

export async function prepareSubjectWithSpecimens(
  database: Database,
  studyShortCode: string,
  subjectName: string,
  specimens: WithSpecimensPayload['specimens']
): Promise<PreparedSubject> {
  const studyValidation = await validateStudyShortCode(database, studyShortCode)
  if (!studyValidation.valid || !studyValidation.studyId) {
    throw new ValidationError(studyValidation.error ?? 'Invalid study')
  }
  const studyId = studyValidation.studyId
  const trimmedName = subjectName.trim()
  const existingSubjectId = await resolveSubjectByNameAndStudy(database, trimmedName, studyId)
  if (!existingSubjectId) {
    const nameValidation = await validateSubjectName(database, studyId, trimmedName)
    if (!nameValidation.valid) throw new ValidationError(nameValidation.error ?? 'Invalid subject name')
  }

  const resolvedSpecimens: PreparedSubject['resolvedSpecimens'] = []
  for (let i = 0; i < specimens.length; i++) {
    const spec = specimens[i]
    const specimenTypeId = await resolveSpecimenTypeByName(database, spec.specimenTypeName)
    if (!specimenTypeId) {
      throw new ValidationError(`Specimen type '${spec.specimenTypeName}' not found`, { specimenIndex: i })
    }
    const dateValidation = validateCollectionDate(spec.collectionDate)
    if (!dateValidation.valid) {
      throw new ValidationError(dateValidation.error ?? 'Invalid collection date', { specimenIndex: i })
    }
    resolvedSpecimens.push({
      specimenTypeId,
      collectionDate: spec.collectionDate,
      container: spec.container,
    })
  }

  const containerPrep = await prepareCombinedSubjectContainerBatch(database, resolvedSpecimens, {
    messages: bulkCombinedCollectionMessages,
  })
  if (!containerPrep.valid) {
    throw new ValidationError(containerPrep.message, { specimenIndex: containerPrep.specimenIndex })
  }

  const { placementRows, collectionMap } = containerPrep.result
  const placementErrors = await collectContainerPlacementErrors(database, placementRows)
  if (placementErrors.length > 0) {
    throw new ValidationError(placementErrors[0].message, { specimenIndex: placementErrors[0].rowIndex })
  }

  const preparedContainers: PreparedSubject['preparedContainers'] = []
  for (const spec of resolvedSpecimens) {
    if (spec.container?.containerType) {
      const containerType = spec.container.containerType
      const unitId = spec.container.unitId ?? (await getDefaultUnit(database, containerType))
      const unitValidation = await validateUnitForContainerType(database, containerType, unitId)
      if (!unitValidation.valid) throw new ValidationError(unitValidation.error ?? 'Invalid unit for container type')
      const defaultTotalQty = await getDefaultTotalQuantity(database, containerType)
      const defaultRemainingQty = await getDefaultRemainingQuantity(database, containerType)
      preparedContainers.push({
        unitId,
        totalQuantity: spec.container.totalQuantity ?? defaultTotalQty,
        remainingQuantity: spec.container.remainingQuantity ?? spec.container.totalQuantity ?? defaultRemainingQty,
      })
    } else {
      preparedContainers.push({ unitId: 0, totalQuantity: 0, remainingQuantity: 0 })
    }
  }

  return {
    studyId,
    existingSubjectId,
    trimmedName,
    resolvedSpecimens,
    preparedContainers,
    collectionMap,
  }
}

export async function createSubjectWithSpecimensInTx(
  tx: Parameters<Parameters<Database['transaction']>[0]>[0],
  prepared: PreparedSubject,
  userId: number | undefined,
  now: string
): Promise<OneSubjectResult> {
  const dbTx = tx as unknown as Database
  const { studyId, existingSubjectId, trimmedName, resolvedSpecimens, preparedContainers, collectionMap } = prepared

  let subjectId: number
  let subject: typeof studySubject.$inferSelect
  if (existingSubjectId) {
    const existing = tx.select().from(studySubject).where(eq(studySubject.id, existingSubjectId)).get()
    if (!existing) throw new Error('Subject not found')
    subject = existing
    subjectId = existing.id
  } else {
    const newSubjectResult = tx
      .insert(studySubject)
      .values({
        studyId,
        name: trimmedName,
        created: now,
        lastUpdated: now,
        createdBy: userId,
        updatedBy: userId,
      })
      .returning()
      .get()
    const insertedSubject = Array.isArray(newSubjectResult) ? newSubjectResult[0] : newSubjectResult
    if (!insertedSubject) {
      throw new Error('Insert did not return study subject row')
    }
    subject = insertedSubject as typeof studySubject.$inferSelect
    subjectId = subject.id
  }

  const insertedSpecimens: OneSubjectResult['specimens'] = []
  for (let i = 0; i < resolvedSpecimens.length; i++) {
    const spec = resolvedSpecimens[i]
    const preparedContainer = preparedContainers[i]
    const existingSpecimen = findExistingStudySpecimen(dbTx, subjectId, spec.specimenTypeId, spec.collectionDate)
    let specimenRecord: typeof specimen.$inferSelect
    let specimenCreated: boolean
    if (existingSpecimen) {
      specimenRecord = existingSpecimen
      specimenCreated = false
    } else {
      const newSpecimenResult = tx
        .insert(specimen)
        .values({
          studySubjectId: subjectId,
          specimenTypeId: spec.specimenTypeId,
          collectionDate: spec.collectionDate,
          created: now,
          lastUpdated: now,
          createdBy: userId,
          updatedBy: userId,
        })
        .returning()
        .get()
      specimenRecord = (Array.isArray(newSpecimenResult) ? newSpecimenResult[0] : newSpecimenResult) as typeof specimen.$inferSelect
      specimenCreated = true
    }
    const specimenId = specimenRecord.id
    let containerCreated = false
    let containerId: number | undefined

    if (spec.container?.containerType) {
      const container = spec.container
      const writeInput = toContainerWriteInput(container)
      const resolved = await resolveContainerPlacement(tx, writeInput, collectionMap)
      const containerData: ContainerData = {
        ...resolved,
        unitId: preparedContainer.unitId,
        totalQuantity: preparedContainer.totalQuantity,
        remainingQuantity: preparedContainer.remainingQuantity,
        comment: 'comment' in writeInput ? writeInput.comment : undefined,
      }
      const containerResult = await createContainerForSpecimen(specimenId, containerData, tx, {
        userId,
        collectionMap,
        skipValidation: true,
      })
      if (!containerResult.success || !containerResult.containerId) {
        throw new ValidationError(
          containerResult.error ?? 'Failed to create container',
          { specimenIndex: i }
        )
      }
      containerId = containerResult.containerId
      containerCreated = true
    }

    insertedSpecimens.push({
      specimen: specimenRecord,
      containerCreated,
      containerId,
      specimenCreated,
    })
  }

  const subjectCreated = !existingSubjectId
  return {
    subject,
    subjectCreated,
    specimens: insertedSpecimens,
    summary: {
      subjectsCreated: subjectCreated ? 1 : 0,
      subjectsUpdated: subjectCreated ? 0 : 1,
      specimensCreated: insertedSpecimens.filter((s) => s.specimenCreated).length,
      containersCreated: insertedSpecimens.filter((s) => s.containerCreated).length,
    },
  }
}

export async function runOneSubjectWithSpecimens(
  database: Database,
  payload: WithSpecimensPayload,
  userId: number | undefined
): Promise<OneSubjectResult> {
  const prepared = await prepareSubjectWithSpecimens(
    database,
    payload.studyShortCode,
    payload.subjectName,
    payload.specimens
  )
  const now = utcNow()
  return database.transaction(async (tx) => {
    return createSubjectWithSpecimensInTx(tx, prepared, userId, now)
  })
}

export interface BulkCombinedPayload {
  studyShortCode: string
  atomicMode: 'full_file' | 'per_subject'
  subjects: Array<{
    subjectName: string
    specimens: Array<{
      specimenTypeName: string
      collectionDate?: string
      container?: BulkCombinedContainerInput
    }>
  }>
}

export interface BulkCombinedResult {
  summary: {
    subjectsCreated: number
    subjectsUpdated: number
    specimensCreated: number
    containersCreated: number
  }
  results: OneSubjectResult[]
  errors?: Array<{ index: number; error: string }>
}

export async function runBulkCombinedImport(
  database: Database,
  payload: BulkCombinedPayload,
  userId: number | undefined
): Promise<BulkCombinedResult> {
  const { studyShortCode, atomicMode, subjects } = payload
  const results: OneSubjectResult[] = []
  const errors: Array<{ index: number; error: string }> = []

  if (atomicMode === 'per_subject') {
    for (let i = 0; i < subjects.length; i++) {
      try {
        const one = await runOneSubjectWithSpecimens(
          database,
          { studyShortCode, subjectName: subjects[i].subjectName, specimens: subjects[i].specimens },
          userId
        )
        results.push(one)
      } catch (err) {
        errors.push({
          index: i,
          error: `Subject '${subjects[i].subjectName}': ${err instanceof Error ? err.message : 'failed to create subject with specimens'}`,
        })
      }
    }
    const summary = results.reduce(
      (acc, r) => ({
        subjectsCreated: acc.subjectsCreated + r.summary.subjectsCreated,
        subjectsUpdated: acc.subjectsUpdated + r.summary.subjectsUpdated,
        specimensCreated: acc.specimensCreated + r.summary.specimensCreated,
        containersCreated: acc.containersCreated + r.summary.containersCreated,
      }),
      { subjectsCreated: 0, subjectsUpdated: 0, specimensCreated: 0, containersCreated: 0 }
    )
    return { summary, results, errors: errors.length > 0 ? errors : undefined }
  }

  // full_file: one transaction for all subjects
  const allPrepared: PreparedSubject[] = []
  const mergedCollectionMap = new Map<string, number>()
  for (let i = 0; i < subjects.length; i++) {
    const prepared = await prepareSubjectWithSpecimens(
      database,
      studyShortCode,
      subjects[i].subjectName,
      subjects[i].specimens
    )
    for (const [k, v] of prepared.collectionMap) mergedCollectionMap.set(k, v)
    allPrepared.push(prepared)
  }

  const now = utcNow()
  const fullResults = await database.transaction(async (tx) => {
    for (let i = 0; i < allPrepared.length; i++) {
      await revalidatePreparedSubjectInTx(tx, allPrepared[i], i)
    }

    const out: OneSubjectResult[] = []
    for (let i = 0; i < allPrepared.length; i++) {
      const prepared = allPrepared[i]
      const prepWithMergedMap = { ...prepared, collectionMap: mergedCollectionMap }
      try {
        out.push(await createSubjectWithSpecimensInTx(tx, prepWithMergedMap, userId, now))
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : 'Failed to create subject with specimens'
        throw new ValidationError(`Subject '${prepared.trimmedName}' (index ${i + 1}) failed: ${message}`)
      }
    }
    return out
  })

  const summary = fullResults.reduce(
    (acc, r) => ({
      subjectsCreated: acc.subjectsCreated + r.summary.subjectsCreated,
      subjectsUpdated: acc.subjectsUpdated + r.summary.subjectsUpdated,
      specimensCreated: acc.specimensCreated + r.summary.specimensCreated,
      containersCreated: acc.containersCreated + r.summary.containersCreated,
    }),
    { subjectsCreated: 0, subjectsUpdated: 0, specimensCreated: 0, containersCreated: 0 }
  )
  return { summary, results: fullResults }
}

/** HTTP response shape for POST /subjects/with-specimens */
export function formatOneSubjectWithSpecimensResponse(result: OneSubjectResult) {
  return {
    subject: result.subject,
    subjectCreated: result.subjectCreated,
    specimens: result.specimens.map((s) => ({
      ...s.specimen,
      containerCreated: s.containerCreated,
      containerId: s.containerId,
    })),
    summary: result.summary,
  }
}
