import type { Database } from '../../db/client'
import { specimen } from '../../db/schema'
import { eq, sql } from 'drizzle-orm'
import type { SearchResult } from './types'

/** Search specimens by numeric id. */
export async function searchSpecimens(database: Database, query: string): Promise<SearchResult[]> {
  const queryNum = parseInt(query)
  if (isNaN(queryNum)) {
    return []
  }

  const specimens = await database
    .select({
      id: specimen.id,
      studySubjectId: specimen.studySubjectId,
      controlBatchId: specimen.controlBatchId,
      collectionDate: specimen.collectionDate,
      type: sql<string>`'specimen'`.as('type'),
    })
    .from(specimen)
    .where(eq(specimen.id, queryNum))
    .limit(10)

  return specimens.map((spec) => {
    const sourceInfo = spec.studySubjectId
      ? `Subject #${spec.studySubjectId}`
      : spec.controlBatchId
        ? `Control Batch #${spec.controlBatchId}`
        : 'N/A'

    return {
      type: 'specimen',
      id: spec.id,
      title: `Specimen #${spec.id}`,
      subtitle: `Source: ${sourceInfo}`,
      url: `/specimens/${spec.id}`,
      data: spec,
    }
  })
}
