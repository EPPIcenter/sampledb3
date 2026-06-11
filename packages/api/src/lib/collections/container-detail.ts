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
import { resolveSpecimenSources } from '../specimens/provenance'
import type { EnrichedStorageContainer } from './types'

/**
 * Batch-load storage containers with specimen, unit, and subject/control
 * source context. One round of queries regardless of container count.
 * Containers that do not exist are simply absent from the returned map.
 */
export async function enrichStorageContainers(
  database: Database,
  containerIds: number[],
): Promise<Map<number, EnrichedStorageContainer>> {
  const result = new Map<number, EnrichedStorageContainer>()
  if (containerIds.length === 0) return result

  const containers = await database
    .select()
    .from(storageContainer)
    .where(inArray(storageContainer.id, [...new Set(containerIds)]))
  if (containers.length === 0) return result

  const unitIds = [...new Set(containers.map((c) => c.unitId))]
  const specimenIds = [...new Set(containers.map((c) => c.specimenId))]

  const [units, specimens, sourceMap] = await Promise.all([
    database.select().from(unit).where(inArray(unit.id, unitIds)),
    database.select().from(specimen).where(inArray(specimen.id, specimenIds)),
    resolveSpecimenSources(database, specimenIds),
  ])

  const specimenTypeIds = [
    ...new Set(specimens.map((s) => s.specimenTypeId).filter((id): id is number => id != null)),
  ]
  const specimenTypes =
    specimenTypeIds.length > 0
      ? await database
          .select({ id: specimenType.id, name: specimenType.name })
          .from(specimenType)
          .where(inArray(specimenType.id, specimenTypeIds))
      : []

  const unitById = new Map(units.map((u) => [u.id, u]))
  const specimenById = new Map(specimens.map((s) => [s.id, s]))
  const typeNameById = new Map(specimenTypes.map((t) => [t.id, t.name]))

  for (const container of containers) {
    const spec = specimenById.get(container.specimenId) ?? null
    result.set(container.id, {
      id: container.id,
      specimenId: container.specimenId,
      unit: unitById.get(container.unitId) ?? null,
      totalQuantity: container.totalQuantity,
      remainingQuantity: container.remainingQuantity,
      comment: container.comment,
      created: container.created,
      lastUpdated: container.lastUpdated,
      // Project to the wire summary; audit columns stay out of responses (ADR 0005).
      specimen: spec
        ? {
            id: spec.id,
            studySubjectId: spec.studySubjectId,
            controlBatchId: spec.controlBatchId,
            specimenTypeId: spec.specimenTypeId,
            collectionDate: spec.collectionDate,
            created: spec.created,
            lastUpdated: spec.lastUpdated,
          }
        : null,
      specimenTypeName: spec?.specimenTypeId != null ? typeNameById.get(spec.specimenTypeId) ?? null : null,
      source: sourceMap.get(container.specimenId) ?? null,
    })
  }

  return result
}

/** Load a single storage container with specimen, unit, and source context. */
export async function enrichStorageContainer(
  database: Database,
  containerId: number,
): Promise<EnrichedStorageContainer | null> {
  const enriched = await enrichStorageContainers(database, [containerId])
  return enriched.get(containerId) ?? null
}

export async function enrichPaperContainers<T extends { id: number; sublabel: string | null }>(
  database: Database,
  papers: T[],
) {
  const enrichedById = await enrichStorageContainers(database, papers.map((p) => p.id))
  return papers.map((p) => ({
    type: 'paper' as const,
    id: p.id,
    sublabel: p.sublabel,
    container: enrichedById.get(p.id) ?? null,
  }))
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
