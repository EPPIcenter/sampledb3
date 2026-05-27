import type { Database } from '../../db/client'
import { study } from '../../db/schema'
import { like, or } from 'drizzle-orm'
import type { SearchResult } from './types'

/** Search studies by short code or title. */
export async function searchStudies(database: Database, query: string): Promise<SearchResult[]> {
  const studies = await database
    .select()
    .from(study)
    .where(or(like(study.shortCode, `%${query}%`), like(study.title, `%${query}%`))!)
    .limit(10)

  return studies.map((studyRecord) => ({
    type: 'study',
    id: studyRecord.id,
    title: studyRecord.title,
    subtitle: `Code: ${studyRecord.shortCode}`,
    url: `/studies/${studyRecord.id}`,
    data: studyRecord,
  }))
}
