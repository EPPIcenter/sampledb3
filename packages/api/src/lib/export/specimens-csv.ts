import { eq, and, sql, inArray } from 'drizzle-orm'
import type { Database } from '../../db/client'
import { specimen, specimenType, study, studySubject } from '../../db/schema'
import { formatSimpleCSV, type CSVExportOptions } from '../export/format'

export interface SpecimensCsvFilters {
  studyCode?: string
  sourceType?: 'subject' | 'control'
}

export async function exportSpecimensCsv(
  database: Database,
  filters: SpecimensCsvFilters,
  csvOptions: CSVExportOptions
): Promise<string> {
  let query = database
    .select({
      id: specimen.id,
      studySubjectId: specimen.studySubjectId,
      controlBatchId: specimen.controlBatchId,
      specimenType: specimenType.name,
      collectionDate: specimen.collectionDate,
      created: specimen.created,
    })
    .from(specimen)
    .leftJoin(specimenType, eq(specimen.specimenTypeId, specimenType.id))

  const conditions = []

  if (filters.sourceType === 'subject') {
    conditions.push(sql`${specimen.studySubjectId} IS NOT NULL`)
  } else if (filters.sourceType === 'control') {
    conditions.push(sql`${specimen.controlBatchId} IS NOT NULL`)
  }

  if (filters.studyCode) {
    const studyRecord = await database
      .select()
      .from(study)
      .where(eq(study.shortCode, filters.studyCode))
      .get()

    if (studyRecord) {
      const subjects = await database
        .select({ id: studySubject.id })
        .from(studySubject)
        .where(eq(studySubject.studyId, studyRecord.id))

      const subjectIds = subjects.map((s) => s.id)
      if (subjectIds.length > 0) {
        if (subjectIds.length === 1) {
          conditions.push(eq(specimen.studySubjectId, subjectIds[0]))
        } else {
          conditions.push(inArray(specimen.studySubjectId, subjectIds))
        }
      }
    }
  }

  if (conditions.length > 0) {
    query = query.where(and(...conditions) as any) as any
  }

  const specimens = await query

  const headers = ['id', 'subject_id', 'control_batch_id', 'specimen_type', 'collection_date', 'created']
  const rows = specimens.map((s) => [
    s.id,
    s.studySubjectId || '',
    s.controlBatchId || '',
    s.specimenType || '',
    s.collectionDate || '',
    s.created,
  ])

  return formatSimpleCSV(headers, rows, csvOptions)
}
