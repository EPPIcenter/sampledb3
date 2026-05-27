import type { Database } from '../../db/client'
import { location } from '../../db/schema'
import { inArray } from 'drizzle-orm'
import { resolveContainerPlacements } from '../container-placement'
import { chunkArray } from './helpers'

export type StorageStatistics = {
  byLocation: Array<{ location: string; count: number }>
  byRootLocation: Record<string, number>
  _summary: {
    totalContainers: number
    containersWithLocations: number
    containersWithoutLocations: number
  }
}

async function loadLocationMap(database: Database, locationIds: number[]) {
  const byLocation: { location: string; count: number }[] = []
  const byRootLocation: Record<string, number> = {}

  if (locationIds.length === 0) {
    return { byLocation, byRootLocation }
  }

  const locationChunks = chunkArray(locationIds, 500)
  const locationChunkResults = await Promise.all(
    locationChunks.map(async (chunk) => {
      return database.select().from(location).where(inArray(location.id, chunk))
    }),
  )

  const locations = locationChunkResults.flat()
  const locationMap = new Map(locations.map((l) => [l.id, l]))

  const parentIdsToLoad = new Set<number>()
  locations.forEach((loc) => {
    let current: typeof location.$inferSelect | undefined = loc
    while (current.parentId != null) {
      if (!locationMap.has(current.parentId)) {
        parentIdsToLoad.add(current.parentId)
      }
      current = locationMap.get(current.parentId)
      if (!current) break
    }
  })

  if (parentIdsToLoad.size > 0) {
    const parentChunks = chunkArray(Array.from(parentIdsToLoad), 500)
    for (const chunk of parentChunks) {
      const parentLocations = await database
        .select()
        .from(location)
        .where(inArray(location.id, chunk))
      parentLocations.forEach((loc) => {
        locationMap.set(loc.id, loc)
        locations.push(loc)
      })
    }

    let additionalParents = new Set<number>()
    locations.forEach((loc) => {
      if (loc.parentId !== null && !locationMap.has(loc.parentId)) {
        additionalParents.add(loc.parentId)
      }
    })

    while (additionalParents.size > 0) {
      const parentChunks = chunkArray(Array.from(additionalParents), 500)
      additionalParents = new Set<number>()
      for (const chunk of parentChunks) {
        const parentLocations = await database
          .select()
          .from(location)
          .where(inArray(location.id, chunk))
        parentLocations.forEach((loc) => {
          if (!locationMap.has(loc.id)) {
            locationMap.set(loc.id, loc)
            locations.push(loc)
            if (loc.parentId !== null && !locationMap.has(loc.parentId)) {
              additionalParents.add(loc.parentId)
            }
          }
        })
      }
    }
  }

  const getRootLocation = (loc: typeof location.$inferSelect): typeof location.$inferSelect => {
    let current = loc
    while (current.parentId != null) {
      const parent = locationMap.get(current.parentId)
      if (!parent) {
        break
      }
      current = parent
    }
    return current
  }

  const locationCountMap = new Map<string, number>()
  locationIds.forEach((id) => {
    const loc = locationMap.get(id)
    if (loc) {
      const path = loc.path || loc.name || `Location ${loc.id}`
      locationCountMap.set(path, (locationCountMap.get(path) || 0) + 1)
    }
  })

  Array.from(locationCountMap.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 20)
    .forEach(([locationPath, count]) => {
      byLocation.push({ location: locationPath, count })
    })

  locationIds.forEach((id) => {
    const loc = locationMap.get(id)
    if (loc) {
      const rootLoc = getRootLocation(loc)
      const rootName = rootLoc.name || `Location ${rootLoc.id}`
      byRootLocation[rootName] = (byRootLocation[rootName] || 0) + 1
    }
  })

  return { byLocation, byRootLocation }
}

/** Compute storage breakdown and location summary for filtered containers. */
export async function computeStorageStatistics(
  database: Database,
  finalContainerIds: number[],
  containerTotal: number,
): Promise<StorageStatistics> {
  const locationIds: number[] = []

  if (finalContainerIds.length > 0) {
    for (const chunk of chunkArray(finalContainerIds, 500)) {
      const placementMap = await resolveContainerPlacements(database, chunk)
      for (const containerId of chunk) {
        const placement = placementMap.get(containerId)
        if (placement?.location) {
          locationIds.push(placement.location.id)
        }
      }
    }
  }

  const { byLocation, byRootLocation } = await loadLocationMap(database, locationIds)
  const totalContainersWithLocations = Object.values(byRootLocation).reduce(
    (sum, count) => sum + count,
    0,
  )
  const containersWithoutLocations = containerTotal - totalContainersWithLocations

  return {
    byLocation,
    byRootLocation,
    _summary: {
      totalContainers: containerTotal,
      containersWithLocations: totalContainersWithLocations,
      containersWithoutLocations,
    },
  }
}
