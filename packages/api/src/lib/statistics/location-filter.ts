import type { Database } from '../../db/client'
import type { Database as SQLiteDatabase } from 'bun:sqlite'
import {
  location,
  micronixPlate,
  micronixTube,
  staticWell,
  cryovialBox,
  cryovialTube,
  box,
  bag,
  sheet,
  paper,
} from '../../db/schema'
import { eq, inArray, or } from 'drizzle-orm'

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

/**
 * Resolve storage container ids stored in the given locations: tubes and static wells on
 * micronix plates, tubes in cryovial boxes, and papers on sheets in boxes or bags.
 * Collections are matched with subqueries so large locations never build huge IN lists.
 */
export async function resolveContainerIdsAtLocations(
  database: Database,
  filteredLocationIds: number[],
  tagFilteredContainerIds?: number[] | null,
): Promise<number[]> {
  const platesHere = database
    .select({ id: micronixPlate.id })
    .from(micronixPlate)
    .where(inArray(micronixPlate.locationId, filteredLocationIds))
  const cryovialBoxesHere = database
    .select({ id: cryovialBox.id })
    .from(cryovialBox)
    .where(inArray(cryovialBox.locationId, filteredLocationIds))
  const sheetsHere = database
    .select({ id: sheet.id })
    .from(sheet)
    .where(
      or(
        inArray(sheet.boxId, database.select({ id: box.id }).from(box).where(inArray(box.locationId, filteredLocationIds))),
        inArray(sheet.bagId, database.select({ id: bag.id }).from(bag).where(inArray(bag.locationId, filteredLocationIds))),
      ),
    )

  const [micronix, wells, cryovial, papers] = await Promise.all([
    database.select({ id: micronixTube.id }).from(micronixTube).where(inArray(micronixTube.collectionId, platesHere)),
    database.select({ id: staticWell.id }).from(staticWell).where(inArray(staticWell.collectionId, platesHere)),
    database.select({ id: cryovialTube.id }).from(cryovialTube).where(inArray(cryovialTube.collectionId, cryovialBoxesHere)),
    database.select({ id: paper.id }).from(paper).where(inArray(paper.sheetId, sheetsHere)),
  ])

  const ids = new Set([...micronix, ...wells, ...cryovial, ...papers].map((r) => r.id))
  if (tagFilteredContainerIds) {
    const tagged = new Set(tagFilteredContainerIds)
    return [...ids].filter((id) => tagged.has(id))
  }
  return [...ids]
}
