import type { Database } from '../db/client'
import { specimen } from '../db/schema'
import type { Specimen } from '../db/schema'
import { eq, and, isNull } from 'drizzle-orm'

/**
 * Find an existing study specimen by (study_subject_id, specimen_type_id, collection_date).
 * Uses null-safe date matching: null/empty collectionDate matches specimen.collectionDate IS NULL.
 * Use from both with-specimens (with tx) and specimens/bulk (with db).
 */
export function findExistingStudySpecimen(
  db: Database,
  studySubjectId: number,
  specimenTypeId: number,
  collectionDate: string | null | undefined
): Specimen | null {
  const dateCondition =
    collectionDate == null || collectionDate === ''
      ? isNull(specimen.collectionDate)
      : eq(specimen.collectionDate, collectionDate)

  const row = db
    .select()
    .from(specimen)
    .where(
      and(
        eq(specimen.studySubjectId, studySubjectId),
        eq(specimen.specimenTypeId, specimenTypeId),
        dateCondition
      )
    )
    .get()

  return row ?? null
}
