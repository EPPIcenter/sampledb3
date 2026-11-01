import type { Database } from '../../db/client'
import { specimen, storageContainer, studySubject, study, specimenType, controlBatch } from '../../db/schema'
import { eq, and, or, sql, inArray, asc, desc } from 'drizzle-orm'
import { validatePage, validateLimit } from '../constants'
import { ValidationError } from '../error-handler'
import { findContainersByBarcode } from '../identifier-resolution'
import { collectionDateFilter, timestampFilter } from '../date-filters'
import { dateRangeConditions } from '../sql-helpers'
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
  sort?: string
  order?: string
}

/** Columns the Specimens list can sort by, as the `sort` query parameter names them. */
export const SPECIMEN_SORT_COLUMNS = ['created', 'collection_date'] as const
export type SpecimenSortColumn = (typeof SPECIMEN_SORT_COLUMNS)[number]
export type SortOrder = 'asc' | 'desc'

/**
 * The list order from `sort` and `order`. With neither, newest created first; otherwise `sort`
 * defaults to `created` and `order` to `asc`. An unknown column or direction throws a
 * `ValidationError` (400) instead of being ignored.
 */
export function parseSpecimenSort(
  sortParam: string | undefined,
  orderParam: string | undefined,
): { sort: SpecimenSortColumn; order: SortOrder } {
  const sortText = sortParam?.trim() ?? ''
  const orderText = orderParam?.trim().toLowerCase() ?? ''
  if (sortText === '' && orderText === '') return { sort: 'created', order: 'desc' }

  const sort = sortText === '' ? 'created' : sortText
  if (!isSpecimenSortColumn(sort)) {
    throw new ValidationError(`Invalid sort '${sortParam}': use one of ${SPECIMEN_SORT_COLUMNS.join(', ')}.`)
  }
  const order = orderText === '' ? 'asc' : orderText
  if (order !== 'asc' && order !== 'desc') {
    throw new ValidationError(`Invalid order '${orderParam}': use asc or desc.`)
  }
  return { sort, order }
}

function isSpecimenSortColumn(value: string): value is SpecimenSortColumn {
  return (SPECIMEN_SORT_COLUMNS as readonly string[]).includes(value)
}

/**
 * ORDER BY for a sort. Specimens without a collection date come last in either direction,
 * and the id breaks ties so that consecutive pages neither repeat nor skip a row.
 */
function specimenOrderBy(sort: SpecimenSortColumn, order: SortOrder) {
  const direction = order === 'asc' ? asc : desc
  if (sort === 'collection_date') {
    return [sql`${specimen.collectionDate} IS NULL`, direction(specimen.collectionDate), direction(specimen.id)]
  }
  return [direction(specimen.created), direction(specimen.id)]
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
  pagination: {
    page: number
    limit: number
    total: number
    totalPages: number
  }
}

/**
 * List and filter specimens one page at a time. Without `page` or `limit` it returns the
 * first page at the configured default page size, with the total across all pages.
 */
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
    sort: sortParam,
    order: orderParam,
  } = query

  const page = validatePage(pageParam)
  const limit = await validateLimit(database, limitParam)
  const offset = (page - 1) * limit
  const { sort, order } = parseSpecimenSort(sortParam, orderParam)

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
  conditions.push(...dateRangeConditions(specimen.created, createdFromBound, createdToBound))

  if (barcode) {
    // Every Specimen with a Container carrying the barcode; cryovial barcodes repeat.
    const containerIds = (await findContainersByBarcode(database, barcode)).map((match) => match.containerId)
    if (containerIds.length === 0) {
      return { specimens: [], pagination: { page, limit, total: 0, totalPages: 0 } }
    }
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

  const pageQuery = selectQuery
    .orderBy(...specimenOrderBy(sort, order))
    .limit(limit)
    .offset(offset)

  const [specimensList, countResult] = await Promise.all([
    pageQuery,
    countQuery,
  ])

  const total = countResult[0]?.count || 0

  return {
    specimens: specimensList,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
  }
}
