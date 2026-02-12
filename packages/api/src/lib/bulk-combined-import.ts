/**
 * Bulk combined import (subjects + specimens + containers) with configurable atomicity.
 * Used by POST /imports/bulk-combined and shares logic with POST /subjects/with-specimens.
 */
import type { Database } from '../db/client'
import {
  studySubject,
  specimen,
  specimenType,
  storageContainer,
  location,
  micronixPlate,
  micronixTube,
  cryovialBox,
  cryovialTube,
  box,
  bag,
  sheet,
  paper,
  staticWell,
} from '../db/schema'
import { eq, and, sql } from 'drizzle-orm'
import { resolveCollection } from './collection-resolution'
import { findExistingStudySpecimen } from './specimen-helpers'
import {
  validateStudyShortCode,
  validateSubjectName,
  validateCollectionDate,
  validateContainerTypeForSpecimenType,
  validateUnitForContainerType,
} from './validation'
import { getDefaultUnit, getDefaultTotalQuantity, getDefaultRemainingQuantity } from './defaults'
import { resolveSubjectByNameAndStudy, resolveSpecimenTypeByName } from './identifier-resolution'
import { ValidationError } from './error-handler'

export type ContainerType = 'micronix_tube' | 'cryovial_tube' | 'paper' | 'static_well'

export interface ExtendedContainerData {
  containerType: ContainerType
  collectionName?: string
  collectionBarcode?: string
  barcode?: string
  position?: string
  label?: string
  unitId?: number
  totalQuantity?: number
  remainingQuantity?: number
  comment?: string
  collectionLocationId?: number
}

export function normalizePosition(position: string | null | undefined): string | null {
  if (!position || !position.trim()) return null
  const trimmed = position.trim()
  const match = trimmed.match(/^([A-Z]+)(\d+)$/i)
  if (match) {
    const row = match[1].toUpperCase()
    const col = match[2]
    return `${row}${col.padStart(2, '0')}`
  }
  return trimmed
}

const LOCATION_CANNOT_CONTAIN_COLLECTIONS =
  'Location cannot contain collections. Only locations with canContainCollections=true can hold collections.'

function assertLocationCanContainCollections(
  tx: Parameters<Parameters<Database['transaction']>[0]>[0],
  locationId: number
): void {
  const loc = tx.select().from(location).where(eq(location.id, locationId)).get()
  if (!loc) {
    throw new ValidationError('Location not found')
  }
  if (!loc.canContainCollections) {
    throw new ValidationError(LOCATION_CANNOT_CONTAIN_COLLECTIONS)
  }
}

export interface WithSpecimensPayload {
  studyShortCode: string
  subjectName: string
  specimens: Array<{
    specimenTypeName: string
    collectionDate?: string
    container?: ExtendedContainerData
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
    container?: ExtendedContainerData
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

      if (container.containerType === 'cryovial_tube' || container.containerType === 'micronix_tube' || container.containerType === 'static_well') {
        const collectionType = container.containerType === 'cryovial_tube' ? 'cryovial_box' : 'micronix_plate'
        const identifier = container.collectionName || container.collectionBarcode
        if (identifier && !container.collectionLocationId) {
          const collectionId = await resolveCollection(identifier, collectionType, dbTx)
          if (!collectionId) {
            throw new ValidationError(`${specimenLabel}: collection '${identifier}' no longer exists; provide collectionLocationId to create it`)
          }
          prepared.collectionMap.set(`${collectionType}-${identifier}`, collectionId)
        }
      } else if (container.containerType === 'paper' && container.collectionName && !container.collectionLocationId) {
        const boxId = await resolveCollection(container.collectionName, 'box', dbTx)
        if (!boxId) {
          throw new ValidationError(`${specimenLabel}: box '${container.collectionName}' no longer exists; provide collectionLocationId to create it`)
        }
        prepared.collectionMap.set(`box-${container.collectionName}`, boxId)
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
      throw new ValidationError(`Specimen type '${spec.specimenTypeName}' not found`)
    }
    const dateValidation = validateCollectionDate(spec.collectionDate)
    if (!dateValidation.valid) {
      throw new ValidationError(dateValidation.error ?? 'Invalid collection date')
    }
    if (spec.container?.containerType) {
      const containerTypeValidation = await validateContainerTypeForSpecimenType(
        database,
        specimenTypeId,
        spec.container.containerType
      )
      if (!containerTypeValidation.valid) {
        throw new ValidationError(containerTypeValidation.error ?? 'Invalid container type for specimen type')
      }
    }
    resolvedSpecimens.push({
      specimenTypeId,
      collectionDate: spec.collectionDate,
      container: spec.container as ExtendedContainerData | undefined,
    })
  }

