import type { Database } from '../../db/client'
import {
  storageContainer,
  specimen,
  studySubject,
  study,
  micronixTube,
} from '../../db/schema'
import { eq, and, or, inArray, gte, lte, sql, type SQL } from 'drizzle-orm'
import { resolveContainerIdsWithAllTags } from '../container-tag-filter'
import type { SubjectDateFilter } from '@sampledb/contract'
import type { ExportFilters } from './types'
import { chunkArray, dateToUpperBound, SQL_IN_CHUNK_SIZE } from '../sql-helpers'
import { shiftCalendarDate } from '../datetime'

export async function buildContainerQuery(database: Database, filters: ExportFilters) {
  // First, get the study and its subjects
  const studyRecord = await database
    .select()
    .from(study)
    .where(eq(study.shortCode, filters.study))
    .get()

  if (!studyRecord) {
    throw new Error(`Study with short code '${filters.study}' not found`)
  }

  // A subject list (or per-subject dates) needs the study's subject ids; a whole-study export
  // selects them with a subquery instead of an id list.
  const studySubjectIds = database
    .select({ id: studySubject.id })
    .from(studySubject)
    .where(eq(studySubject.studyId, studyRecord.id))

  const subjectDates =
    filters.subject_dates && Object.keys(filters.subject_dates).length > 0 ? filters.subject_dates : undefined
  const listsSubjects = (filters.subject_ids && filters.subject_ids.length > 0) || subjectDates !== undefined

  let filteredSubjectIds: number[] = []
  if (listsSubjects) {
    filteredSubjectIds = (await studySubjectIds).map((s) => s.id)
    if (filters.subject_ids && filters.subject_ids.length > 0) {
      const requested = new Set(filters.subject_ids)
      filteredSubjectIds = filteredSubjectIds.filter((id) => requested.has(id))
    }
    if (filteredSubjectIds.length === 0) {
      return { containers: [], study: studyRecord, specimens: [] }
    }
  }

  const specimenConditions: SQL[] = [sql`${specimen.studySubjectId} IS NOT NULL`]
  if (filters.specimen_type_ids && filters.specimen_type_ids.length > 0) {
    specimenConditions.push(inArray(specimen.specimenTypeId, filters.specimen_type_ids))
  }
  const globalDateConditions = [
    ...(filters.date_from ? [gte(specimen.collectionDate, filters.date_from)] : []),
    ...(filters.date_to ? [lte(specimen.collectionDate, filters.date_to)] : []),
  ]

  /** Subject (and collection date) condition for one chunk of listed subjects. */
  const subjectChunkCondition = (subjectIds: number[]): SQL | undefined => {
    if (!subjectDates) return and(inArray(specimen.studySubjectId, subjectIds), ...globalDateConditions)
    const tolerance = filters.date_tolerance || 0
    const conditions: SQL[] = []
    const undatedSubjectIds: number[] = []
    for (const subjectId of subjectIds) {
      const entry = subjectDates[subjectId] as SubjectDateFilter | SubjectDateFilter[] | undefined
      const dateConditions = (entry == null ? [] : Array.isArray(entry) ? entry : [entry])
        .map((dateFilter) => subjectDateCondition(dateFilter, tolerance))
        .filter((condition) => condition != null)
      if (dateConditions.length === 0) {
        // Listed without a date: every collection date for this subject.
        undatedSubjectIds.push(subjectId)
        continue
      }
      // Several entries for one subject (one per visit) are alternatives.
      conditions.push(and(eq(specimen.studySubjectId, subjectId), or(...dateConditions))!)
    }
    if (undatedSubjectIds.length > 0) {
      conditions.push(and(inArray(specimen.studySubjectId, undatedSubjectIds), ...globalDateConditions)!)
    }
    return or(...conditions)
  }

  // Listed subjects are queried a chunk at a time, so neither the IN list nor the per-subject
  // OR grows with the upload.
  const subjectConditions = listsSubjects
    ? chunkArray(filteredSubjectIds, SQL_IN_CHUNK_SIZE).map(subjectChunkCondition)
    : [and(inArray(specimen.studySubjectId, studySubjectIds), ...globalDateConditions)]

  const specimens: Array<{
    id: number
    studySubjectId: number | null
    controlBatchId: number | null
    specimenTypeId: number
    collectionDate: string | null
    created: string
  }> = []
  for (const subjectCondition of subjectConditions) {
    specimens.push(
      ...(await database
        .select({
          id: specimen.id,
          studySubjectId: specimen.studySubjectId,
          controlBatchId: specimen.controlBatchId,
          specimenTypeId: specimen.specimenTypeId,
          collectionDate: specimen.collectionDate,
          created: specimen.created,
        })
        .from(specimen)
        .where(and(...specimenConditions, subjectCondition))),
    )
  }

  const specimenIds = specimens.map(s => s.id)
  if (specimenIds.length === 0) {
    return { containers: [], study: studyRecord }
  }

  // Build conditions for container query
  const containerConditions: any[] = []

  if (filters.created_from) {
    containerConditions.push(gte(storageContainer.created, filters.created_from))
  }

  if (filters.created_to) {
    containerConditions.push(dateToUpperBound(storageContainer.created, filters.created_to))
  }

  // Get matching containers, chunking specimen ids to stay under SQLite's parameter limit
  let containers: Array<typeof storageContainer.$inferSelect> = []
  for (const idChunk of chunkArray(specimenIds, SQL_IN_CHUNK_SIZE)) {
    containers.push(
      ...(await database
        .select()
        .from(storageContainer)
        .where(and(inArray(storageContainer.specimenId, idChunk), ...containerConditions) as any)),
    )
  }

  if (filters.tag_ids && filters.tag_ids.length > 0) {
    const matchingIds = new Set(await resolveContainerIdsWithAllTags(database, filters.tag_ids))
    if (matchingIds.size === 0) {
      return { containers: [], study: studyRecord, specimens: [] }
    }
    containers = containers.filter((container) => matchingIds.has(container.id))
  }

  return { containers, study: studyRecord, specimens }
}

