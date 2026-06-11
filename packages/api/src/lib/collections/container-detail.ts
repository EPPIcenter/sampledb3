import { eq, inArray } from 'drizzle-orm'
import type { Database } from '../../db/client'
import {
  storageContainer,
  specimen,
  specimenType,
  unit,
  storageContainerTag,
  tag,
} from '../../db/schema'
import { resolveSpecimenSource } from '../specimens/provenance'
import type { EnrichedStorageContainer } from './types'

/** Load storage container with specimen, unit, and subject/control source context. */
export async function enrichStorageContainer(
  database: Database,
  containerId: number,
): Promise<EnrichedStorageContainer | null> {
  const container = await database
    .select()
    .from(storageContainer)
    .where(eq(storageContainer.id, containerId))
    .get()

  if (!container) return null

  const [containerUnit, spec] = await Promise.all([
    database.select().from(unit).where(eq(unit.id, container.unitId)).get(),
    database.select().from(specimen).where(eq(specimen.id, container.specimenId)).get(),
  ])

  let specimenTypeName: string | null = null
  if (spec?.specimenTypeId) {
    const st = await database
      .select({ name: specimenType.name })
      .from(specimenType)
      .where(eq(specimenType.id, spec.specimenTypeId))
      .get()
    specimenTypeName = st?.name ?? null
  }

  const source = await resolveSpecimenSource(database, container.specimenId)

  return {
    id: container.id,
    specimenId: container.specimenId,
    unit: containerUnit || null,
    totalQuantity: container.totalQuantity,
    remainingQuantity: container.remainingQuantity,
    comment: container.comment,
    created: container.created,
    lastUpdated: container.lastUpdated,
    specimen: spec || null,
    specimenTypeName,
    source,
  }
}

export async function enrichPaperContainers<T extends { id: number; sublabel: string | null }>(
  database: Database,
  papers: T[],
) {
  return Promise.all(
    papers.map(async (p) => ({
      type: 'paper' as const,
      id: p.id,
      sublabel: p.sublabel,
      container: await enrichStorageContainer(database, p.id),
    })),
  )
}

export type EnrichedStorageContainerWithTags = EnrichedStorageContainer & {
  tags: Array<{ id: number; name: string }>
}

/** Batch-load tags and attach to enriched collection containers. */
export async function attachTagsToEnrichedContainers(
  database: Database,
  containers: Array<EnrichedStorageContainer | null>,
): Promise<Array<EnrichedStorageContainerWithTags | null>> {
  const ids = containers.filter((container): container is EnrichedStorageContainer => container != null).map((c) => c.id)
  const tagsByContainerId = new Map<number, Array<{ id: number; name: string }>>()

  if (ids.length > 0) {
    const tagRows = await database
      .select({
        containerId: storageContainerTag.storageContainerId,
        id: tag.id,
        name: tag.name,
      })
      .from(tag)
      .innerJoin(storageContainerTag, eq(tag.id, storageContainerTag.tagId))
      .where(inArray(storageContainerTag.storageContainerId, ids))

    for (const row of tagRows) {
      const list = tagsByContainerId.get(row.containerId) ?? []
      list.push({ id: row.id, name: row.name })
      tagsByContainerId.set(row.containerId, list)
    }
  }

  return containers.map((container) => {
    if (!container) return null
    return {
      ...container,
      tags: tagsByContainerId.get(container.id) ?? [],
    }
  })
}
