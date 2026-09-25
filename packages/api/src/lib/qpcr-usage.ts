import type { Database } from '../db/client'
import { qpcrExperiment, qpcrExperimentWell } from '../db/schema'
import { eq, inArray, or } from 'drizzle-orm'
import { ConflictError } from './error-handler'

const SQLITE_BATCH = 500

/**
 * Refuse a delete when qPCR experiment wells still reference any of these containers or specimens.
 * The wells have no cascade, so deleting would fail on the foreign key. qPCR records are kept;
 * wells holding a sample cannot be cleared, so the user deletes the experiment first.
 */
export async function assertNotUsedInQpcr(
  database: Database,
  refs: { containerIds: number[]; specimenIds: number[] },
  subject: string,
): Promise<void> {
  const experiments = new Map<number, string | null>()
  const batches = Math.max(refs.containerIds.length, refs.specimenIds.length)
  for (let i = 0; i < batches; i += SQLITE_BATCH) {
    const containerBatch = refs.containerIds.slice(i, i + SQLITE_BATCH)
    const specimenBatch = refs.specimenIds.slice(i, i + SQLITE_BATCH)
    const conditions = [
      ...(containerBatch.length > 0 ? [inArray(qpcrExperimentWell.storageContainerId, containerBatch)] : []),
      ...(specimenBatch.length > 0 ? [inArray(qpcrExperimentWell.specimenId, specimenBatch)] : []),
    ]
    if (conditions.length === 0) continue
    const rows = await database
      .selectDistinct({ id: qpcrExperiment.id, name: qpcrExperiment.name })
      .from(qpcrExperimentWell)
      .innerJoin(qpcrExperiment, eq(qpcrExperimentWell.qpcrExperimentId, qpcrExperiment.id))
      .where(or(...conditions))
    for (const row of rows) experiments.set(row.id, row.name)
  }

  if (experiments.size === 0) return

  const list = [...experiments.entries()]
    .map(([id, name]) => (name ? `'${name}' (ID ${id})` : `ID ${id}`))
    .join(', ')
  throw new ConflictError(
    `Cannot delete ${subject}: its samples are used in qPCR experiment${experiments.size === 1 ? '' : 's'} ${list}. Delete ${experiments.size === 1 ? 'that experiment' : 'those experiments'} first.`,
  )
}
