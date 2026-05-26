import type { Database } from '../../db/client'
import {
  controlBatch,
  controlDefinition,
  specimen,
  storageContainer,
  storageContainerTag,
  micronixTube,
  cryovialTube,
  paper,
  staticWell,
} from '../../db/schema'
import { eq, and, inArray } from 'drizzle-orm'
import { NotFoundError } from '../error-handler'

/** Delete a blood control batch and all associated specimens and containers. */
export async function deleteBloodControlBatch(database: Database, batchId: number): Promise<void> {
  const batchWithDefinition = await database
    .select({
      batch: controlBatch,
      definition: controlDefinition,
    })
    .from(controlBatch)
    .leftJoin(controlDefinition, eq(controlBatch.controlDefinitionId, controlDefinition.id))
    .where(and(eq(controlBatch.id, batchId), eq(controlDefinition.controlType, 'blood')))
    .get()

  if (!batchWithDefinition) {
    throw new NotFoundError('Blood control batch', batchId)
  }

  const specimens = await database
    .select({ id: specimen.id })
    .from(specimen)
    .where(eq(specimen.controlBatchId, batchId))

  const specimenIds = specimens.map((s) => s.id)
  let containerIds: number[] = []
  if (specimenIds.length > 0) {
    const containers = await database
      .select({ id: storageContainer.id })
      .from(storageContainer)
      .where(inArray(storageContainer.specimenId, specimenIds))
    containerIds = containers.map((c) => c.id)
  }

  await database.transaction(async (tx) => {
    if (containerIds.length > 0) {
      tx.delete(storageContainerTag)
        .where(inArray(storageContainerTag.storageContainerId, containerIds))
        .run()
      tx.delete(paper).where(inArray(paper.id, containerIds)).run()
      tx.delete(micronixTube).where(inArray(micronixTube.id, containerIds)).run()
      tx.delete(cryovialTube).where(inArray(cryovialTube.id, containerIds)).run()
      tx.delete(staticWell).where(inArray(staticWell.id, containerIds)).run()
      tx.delete(storageContainer).where(inArray(storageContainer.id, containerIds)).run()
    }
    if (specimenIds.length > 0) {
      tx.delete(specimen).where(inArray(specimen.id, specimenIds)).run()
    }
    const deleted = await tx.delete(controlBatch).where(eq(controlBatch.id, batchId)).returning()
    if (deleted.length === 0) {
      throw new NotFoundError('Blood control batch', batchId)
    }
  })
}

/** Delete a single specimen (and its containers) from a control batch. */
export async function deleteSpecimenFromBatch(
  database: Database,
  batchId: number,
  specimenId: number,
): Promise<void> {
  const spec = await database
    .select()
    .from(specimen)
    .where(and(eq(specimen.id, specimenId), eq(specimen.controlBatchId, batchId)))
    .get()

  if (!spec) {
    throw new NotFoundError('Specimen in batch', specimenId)
  }

  await database.transaction((tx) => {
    const containerRows = tx
      .select({ id: storageContainer.id })
      .from(storageContainer)
      .where(eq(storageContainer.specimenId, specimenId))
      .all()
    const containerIds = containerRows.map((r) => r.id)

    if (containerIds.length > 0) {
      for (const cId of containerIds) {
        tx.delete(storageContainerTag).where(eq(storageContainerTag.storageContainerId, cId)).run()
        tx.delete(micronixTube).where(eq(micronixTube.id, cId)).run()
        tx.delete(cryovialTube).where(eq(cryovialTube.id, cId)).run()
        tx.delete(paper).where(eq(paper.id, cId)).run()
        tx.delete(staticWell).where(eq(staticWell.id, cId)).run()
      }
      tx.delete(storageContainer).where(eq(storageContainer.specimenId, specimenId)).run()
    }

    tx.delete(specimen).where(eq(specimen.id, specimenId)).run()
  })
}
