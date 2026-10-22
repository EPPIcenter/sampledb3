import { and, eq, inArray, or, type SQL } from 'drizzle-orm'
import type { SubjectDateFilter } from '@sampledb/contract'
import type { Database } from '../../db/client'
import { micronixTube, specimen, storageContainer, studySubject } from '../../db/schema'
import { shiftCalendarDate } from '../datetime'
import { chunkArray, SQL_IN_CHUNK_SIZE } from '../sql-helpers'
import { dateRangeConditions } from './conditions'
import type { SubjectSelectionEntry } from './types'

/**
 * One bounded query's worth of a selection: the Specimens it covers and, for a barcode list,
 * the Containers. A listed selection runs one scope per chunk, so no IN list grows with the
 * input.
 */
export interface SelectionScope {
  specimens: SQL | undefined
  containers?: SQL
}

/** Exactly the micronix tubes with these barcodes, and their Specimens, whatever their Source. */
export function micronixBarcodeScopes(database: Database, barcodes: readonly string[]): SelectionScope[] {
  const unique = [...new Set(barcodes.filter((barcode) => barcode !== ''))]
  return chunkArray(unique, SQL_IN_CHUNK_SIZE).map((chunk) => {
    const tubes = database.select({ id: micronixTube.id }).from(micronixTube).where(inArray(micronixTube.barcode, chunk))
    const tubeSpecimens = database
      .select({ id: storageContainer.specimenId })
      .from(storageContainer)
      .where(inArray(storageContainer.id, tubes))
    return { specimens: inArray(specimen.id, tubeSpecimens), containers: inArray(storageContainer.id, tubes) }
  })
}

/**
 * The listed Subjects, a chunk at a time. A Subject listed under a Study it isn't in matches
 * nothing. A Subject with its own dates ignores the global collection-date range; one listed
 * undated, on any entry, gets the global range.
 */
export async function subjectListScopes(
  database: Database,
  entries: readonly SubjectSelectionEntry[],
  options: { collectionDate: SQL[]; dateTolerance: number },
): Promise<SelectionScope[]> {
  const datesBySubject = new Map<number, { studyId: number; dates: SubjectDateFilter[] | 'all' }[]>()
  for (const entry of entries) {
    const listed = datesBySubject.get(entry.subjectId) ?? []
    let forStudy = listed.find((item) => item.studyId === entry.studyId)
    if (!forStudy) {
      forStudy = { studyId: entry.studyId, dates: [] }
      listed.push(forStudy)
      datesBySubject.set(entry.subjectId, listed)
    }
    const dateConditions = entry.dates ?? []
    if (dateConditions.length === 0) forStudy.dates = 'all'
    else if (forStudy.dates !== 'all') forStudy.dates.push(...dateConditions)
  }

  const scopes: SelectionScope[] = []
  for (const subjectIds of chunkArray([...datesBySubject.keys()], SQL_IN_CHUNK_SIZE)) {
    const subjects = await database
      .select({ id: studySubject.id, studyId: studySubject.studyId })
      .from(studySubject)
      .where(inArray(studySubject.id, subjectIds))
    const undated: number[] = []
    const dated: SQL[] = []
    for (const subject of subjects) {
      const listed = datesBySubject.get(subject.id)?.find((item) => item.studyId === subject.studyId)
      if (!listed) continue
      const dateConditions =
        listed.dates === 'all'
          ? []
          : listed.dates
              .map((dateFilter) => subjectDateCondition(dateFilter, options.dateTolerance))
              .filter((condition) => condition !== undefined)
      if (dateConditions.length === 0) undated.push(subject.id)
      else dated.push(and(eq(specimen.studySubjectId, subject.id), or(...dateConditions))!)
    }
    if (undated.length > 0) {
      dated.push(and(inArray(specimen.studySubjectId, undated), ...options.collectionDate)!)
    }
    if (dated.length > 0) scopes.push({ specimens: or(...dated) })
  }
  return scopes
}

/** Collection date condition for one per-Subject date: an exact date widened by the tolerance, or a range. */
function subjectDateCondition(dateFilter: SubjectDateFilter, toleranceDays: number): SQL | undefined {
  if ('exact' in dateFilter) {
    const from = shiftCalendarDate(dateFilter.exact, -toleranceDays)
    const to = shiftCalendarDate(dateFilter.exact, toleranceDays)
    if (!from || !to) return eq(specimen.collectionDate, dateFilter.exact)
    return and(...dateRangeConditions(specimen.collectionDate, { from, to }))
  }
  const range = dateRangeConditions(specimen.collectionDate, dateFilter)
  return range.length > 0 ? and(...range) : undefined
}
