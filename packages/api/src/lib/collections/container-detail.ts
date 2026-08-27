import type { Database } from '../../db/client'
import { loadContainerReadViewsByIds, type ContainerReadView } from '../container-read-view'
import type { EnrichedStorageContainer } from './types'

function toEnrichedStorageContainer(view: ContainerReadView): EnrichedStorageContainer {
  const { container, specimen } = view
  return {
    id: container.id,
    specimenId: container.specimenId,
    unit: view.unit ?? null,
    totalQuantity: container.totalQuantity,
    remainingQuantity: container.remainingQuantity,
    comment: container.comment,
    created: container.created,
    lastUpdated: container.lastUpdated,
    specimen: specimen
      ? {
          id: specimen.id,
          studySubjectId: specimen.studySubjectId,
          controlBatchId: specimen.controlBatchId,
          specimenTypeId: specimen.specimenTypeId,
          collectionDate: specimen.collectionDate,
          created: specimen.created,
          lastUpdated: specimen.lastUpdated,
        }
      : null,
    specimenTypeName: specimen?.specimenType?.name ?? null,
    source: view.source,
    tags: view.tags,
  }
}

/**
 * Batch-load storage containers with specimen, unit, and subject/control
 * source context from the Container read view.
 * Containers that do not exist are simply absent from the returned map.
 */
export async function enrichStorageContainers(
  database: Database,
  containerIds: number[],
): Promise<Map<number, EnrichedStorageContainer>> {
  const result = new Map<number, EnrichedStorageContainer>()
  const views = await loadContainerReadViewsByIds(database, containerIds)
  for (const [id, view] of views) {
    result.set(id, toEnrichedStorageContainer(view))
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
