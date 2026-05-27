import type { Database } from '../../db/client'
import { specimen, specimenType, study, studySubject } from '../../db/schema'
import { inArray } from 'drizzle-orm'
import { cache, cacheKeys } from '../cache'
import { chunkArray } from './helpers'

export type SpecimenAggregates = {
  total: number
  bySourceType: Record<string, number>
  bySpecimenType: Record<string, number>
  byStudy: Record<string, number>
  collectionTimeline: Array<{ date: string; count: number }>
  creationTimeline: Array<{ date: string; count: number }>
}

type ComputeSpecimenAggregatesOptions = {
  studyCode?: string
  subjectIds: number[]
  useSpecimenTypeCache?: boolean
}

function buildMonthlyTimeline(
  specimens: Array<typeof specimen.$inferSelect>,
  dateField: 'collectionDate' | 'created',
): Array<{ date: string; count: number }> {
  const timeline: Array<{ date: string; count: number }> = []
  const monthMap = new Map<string, number>()

  specimens
    .filter((s) => (dateField === 'collectionDate' ? s.collectionDate : true))
    .forEach((s) => {
      const rawDate = dateField === 'collectionDate' ? s.collectionDate! : s.created
      const date = new Date(rawDate)
      const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
      monthMap.set(monthKey, (monthMap.get(monthKey) || 0) + 1)
    })

  Array.from(monthMap.entries())
    .sort((a, b) => a[0].localeCompare(b[0]))
    .forEach(([date, count]) => {
      timeline.push({ date, count })
    })

  return timeline
}

/** Aggregate specimen counts, breakdowns, and timelines for dashboard statistics. */
export async function computeSpecimenAggregates(
  database: Database,
  specimens: Array<typeof specimen.$inferSelect>,
  options: ComputeSpecimenAggregatesOptions,
): Promise<SpecimenAggregates> {
  const { studyCode, subjectIds, useSpecimenTypeCache = false } = options

  const bySourceType: Record<string, number> = {}
  specimens.forEach((s) => {
    const type = s.studySubjectId ? 'subject' : s.controlBatchId ? 'control' : 'unknown'
    bySourceType[type] = (bySourceType[type] || 0) + 1
  })

  const specimenTypeIds = [...new Set(specimens.map((s) => s.specimenTypeId))]
  let specimenTypes = specimenTypeIds.length > 0 && useSpecimenTypeCache
    ? cache.get<typeof specimenType.$inferSelect[]>(cacheKeys.specimenTypes)
    : null

  if (!specimenTypes && specimenTypeIds.length > 0 && useSpecimenTypeCache) {
    await database.select().from(specimenType).where(inArray(specimenType.id, specimenTypeIds))
    const allSpecimenTypes = await database.select().from(specimenType)
    cache.set(cacheKeys.specimenTypes, allSpecimenTypes, 10 * 60 * 1000)
    specimenTypes = allSpecimenTypes.filter((st) => specimenTypeIds.includes(st.id))
  } else if (!specimenTypes && specimenTypeIds.length > 0) {
    specimenTypes = await database
      .select()
      .from(specimenType)
      .where(inArray(specimenType.id, specimenTypeIds))
  } else if (specimenTypeIds.length > 0 && specimenTypes) {
    specimenTypes = specimenTypes.filter((st) => specimenTypeIds.includes(st.id))
  } else {
    specimenTypes = []
  }

  const specimenTypeMap = new Map(specimenTypes.map((st) => [st.id, st.name]))
  const bySpecimenType: Record<string, number> = {}
  specimens.forEach((s) => {
    const typeName = specimenTypeMap.get(s.specimenTypeId) || 'Unknown'
    bySpecimenType[typeName] = (bySpecimenType[typeName] || 0) + 1
  })

  const byStudy: Record<string, number> = {}
  if (subjectIds.length > 0 || !studyCode) {
    const subjectSpecimens = specimens.filter((s) => s.studySubjectId)
    const uniqueSubjectIds = [...new Set(subjectSpecimens.map((s) => s.studySubjectId!))]

    if (uniqueSubjectIds.length > 0) {
      const subjectChunks = chunkArray(uniqueSubjectIds, 500)
      const allSubjects: Array<{ id: number; studyId: number }> = []

      for (const chunk of subjectChunks) {
        const subjects = await database
          .select({
            id: studySubject.id,
            studyId: studySubject.studyId,
          })
          .from(studySubject)
          .where(inArray(studySubject.id, chunk))
        allSubjects.push(...subjects)
      }

      const studyIds = [...new Set(allSubjects.map((s) => s.studyId))]
      if (studyIds.length > 0) {
        const studies = await database.select().from(study).where(inArray(study.id, studyIds))
        const studyMap = new Map(studies.map((s) => [s.id, s.shortCode]))
        const subjectStudyMap = new Map(allSubjects.map((s) => [s.id, studyMap.get(s.studyId)]))

        subjectSpecimens.forEach((s) => {
          const code = subjectStudyMap.get(s.studySubjectId!)
          if (code) {
            byStudy[code] = (byStudy[code] || 0) + 1
          }
        })
      }
    }
  }

  return {
    total: specimens.length,
    bySourceType,
    bySpecimenType,
    byStudy,
    collectionTimeline: buildMonthlyTimeline(specimens, 'collectionDate'),
    creationTimeline: buildMonthlyTimeline(specimens, 'created'),
  }
}
