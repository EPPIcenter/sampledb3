import type { Database } from '../../db/client'
import { specimen, storageContainer, studySubject, study, specimenType, controlBatch } from '../../db/schema'
import { eq, and, like, or, sql } from 'drizzle-orm'
import { validatePage, validateLimit } from '../constants'
import { resolveContainerByBarcode } from '../identifier-resolution'

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

  if (collectionDateFrom) {
    conditions.push(sql`${specimen.collectionDate} >= ${collectionDateFrom}`)
  }
  if (collectionDateTo) {
    conditions.push(sql`${specimen.collectionDate} <= ${collectionDateTo}`)
  }
  if (createdFrom) {
    conditions.push(sql`${specimen.created} >= ${createdFrom}`)
  }
  if (createdTo) {
    conditions.push(sql`${specimen.created} <= ${createdTo}`)
  }

  if (barcode) {
    const containerId = await resolveContainerByBarcode(database, barcode)
    if (containerId) {
      const container = await database
        .select({ specimenId: storageContainer.specimenId })
        .from(storageContainer)
        .where(eq(storageContainer.id, containerId))
        .get()
      if (container) {
        conditions.push(eq(specimen.id, container.specimenId))
      } else {
        return emptyBarcodeResult()
      }
    } else {
      return emptyBarcodeResult()
    }
  }

  if (search) {
    conditions.push(or(
      like(studySubject.name, `%${search}%`),
      like(controlBatch.name, `%${search}%`),
      like(specimenType.name, `%${search}%`),
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
