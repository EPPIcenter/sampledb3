import type { Database } from '../../db/client'
import {
  location,
  micronixTube,
  micronixPlate,
  cryovialTube,
  cryovialBox,
  paper,
  staticWell,
  box,
  bag,
  sheet,
} from '../../db/schema'
import { eq, inArray } from 'drizzle-orm'
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

/** Compute storage breakdown and location summary for filtered containers. */
export async function computeStorageStatistics(
  database: Database,
  finalContainerIds: number[],
  containerTotal: number,
): Promise<StorageStatistics> {
// Storage Statistics
// Get location IDs from containers via micronix/cryovial plates/boxes, paper via sheets/boxes/bags, and static wells
// Reuse finalContainerIds from above (line 673)

let micronixTubes: Array<{ containerId: number; locationId: number | null }> = []
let cryovialTubes: Array<{ containerId: number; locationId: number | null }> = []
let paperContainers: Array<{ containerId: number; locationId: number | null }> = []
let staticWells: Array<{ containerId: number; locationId: number | null }> = []

if (finalContainerIds.length > 0) {
  // Batch queries to avoid SQLite variable limit
  // Use Promise.all to parallelize all chunks
  const containerChunks = chunkArray(finalContainerIds, 500)

  const storageChunkResults = await Promise.all(
    containerChunks.map(async (chunk, i) => {
      const [micronixBatch, cryovialBatch, paperBoxBatch, paperBagBatch, staticWellBatch] = await Promise.all([
        database.select({ containerId: micronixTube.id, locationId: micronixPlate.locationId })
          .from(micronixTube)
          .leftJoin(micronixPlate, eq(micronixTube.collectionId, micronixPlate.id))
          .where(inArray(micronixTube.id, chunk)),
        database.select({ containerId: cryovialTube.id, locationId: cryovialBox.locationId })
          .from(cryovialTube)
          .leftJoin(cryovialBox, eq(cryovialTube.collectionId, cryovialBox.id))
          .where(inArray(cryovialTube.id, chunk)),
        // Paper containers in boxes: paper -> sheet -> box -> location
        database.select({ containerId: paper.id, locationId: box.locationId })
          .from(paper)
          .leftJoin(sheet, eq(paper.sheetId, sheet.id))
          .leftJoin(box, eq(sheet.boxId, box.id))
          .where(inArray(paper.id, chunk)),
        // Paper containers in bags: paper -> sheet -> bag -> location
        database.select({ containerId: paper.id, locationId: bag.locationId })
          .from(paper)
          .leftJoin(sheet, eq(paper.sheetId, sheet.id))
          .leftJoin(bag, eq(sheet.bagId, bag.id))
          .where(inArray(paper.id, chunk)),
        // Static wells: static_well -> micronix_plate -> location
        database.select({ containerId: staticWell.id, locationId: micronixPlate.locationId })
          .from(staticWell)
          .leftJoin(micronixPlate, eq(staticWell.collectionId, micronixPlate.id))
          .where(inArray(staticWell.id, chunk)),
      ])
      
      // Combine paper results (box and bag), preferring box location if both exist
      const paperMap = new Map<number, number | null>()
      paperBoxBatch.forEach(p => {
        if (p.locationId !== null) {
          paperMap.set(p.containerId, p.locationId)
        }
      })
      paperBagBatch.forEach(p => {
        // Only set if not already set from box (box takes precedence)
        if (!paperMap.has(p.containerId) && p.locationId !== null) {
          paperMap.set(p.containerId, p.locationId)
        }
      })
      const paperBatch = Array.from(paperMap.entries()).map(([containerId, locationId]) => ({
        containerId,
        locationId,
      }))
      return { micronix: micronixBatch, cryovial: cryovialBatch, paper: paperBatch, staticWell: staticWellBatch }
    })
  )
  
  // Flatten results
  storageChunkResults.forEach(result => {
    micronixTubes.push(...result.micronix)
    cryovialTubes.push(...result.cryovial)
    paperContainers.push(...result.paper)
    staticWells.push(...result.staticWell)
  })
}

// Count containers with locations for verification
const containersWithLocations = micronixTubes.filter(t => t.locationId !== null).length +
  cryovialTubes.filter(t => t.locationId !== null).length +
  paperContainers.filter(t => t.locationId !== null).length +
  staticWells.filter(t => t.locationId !== null).length

const locationIds = [
  ...micronixTubes.map(t => t.locationId).filter((id): id is number => id !== null),
  ...cryovialTubes.map(t => t.locationId).filter((id): id is number => id !== null),
  ...paperContainers.map(t => t.locationId).filter((id): id is number => id !== null),
  ...staticWells.map(t => t.locationId).filter((id): id is number => id !== null),
]

const byLocation: { location: string; count: number }[] = []
const byRootLocation: Record<string, number> = {}

if (locationIds.length > 0) {
  // Batch query to avoid SQLite variable limit
  // Use Promise.all to parallelize location queries
  const locationChunks = chunkArray(locationIds, 500)

  const locationChunkResults = await Promise.all(
    locationChunks.map(async (chunk, i) => {
      const locations = await database
        .select()
        .from(location)
        .where(inArray(location.id, chunk))
      return locations
    })
  )
  
  const locations = locationChunkResults.flat()

  const locationMap = new Map(locations.map(l => [l.id, l]))

  // Collect all parent IDs we need to query
  const parentIdsToLoad = new Set<number>()
  locations.forEach(loc => {
    let current: typeof location.$inferSelect | undefined = loc
    while (current.parentId != null) {
      if (!locationMap.has(current.parentId)) {
        parentIdsToLoad.add(current.parentId)
      }
      // Try to get parent from map, or we'll need to query it
      current = locationMap.get(current.parentId)
      if (!current) break
    }
  })

  // Load missing parent locations
  if (parentIdsToLoad.size > 0) {
    const parentChunks = chunkArray(Array.from(parentIdsToLoad), 500)
    for (const chunk of parentChunks) {
      const parentLocations = await database
        .select()
        .from(location)
        .where(inArray(location.id, chunk))
      parentLocations.forEach(loc => {
        locationMap.set(loc.id, loc)
        locations.push(loc)
      })
    }
    
    // Recursively load any additional parents we discovered
    let additionalParents = new Set<number>()
    locations.forEach(loc => {
      if (loc.parentId !== null && !locationMap.has(loc.parentId)) {
        additionalParents.add(loc.parentId)
      }
    })
    
    // Keep loading until we have all ancestors
    while (additionalParents.size > 0) {
      const parentChunks = chunkArray(Array.from(additionalParents), 500)
      additionalParents = new Set<number>()
      for (const chunk of parentChunks) {
        const parentLocations = await database
          .select()
          .from(location)
          .where(inArray(location.id, chunk))
        parentLocations.forEach(loc => {
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

  // Helper function to find root location by walking up parent chain
  const getRootLocation = (loc: typeof location.$inferSelect): typeof location.$inferSelect => {
    let current = loc
    while (current.parentId != null) {
      const parent = locationMap.get(current.parentId)
      if (!parent) {
        // If parent not found, current is as high as we can go
        break
      }
      current = parent
    }
    return current
  }

  // Count by location path
  const locationCountMap = new Map<string, number>()
  locationIds.forEach(id => {
    const loc = locationMap.get(id)
    if (loc) {
      // Use materialized path if available, otherwise build from name
      const path = loc.path || loc.name || `Location ${loc.id}`
      locationCountMap.set(path, (locationCountMap.get(path) || 0) + 1)
    }
  })

  Array.from(locationCountMap.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 20) // Top 20 locations
    .forEach(([location, count]) => {
      byLocation.push({ location, count })
    })

  // Count by root location (root location name)
  let countedByRoot = 0
  locationIds.forEach(id => {
    const loc = locationMap.get(id)
    if (loc) {
      const rootLoc = getRootLocation(loc)
      const rootName = rootLoc.name || `Location ${rootLoc.id}`
      byRootLocation[rootName] = (byRootLocation[rootName] || 0) + 1
      countedByRoot++
    }
  })
}

  const totalContainersWithLocations = Object.values(byRootLocation).reduce((sum, count) => sum + count, 0)
  const containersWithoutLocations = containerTotal - totalContainersWithLocations

  return {
    byLocation,
    byRootLocation,
    _summary: {
      totalContainers: containerTotal,
      containersWithLocations: totalContainersWithLocations,
      containersWithoutLocations: containersWithoutLocations,
    },
  }
}