  const collectionMap = new Map<string, number>()
  for (const spec of resolvedSpecimens) {
    if (spec.container?.containerType) {
      const container = spec.container
      const containerType = container.containerType
      if (containerType === 'cryovial_tube' || containerType === 'micronix_tube' || containerType === 'static_well') {
        const collectionType = containerType === 'cryovial_tube' ? 'cryovial_box' : 'micronix_plate'
        const identifier = container.collectionName || container.collectionBarcode
        if (identifier) {
          const existingId = await resolveCollection(identifier, collectionType, database)
          if (existingId) collectionMap.set(`${collectionType}-${identifier}`, existingId)
          else if (!container.collectionLocationId) {
            throw new ValidationError(`Collection '${identifier}' not found. Please provide collectionLocationId to create it.`)
          }
        }
      } else if (containerType === 'paper' && container.collectionName) {
        const existingBoxId = await resolveCollection(container.collectionName, 'box', database)
        if (existingBoxId) collectionMap.set(`box-${container.collectionName}`, existingBoxId)
        else if (!container.collectionLocationId) {
          throw new ValidationError(`Box '${container.collectionName}' not found. Please provide collectionLocationId to create it.`)
        }
      }
    }
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

export function createSubjectWithSpecimensInTx(
  tx: Parameters<Parameters<Database['transaction']>[0]>[0],
  prepared: PreparedSubject,
  userId: number | undefined,
  now: string
): OneSubjectResult {
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
    subject = (Array.isArray(newSubjectResult) ? newSubjectResult[0] : newSubjectResult) as typeof studySubject.$inferSelect
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
      const containerType = container.containerType
      const storageContainerResult = tx
        .insert(storageContainer)
        .values({
          specimenId,
          unitId: preparedContainer.unitId,
          totalQuantity: preparedContainer.totalQuantity,
          remainingQuantity: preparedContainer.remainingQuantity,
          comment: container.comment ?? null,
          created: now,
          lastUpdated: now,
        })
        .returning()
        .get()
      const storageContainerRecord = Array.isArray(storageContainerResult) ? storageContainerResult[0] : storageContainerResult
      containerId = storageContainerRecord.id
      containerCreated = true

      if (containerType === 'micronix_tube') {
        const identifier = container.collectionName || container.collectionBarcode!
        const key = `micronix_plate-${identifier}`
        let collectionId: number
        if (collectionMap.has(key)) {
          collectionId = collectionMap.get(key)!
        } else if (container.collectionLocationId) {
          assertLocationCanContainCollections(tx, container.collectionLocationId)
          const newPlateResult = tx
            .insert(micronixPlate)
            .values({
              name: container.collectionName ?? identifier,
              locationId: container.collectionLocationId,
              barcode: container.collectionBarcode ?? null,
              created: now,
              lastUpdated: now,
            })
            .returning()
            .get()
          collectionId = (Array.isArray(newPlateResult) ? newPlateResult[0] : newPlateResult).id
          collectionMap.set(key, collectionId)
        } else throw new ValidationError('Collection not found and no location provided')
        if (container.barcode) {
          const existing = tx.select({ id: micronixTube.id }).from(micronixTube).where(eq(micronixTube.barcode, container.barcode)).get()
          if (existing) throw new Error(`Barcode '${container.barcode}' already exists`)
        }
        tx.insert(micronixTube).values({
          id: containerId,
          collectionId,
          barcode: container.barcode!,
          position: normalizePosition(container.position),
        }).run()
      } else if (containerType === 'cryovial_tube') {
        const identifier = container.collectionName || container.collectionBarcode!
        const key = `cryovial_box-${identifier}`
        let collectionId: number
        if (collectionMap.has(key)) {
          collectionId = collectionMap.get(key)!
        } else if (container.collectionLocationId) {
          assertLocationCanContainCollections(tx, container.collectionLocationId)
          const newBoxResult = tx
            .insert(cryovialBox)
            .values({
              name: container.collectionName ?? identifier,
              locationId: container.collectionLocationId,
              barcode: container.collectionBarcode ?? null,
              created: now,
              lastUpdated: now,
            })
            .returning()
            .get()
          collectionId = (Array.isArray(newBoxResult) ? newBoxResult[0] : newBoxResult).id
          collectionMap.set(key, collectionId)
        } else throw new ValidationError('Collection not found and no location provided')
        if (container.barcode) {
          const existing = tx.select({ id: cryovialTube.id }).from(cryovialTube).where(eq(cryovialTube.barcode, container.barcode)).get()
          if (existing) throw new Error(`Barcode '${container.barcode}' already exists`)
        }
        tx.insert(cryovialTube).values({
          id: containerId,
          collectionId,
          barcode: container.barcode ?? null,
          position: normalizePosition(container.position),
        }).run()
      } else if (containerType === 'paper') {
        const boxName = container.collectionName!
        const key = `box-${boxName}`
        let boxId: number
        if (collectionMap.has(key)) {
          boxId = collectionMap.get(key)!
        } else if (container.collectionLocationId) {
          assertLocationCanContainCollections(tx, container.collectionLocationId)
          const newBoxResult = tx
            .insert(box)
            .values({
              name: boxName,
              locationId: container.collectionLocationId,
              created: now,
              lastUpdated: now,
            })
            .returning()
            .get()
          const newBox = Array.isArray(newBoxResult) ? newBoxResult[0] : newBoxResult
          boxId = newBox.id
          collectionMap.set(key, boxId)
        } else throw new ValidationError('Box not found and no location provided')
        const sheetName = container.label ?? 'Sheet-1'
        const existingSheet = tx
          .select()
          .from(sheet)
          .where(and(eq(sheet.name, sheetName), eq(sheet.boxId, boxId)))
          .get()
        let sheetId: number
        if (existingSheet) {
          sheetId = existingSheet.id
        } else {
          const newSheetResult = tx
            .insert(sheet)
            .values({ name: sheetName, boxId, bagId: null, created: sql`current_timestamp`, lastUpdated: sql`current_timestamp` })
            .returning()
            .get()
          sheetId = (Array.isArray(newSheetResult) ? newSheetResult[0] : newSheetResult).id
        }
        tx.insert(paper).values({
          id: containerId,
          sheetId,
          barcode: container.barcode ?? null,
          position: normalizePosition(container.position),
        }).run()
      } else if (containerType === 'static_well') {
        const identifier = container.collectionName || container.collectionBarcode!
        const key = `micronix_plate-${identifier}`
        let collectionId: number
        if (collectionMap.has(key)) {
          collectionId = collectionMap.get(key)!
        } else if (container.collectionLocationId) {
          assertLocationCanContainCollections(tx, container.collectionLocationId)
          const newPlateResult = tx
            .insert(micronixPlate)
            .values({
              name: container.collectionName ?? identifier,
              locationId: container.collectionLocationId,
              barcode: container.collectionBarcode ?? null,
              created: now,
              lastUpdated: now,
            })
            .returning()
            .get()
          collectionId = (Array.isArray(newPlateResult) ? newPlateResult[0] : newPlateResult).id
          collectionMap.set(key, collectionId)
        } else throw new ValidationError('Collection not found and no location provided')
        tx.insert(staticWell).values({
          id: containerId,
          collectionId,
          position: normalizePosition(container.position),
        }).run()
      }
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
  const now = new Date().toISOString()
  return database.transaction((tx) => {
    return createSubjectWithSpecimensInTx(tx, prepared, userId, now)
  })
}

export interface BulkCombinedPayload {
  studyShortCode: string
  atomicMode: 'full_file' | 'per_subject'
  createCollections?: Array<{
    type: 'box' | 'bag' | 'micronix_plate' | 'cryovial_box'
    name: string
    locationId: number
    barcode?: string
  }>
  subjects: Array<{
    subjectName: string
    specimens: Array<{
      specimenTypeName: string
      collectionDate?: string
      container?: ExtendedContainerData
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
  const { studyShortCode, atomicMode, createCollections = [], subjects } = payload
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

  // full_file: one transaction with optional collection creation
  for (const coll of createCollections) {
    const loc = await database.select().from(location).where(eq(location.id, coll.locationId)).get()
    if (!loc) {
      throw new ValidationError('Location not found')
    }
    if (!loc.canContainCollections) {
      throw new ValidationError(LOCATION_CANNOT_CONTAIN_COLLECTIONS)
    }
  }

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

  const now = new Date().toISOString()
  const fullResults = await database.transaction(async (tx) => {
    for (let i = 0; i < allPrepared.length; i++) {
      await revalidatePreparedSubjectInTx(tx, allPrepared[i], i)
    }

    for (const coll of createCollections) {
      const key = `${coll.type}-${coll.name}`
      if (mergedCollectionMap.has(key)) continue
      if (coll.type === 'box') {
        const r = tx.insert(box).values({
          name: coll.name,
          locationId: coll.locationId,
          created: now,
          lastUpdated: now,
        }).returning().get()
        mergedCollectionMap.set(key, (Array.isArray(r) ? r[0] : r).id)
      } else if (coll.type === 'bag') {
        const r = tx.insert(bag).values({
          name: coll.name,
          locationId: coll.locationId,
          created: now,
          lastUpdated: now,
        }).returning().get()
        mergedCollectionMap.set(key, (Array.isArray(r) ? r[0] : r).id)
      } else if (coll.type === 'micronix_plate') {
        const r = tx.insert(micronixPlate).values({
          name: coll.name,
          locationId: coll.locationId,
          barcode: coll.barcode ?? null,
          created: now,
          lastUpdated: now,
        }).returning().get()
        mergedCollectionMap.set(key, (Array.isArray(r) ? r[0] : r).id)
      } else {
        const r = tx.insert(cryovialBox).values({
          name: coll.name,
          locationId: coll.locationId,
          barcode: coll.barcode ?? null,
          created: now,
          lastUpdated: now,
        }).returning().get()
        mergedCollectionMap.set(key, (Array.isArray(r) ? r[0] : r).id)
      }
    }
    const out: OneSubjectResult[] = []
    for (let i = 0; i < allPrepared.length; i++) {
      const prepared = allPrepared[i]
      const prepWithMergedMap = { ...prepared, collectionMap: mergedCollectionMap }
      try {
        out.push(createSubjectWithSpecimensInTx(tx, prepWithMergedMap, userId, now))
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
