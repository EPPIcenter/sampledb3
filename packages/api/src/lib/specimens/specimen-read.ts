import type { Database } from '../../db/client'
import { specimen, storageContainer, studySubject, study, specimenType, controlBatch } from '../../db/schema'
import { eq, and, or, sql, inArray } from 'drizzle-orm'
import { validatePage, validateLimit } from '../constants'
import { findContainersByBarcode } from '../identifier-resolution'
import { collectionDateFilter, timestampFilter } from '../date-filters'
import { dateToUpperBound } from '../sql-helpers'
import { likeContains } from '../sql-like'

export type ListSpecimensQuery = {
  sourceType?: string
  study?: string
  subjectId?: string
  controlBatchId?: string
  specimenTypeId?: string
  collectionDateFrom?: string
  collectionDateTo?: string
  createdFrom?: string
  createdTo?: string
  barcode?: string
  search?: string
  page?: string
  limit?: string
}

export type ListSpecimensResult = {
  specimens: Array<{
    id: number
    studySubjectId: number | null
    controlBatchId: number | null
    specimenTypeId: number
    collectionDate: string | null
    created: string
    specimenType: {
      id: number | null
      name: string | null
    } | null
    studySubject: {
      id: number | null
      name: string | null
    } | null
    study: {
      id: number | null
      shortCode: string | null
    } | null
    controlBatch: {
      id: number | null
      name: string | null
    } | null
  }>
  pagination?: {
    page: number
    limit: number
    total: number
    totalPages: number
  }
}

const emptyBarcodeResult = (): ListSpecimensResult => ({
  specimens: [],
  pagination: { page: 1, limit: 50, total: 0, totalPages: 0 },
})

/** List and filter specimens with optional pagination. */
export async function listSpecimens(database: Database, query: ListSpecimensQuery): Promise<ListSpecimensResult> {
  const {
    sourceType,
    study: studyCode,
    subjectId,
    controlBatchId,
    specimenTypeId,
    collectionDateFrom,
    collectionDateTo,
    createdFrom,
    createdTo,
    barcode,
    search,
    page: pageParam,
    limit: limitParam,
  } = query

  let selectQuery = database
    .select({
      id: specimen.id,
      studySubjectId: specimen.studySubjectId,
      controlBatchId: specimen.controlBatchId,
      specimenTypeId: specimen.specimenTypeId,
      collectionDate: specimen.collectionDate,
      created: specimen.created,
      specimenType: {
        id: specimenType.id,
        name: specimenType.name,
      },
      studySubject: {
        id: studySubject.id,
        name: studySubject.name,
      },
      study: {
        id: study.id,
        shortCode: study.shortCode,
      },
      controlBatch: {
        id: controlBatch.id,
        name: controlBatch.name,
      },
    })
    .from(specimen)
    .leftJoin(specimenType, eq(specimen.specimenTypeId, specimenType.id))
    .leftJoin(studySubject, eq(specimen.studySubjectId, studySubject.id))
    .leftJoin(study, eq(studySubject.studyId, study.id))
    .leftJoin(controlBatch, eq(specimen.controlBatchId, controlBatch.id))

  const conditions = []

  if (sourceType === 'subject') {
    conditions.push(sql`${specimen.studySubjectId} IS NOT NULL`)
  } else if (sourceType === 'control') {
    conditions.push(sql`${specimen.controlBatchId} IS NOT NULL`)
  }

  if (studyCode) {
    conditions.push(eq(study.shortCode, studyCode))
  }

  if (subjectId) {
    const id = parseInt(subjectId)
    if (!isNaN(id)) {
      conditions.push(eq(specimen.studySubjectId, id))
    }
  }

  if (controlBatchId) {
    const id = parseInt(controlBatchId)
    if (!isNaN(id)) {
      conditions.push(eq(specimen.controlBatchId, id))
    }
  }

  if (specimenTypeId) {
    const id = parseInt(specimenTypeId)
    if (!isNaN(id)) {
      conditions.push(eq(specimen.specimenTypeId, id))
    }
  }

  const collectionFrom = collectionDateFilter('collection_date_from', collectionDateFrom)
  const collectionTo = collectionDateFilter('collection_date_to', collectionDateTo)
  const createdFromBound = timestampFilter('created_from', createdFrom)
  const createdToBound = timestampFilter('created_to', createdTo)
  if (collectionFrom) {
    conditions.push(sql`${specimen.collectionDate} >= ${collectionFrom}`)
  }
  if (collectionTo) {
    conditions.push(sql`${specimen.collectionDate} <= ${collectionTo}`)
  }
  if (createdFromBound) {
    conditions.push(sql`${specimen.created} >= ${createdFromBound}`)
  }
  if (createdToBound) {
    conditions.push(dateToUpperBound(specimen.created, createdToBound))
  }

  if (barcode) {
    // Every Specimen with a Container carrying the barcode; cryovial barcodes repeat.
    const containerIds = (await findContainersByBarcode(database, barcode)).map((match) => match.containerId)
    if (containerIds.length === 0) return emptyBarcodeResult()
    conditions.push(
      inArray(
        specimen.id,
        database
          .select({ specimenId: storageContainer.specimenId })
          .from(storageContainer)
          .where(inArray(storageContainer.id, containerIds)),
      ),
    )
  }

  if (search) {
    conditions.push(or(
      likeContains(studySubject.name, search),
      likeContains(controlBatch.name, search),
      likeContains(specimenType.name, search),
    ))
  }

  if (conditions.length > 0) {
    selectQuery = selectQuery.where(and(...conditions) as any) as any
  }

  const returnAll = !pageParam && !limitParam

  const page = pageParam ? validatePage(pageParam) : 1
  let limit: number | undefined
  if (returnAll) {
    limit = undefined
  } else if (limitParam) {
    limit = await validateLimit(database, limitParam)
  } else {
    limit = 50
  }
  const offset = returnAll ? undefined : (page - 1) * limit!

  const countQuery = database
    .select({ count: sql<number>`COUNT(*)` })
    .from(specimen)
    .leftJoin(specimenType, eq(specimen.specimenTypeId, specimenType.id))
    .leftJoin(studySubject, eq(specimen.studySubjectId, studySubject.id))
    .leftJoin(study, eq(studySubject.studyId, study.id))
    .leftJoin(controlBatch, eq(specimen.controlBatchId, controlBatch.id))

  if (conditions.length > 0) {
    countQuery.where(and(...conditions) as any) as any
  }

  let queryWithOrder = selectQuery.orderBy(sql`${specimen.created} DESC`)
  if (!returnAll) {
    queryWithOrder = queryWithOrder.limit(limit!).offset(offset!) as any
  }

  const [specimensList, countResult] = await Promise.all([
    queryWithOrder,
    countQuery,
  ])

  const total = countResult[0]?.count || 0

  return {
    specimens: specimensList,
    pagination: returnAll ? undefined : {
      page,
      limit: limit!,
      total,
      totalPages: Math.ceil(total / limit!),
    },
  }
}
