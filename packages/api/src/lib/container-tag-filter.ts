import { eq } from 'drizzle-orm'
import type { Database } from '../db/client'
import { storageContainerTag } from '../db/schema'

/**
 * Resolve container IDs that have ALL of the given tags (AND semantics).
 * Returns empty array when no containers match.
 */
export async function resolveContainerIdsWithAllTags(
  database: Database,
  tagIds: number[],
): Promise<number[]> {
  if (tagIds.length === 0) return []

  const containerSets: Set<number>[] = []
  for (const tagId of tagIds) {
    const rows = await database
      .select({ containerId: storageContainerTag.storageContainerId })
      .from(storageContainerTag)
      .where(eq(storageContainerTag.tagId, tagId))
    containerSets.push(new Set(rows.map((row) => row.containerId)))
  }

  if (containerSets.length === 0) return []

  let intersection = containerSets[0]
  for (let i = 1; i < containerSets.length; i++) {
    intersection = new Set([...intersection].filter((id) => containerSets[i].has(id)))
  }

  return Array.from(intersection)
}
