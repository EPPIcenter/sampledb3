import type { Database } from '../../db/client'
import type { Database as SQLiteDatabase } from 'bun:sqlite'
import {
  location,
  micronixPlate,
  micronixTube,
  cryovialBox,
  cryovialTube,
} from '../../db/schema'
import { eq, inArray } from 'drizzle-orm'

export type StatisticsLocationFilterResult =
  | { kind: 'none' }
  | { kind: 'not_found' }
  | { kind: 'resolved'; filteredLocationIds: number[] }

/** Resolve a location_id filter to the target location and its descendants. */
export async function resolveStatisticsLocationFilter(
  database: Database,
  sqliteDatabase: SQLiteDatabase,
  locationId?: string,
): Promise<StatisticsLocationFilterResult> {
  if (!locationId) {
    return { kind: 'none' }
  }

  const id = parseInt(locationId)
  if (isNaN(id)) {
    return { kind: 'none' }
  }

  const targetLocation = await database.select().from(location).where(eq(location.id, id)).get()
  if (!targetLocation) {
    return { kind: 'not_found' }
  }

  const { getLocationDescendants } = await import('../location-helpers')
  const descendants = await getLocationDescendants(sqliteDatabase, id)

  return {
    kind: 'resolved',
    filteredLocationIds: [id, ...descendants.map((d) => d.id)],
  }
}

/** Resolve storage container ids at micronix plates / cryovial boxes in the given locations. */
export async function resolveContainerIdsAtLocations(
  database: Database,
  filteredLocationIds: number[],
  tagFilteredContainerIds?: number[] | null,
): Promise<number[]> {
  const [matchingPlates, matchingBoxes] = await Promise.all([
    database
      .select({ id: micronixPlate.id })
      .from(micronixPlate)
      .where(inArray(micronixPlate.locationId, filteredLocationIds)),
    database
      .select({ id: cryovialBox.id })
      .from(cryovialBox)
      .where(inArray(cryovialBox.locationId, filteredLocationIds)),
  ])

  const plateIds = matchingPlates.map((p) => p.id)
  const boxIds = matchingBoxes.map((b) => b.id)

  const [micronixContainerIds, cryovialContainerIds] = await Promise.all([
    plateIds.length > 0
      ? database
          .select({ id: micronixTube.id })
          .from(micronixTube)
          .where(inArray(micronixTube.collectionId, plateIds))
      : Promise.resolve([]),
    boxIds.length > 0
      ? database
          .select({ id: cryovialTube.id })
          .from(cryovialTube)
          .where(inArray(cryovialTube.collectionId, boxIds))
      : Promise.resolve([]),
  ])

  let locationFilteredContainerIds = [
    ...new Set([...micronixContainerIds.map((r) => r.id), ...cryovialContainerIds.map((r) => r.id)]),
  ]

  if (tagFilteredContainerIds) {
    locationFilteredContainerIds = locationFilteredContainerIds.filter((id) =>
      tagFilteredContainerIds.includes(id),
    )
  }

  return locationFilteredContainerIds
}
