import type { Database } from '../../db/client'
import { studySubject, specimen, storageContainer } from '../../db/schema'
import { eq, and, isNull, sql } from 'drizzle-orm'
import { utcNow } from '../datetime'
import { ValidationError } from '../error-handler'

export interface MergeSubjectsResult {
  specimensTransferred: number
  specimensMerged: number
  containersMerged: number
  totalContainersTransferred: number
  targetSubject: typeof studySubject.$inferSelect
}

export async function validateSubjectsForMerge(
  database: Database,
  targetId: number,
  sourceId: number
): Promise<{
  valid: boolean
  error?: string
  targetSubject?: typeof studySubject.$inferSelect
  sourceSubject?: typeof studySubject.$inferSelect
}> {
  if (targetId === sourceId) {
    return { valid: false, error: 'Cannot merge a subject with itself' }
  }

  const [targetSubject, sourceSubject] = await Promise.all([
    database.select().from(studySubject).where(eq(studySubject.id, targetId)).get(),
    database.select().from(studySubject).where(eq(studySubject.id, sourceId)).get(),
  ])

  if (!targetSubject) {
    return { valid: false, error: 'Target subject not found' }
  }
  if (!sourceSubject) {
    return { valid: false, error: 'Source subject not found' }
  }
  if (targetSubject.studyId !== sourceSubject.studyId) {
    return { valid: false, error: 'Subjects must be in the same study' }
  }

  return { valid: true, targetSubject, sourceSubject }
}

export async function mergeSubjects(
  database: Database,
  targetId: number,
  sourceId: number,
  userId: number | undefined
): Promise<MergeSubjectsResult> {
  const validation = await validateSubjectsForMerge(database, targetId, sourceId)
  if (!validation.valid || !validation.targetSubject || !validation.sourceSubject) {
    throw new ValidationError(validation.error ?? 'Invalid merge')
  }

  const sourceSpecimens = await database
    .select()
    .from(specimen)
    .where(eq(specimen.studySubjectId, sourceId))

  const stats = await database.transaction((tx) => {
    const now = utcNow()
    let specimensTransferred = 0
    let specimensMerged = 0
    let containersMerged = 0
    let totalContainersTransferred = 0

    for (const sourceSpecimen of sourceSpecimens) {
      const matchingSpecimen = tx
        .select()
        .from(specimen)
        .where(
          and(
            eq(specimen.studySubjectId, targetId),
            eq(specimen.specimenTypeId, sourceSpecimen.specimenTypeId),
            sourceSpecimen.collectionDate === null
              ? isNull(specimen.collectionDate)
              : eq(specimen.collectionDate, sourceSpecimen.collectionDate)
          ) as any
        )
        .get()

      if (matchingSpecimen) {
        const containerCountResult = tx
          .select({ count: sql<number>`COUNT(*)`.as('count') })
          .from(storageContainer)
          .where(eq(storageContainer.specimenId, sourceSpecimen.id))
          .get()

        const containerCount = containerCountResult?.count || 0
        containersMerged += containerCount
        totalContainersTransferred += containerCount

        if (containerCount > 0) {
          tx.update(storageContainer)
            .set({ specimenId: matchingSpecimen.id, lastUpdated: now })
            .where(eq(storageContainer.specimenId, sourceSpecimen.id))
            .run()
        }

        tx.delete(specimen).where(eq(specimen.id, sourceSpecimen.id)).run()
        specimensMerged++
      } else {
        const containerCountResult = tx
          .select({ count: sql<number>`COUNT(*)`.as('count') })
          .from(storageContainer)
          .where(eq(storageContainer.specimenId, sourceSpecimen.id))
          .get()

        totalContainersTransferred += containerCountResult?.count || 0

        tx.update(specimen)
          .set({
            studySubjectId: targetId,
            lastUpdated: now,
            updatedBy: userId,
          })
          .where(eq(specimen.id, sourceSpecimen.id))
          .run()

        specimensTransferred++
      }
    }

    tx.update(studySubject)
      .set({ lastUpdated: now, updatedBy: userId })
      .where(eq(studySubject.id, targetId))
      .run()

    tx.delete(studySubject).where(eq(studySubject.id, sourceId)).run()

    return {
      specimensTransferred,
      specimensMerged,
      containersMerged,
      totalContainersTransferred,
    }
  })

  const targetSubject = await database
    .select()
    .from(studySubject)
    .where(eq(studySubject.id, targetId))
    .get()

  if (!targetSubject) {
    throw new Error('Target subject not found after merge')
  }

  return { ...stats, targetSubject }
}
