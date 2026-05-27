import type { Database } from '../../db/client'
import { study, studySubject } from '../../db/schema'
import { eq, like } from 'drizzle-orm'
import type { SearchResult } from './types'

/** Search subjects by name. */
export async function searchSubjects(database: Database, query: string): Promise<SearchResult[]> {
  const subjects = await database
    .select({
      id: studySubject.id,
      name: studySubject.name,
      studyId: studySubject.studyId,
      studyShortCode: study.shortCode,
    })
    .from(studySubject)
    .leftJoin(study, eq(studySubject.studyId, study.id))
    .where(like(studySubject.name, `%${query}%`))
    .limit(10)

  return subjects.map((subject) => ({
    type: 'subject',
    id: subject.id,
    title: subject.name,
    subtitle: subject.studyShortCode ? `Study: ${subject.studyShortCode}` : '',
    url: `/subjects/${subject.id}`,
    data: subject,
  }))
}
