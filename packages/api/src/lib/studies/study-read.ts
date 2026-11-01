import type { Database } from '../../db/client'
import type { Database as SQLiteDatabase } from 'bun:sqlite'
import { study, studySubject } from '../../db/schema'
import { and, eq, inArray, or, sql } from 'drizzle-orm'
import { SQL_IN_CHUNK_SIZE, dateRangeConditions } from '../sql-helpers'
import { likeContains } from '../sql-like'

export type ListStudiesParams = {
  search?: string
  /** Earliest `created` date (YYYY-MM-DD), inclusive. */
  createdFrom?: string
  /** Latest `created` date (YYYY-MM-DD), inclusive of the whole day. */
  createdTo?: string
  page: number
  limit: number
}

export type ListStudiesResult = {
  studies: (typeof study.$inferSelect)[]
  pagination: {
    page: number
    limit: number
    total: number
    totalPages: number
  }
}

export type StudySummary = {
  studyId: number
  totalSubjects: number
  totalSpecimens: number
  totalContainers: number
  collectionDateRange: { earliest: string; latest: string } | null
}

export type GetStudySummariesResult = {
  summaries: StudySummary[]
}

/** List studies with optional search and pagination. */
export async function listStudies(database: Database, params: ListStudiesParams): Promise<ListStudiesResult> {
  const { search, createdFrom, createdTo, page, limit } = params
  const offset = (page - 1) * limit

  const whereClause = and(
    search ? or(likeContains(study.title, search), likeContains(study.shortCode, search)) : undefined,
    ...dateRangeConditions(study.created, createdFrom, createdTo),
  )

  const [studiesList, countResult] = await Promise.all([
    database.select().from(study).where(whereClause).limit(limit).offset(offset),
    database.select({ count: sql<number>`COUNT(*)`.as('count') }).from(study).where(whereClause),
  ])

  const total = countResult[0]?.count || 0

  return {
    studies: studiesList,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
  }
}

/** Get lightweight batch summaries for multiple studies. */
export async function getStudySummaries(
  database: Database,
  sqliteDatabase: SQLiteDatabase,
  ids: number[],
): Promise<GetStudySummariesResult> {
  if (ids.length === 0) {
    return { summaries: [] }
  }

  const subjects = await database
    .select()
    .from(studySubject)
    .where(inArray(studySubject.studyId, ids))

  const studySubjectMap = new Map<number, number[]>()
  subjects.forEach((s) => {
    if (!studySubjectMap.has(s.studyId)) {
      studySubjectMap.set(s.studyId, [])
    }
    studySubjectMap.get(s.studyId)!.push(s.id)
  })

  const allSubjectIds = subjects.map((s) => s.id)
  const summaries: StudySummary[] = []

  if (allSubjectIds.length === 0) {
    for (const id of ids) {
      summaries.push({
        studyId: id,
        totalSubjects: 0,
        totalSpecimens: 0,
        totalContainers: 0,
        collectionDateRange: null,
      })
    }
    return { summaries }
  }

  const specimens: Array<{
    id: number
    studySubjectId: number
    collectionDate: string | null
  }> = []

  for (let i = 0; i < allSubjectIds.length; i += SQL_IN_CHUNK_SIZE) {
    const batch = allSubjectIds.slice(i, i + SQL_IN_CHUNK_SIZE)
    const placeholders = batch.map(() => '?').join(',')
    const specimensQuery = `
      SELECT 
        s.id,
        s.study_subject_id as studySubjectId,
        s.collection_date as collectionDate
      FROM specimen s
      WHERE s.study_subject_id IN (${placeholders})
    `
    const stmt = sqliteDatabase.prepare(specimensQuery)
    const batchResults = stmt.all(...batch) as Array<{
      id: number
      studySubjectId: number
      collectionDate: string | null
    }>
    specimens.push(...batchResults)
  }

  const subjectToStudyMap = new Map<number, number>()
  subjects.forEach((s) => {
    subjectToStudyMap.set(s.id, s.studyId)
  })

  const studySpecimenMap = new Map<number, Array<{ id: number; collectionDate: string | null }>>()
  specimens.forEach((spec) => {
    const studyId = subjectToStudyMap.get(spec.studySubjectId)
    if (studyId) {
      if (!studySpecimenMap.has(studyId)) {
        studySpecimenMap.set(studyId, [])
      }
      studySpecimenMap.get(studyId)!.push({ id: spec.id, collectionDate: spec.collectionDate })
    }
  })

  const specimenIds = specimens.map((s) => s.id)
  const containerCounts: Record<number, number> = {}
  if (specimenIds.length > 0) {
    const specimenToStudyMap = new Map<number, number>()
    specimens.forEach((spec) => {
      const studyId = subjectToStudyMap.get(spec.studySubjectId)
      if (studyId) {
        specimenToStudyMap.set(spec.id, studyId)
      }
    })

    for (let i = 0; i < specimenIds.length; i += SQL_IN_CHUNK_SIZE) {
      const batch = specimenIds.slice(i, i + SQL_IN_CHUNK_SIZE)
      const containerPlaceholders = batch.map(() => '?').join(',')
      const containersQuery = `
        SELECT specimen_id, COUNT(*) as count
        FROM storage_container
        WHERE specimen_id IN (${containerPlaceholders})
        GROUP BY specimen_id
      `
      const containerStmt = sqliteDatabase.prepare(containersQuery)
      const containerRows = containerStmt.all(...batch) as Array<{ specimen_id: number; count: number }>

      containerRows.forEach((row) => {
        const studyId = specimenToStudyMap.get(row.specimen_id)
        if (studyId) {
          containerCounts[studyId] = (containerCounts[studyId] || 0) + row.count
        }
      })
    }
  }

  for (const id of ids) {
    const subjectIds = studySubjectMap.get(id) || []
    const studySpecimens = studySpecimenMap.get(id) || []
    const totalSpecimens = studySpecimens.length
    const totalContainers = containerCounts[id] || 0

    const collectionDates = (studySpecimens
      .map((s) => s.collectionDate)
      .filter(Boolean) as string[])
      .sort()

    const collectionDateRange = collectionDates.length > 0
      ? {
          earliest: collectionDates[0],
          latest: collectionDates[collectionDates.length - 1],
        }
      : null

    summaries.push({
      studyId: id,
      totalSubjects: subjectIds.length,
      totalSpecimens,
      totalContainers,
      collectionDateRange,
    })
  }

  return { summaries }
}
