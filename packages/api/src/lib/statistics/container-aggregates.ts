import type { Database } from '../../db/client'
import { storageContainer, storageContainerTag, tag } from '../../db/schema'
import { eq, inArray } from 'drizzle-orm'
import type { ContainerSubtype } from '../container-placement'
import { chunkArray } from './helpers'

export type ContainerAggregates = {
  byType: Record<string, number>
  byTags: Record<string, number>
  byStatus: Record<string, number>
}

/** Aggregate container type, tag, and status breakdowns for dashboard statistics. */
export async function computeContainerAggregates(
  database: Database,
  finalContainers: Array<typeof storageContainer.$inferSelect>,
  containerTypeMap: Map<number, ContainerSubtype | undefined>,
): Promise<ContainerAggregates> {
  const byType: Record<string, number> = {}
  finalContainers.forEach((container) => {
    const type = containerTypeMap.get(container.id)
    if (type) {
      byType[type] = (byType[type] || 0) + 1
    }
  })

  const finalContainerIds = finalContainers.map((c) => c.id)
  let containerTags: Array<{ containerId: number; tagId: number; tagName: string }> = []

  if (finalContainerIds.length > 0) {
    const containerIdChunks = chunkArray(finalContainerIds, 500)
    const tagChunkResults = await Promise.all(
      containerIdChunks.map(async (chunk) => {
        return database
          .select({
            containerId: storageContainerTag.storageContainerId,
            tagId: tag.id,
            tagName: tag.name,
          })
          .from(storageContainerTag)
          .innerJoin(tag, eq(storageContainerTag.tagId, tag.id))
          .where(inArray(storageContainerTag.storageContainerId, chunk))
      }),
    )
    containerTags = tagChunkResults.flat()
  }

  const byTags: Record<string, number> = {}
  containerTags.forEach((ct) => {
    byTags[ct.tagName] = (byTags[ct.tagName] || 0) + 1
  })

  const byStatus: Record<string, number> = {}
  finalContainers.forEach((c) => {
    let statusName: string
    if (c.remainingQuantity == null) {
      statusName = 'Unknown'
    } else if (c.remainingQuantity > 0) {
      statusName = 'In Use'
    } else {
      statusName = 'Exhausted'
    }
    byStatus[statusName] = (byStatus[statusName] || 0) + 1
  })

  return { byType, byTags, byStatus }
}