/**
 * Resolve micronix barcodes to container IDs
 * Only queries micronix_tube table (barcodes are globally unique)
 */
export async function resolveMicronixBarcodesToContainers(
  database: Database,
  barcodes: string[]
): Promise<Map<string, number>> {
  const uniqueBarcodes = [...new Set(barcodes.filter(b => b && b.trim()))]
  if (uniqueBarcodes.length === 0) return new Map()

  const micronixTubes = await database
    .select({ id: micronixTube.id, barcode: micronixTube.barcode })
    .from(micronixTube)
    .where(inArray(micronixTube.barcode, uniqueBarcodes))

  const result = new Map<string, number>()
  for (const tube of micronixTubes) {
    if (tube.barcode) {
      result.set(tube.barcode, tube.id)
    }
  }

  return result
}

/** Collection date condition for one per-subject filter (exact date +/- tolerance days, or a range). */
function subjectDateCondition(dateFilter: SubjectDateFilter, toleranceDays: number) {
  if ('exact' in dateFilter) {
    const from = shiftCalendarDate(dateFilter.exact, -toleranceDays)
    const to = shiftCalendarDate(dateFilter.exact, toleranceDays)
    if (!from || !to) return eq(specimen.collectionDate, dateFilter.exact)
    return and(
      gte(specimen.collectionDate, from),
      lte(specimen.collectionDate, to),
    )
  }
  const bounds = [
    ...(dateFilter.from ? [gte(specimen.collectionDate, dateFilter.from)] : []),
    ...(dateFilter.to ? [lte(specimen.collectionDate, dateFilter.to)] : []),
  ]
  return bounds.length > 0 ? and(...bounds) : null
}
