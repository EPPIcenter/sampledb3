import { eq, inArray } from 'drizzle-orm'
import type { Database } from '../db/client'
import {
  location,
  storageContainerTag,
  tag,
  unit,
  type Location,
  type StorageContainer,
  type Unit,
} from '../db/schema'
import {
  resolveContainerPlacementBundle,
  type CryovialSubtypeDetails,
  type MicronixSubtypeDetails,
  type PaperSubtypeDetails,
  type StaticWellSubtypeDetails,
} from './container-placement'
import { projectContainerCollection } from './container-projection'
import type { CollectionInfo } from '../types/collections'

export type EnrichedContainerApi = StorageContainer & {
  containerType: 'micronix_tube' | 'cryovial_tube' | 'paper' | 'static_well' | 'unknown'
  tags: Array<{ id: number; name: string }>
  unit: Unit | undefined
  location: Location | null
  locationPath: string
  collection: CollectionInfo | null
  micronixTube?: MicronixSubtypeDetails
  cryovialTube?: CryovialSubtypeDetails
  paper?: PaperSubtypeDetails
  staticWell?: StaticWellSubtypeDetails
}

/** Batch-enrich storage containers for API responses (placement bundle + tags + unit). */
export async function enrichContainersForApi(
  database: Database,
  containers: StorageContainer[],
): Promise<EnrichedContainerApi[]> {
  if (containers.length === 0) {
    return []
  }

  const ids = containers.map((container) => container.id)
  const unitIds = [...new Set(containers.map((container) => container.unitId))]

  const [{ placements, subtypes }, units, tagRows] = await Promise.all([
    resolveContainerPlacementBundle(database, ids),
    database.select().from(unit).where(inArray(unit.id, unitIds)),
    database
      .select({ containerId: storageContainerTag.storageContainerId, id: tag.id, name: tag.name })
      .from(tag)
      .innerJoin(storageContainerTag, eq(tag.id, storageContainerTag.tagId))
      .where(inArray(storageContainerTag.storageContainerId, ids)),
  ])

  const locationIds = [
    ...new Set(
      [...placements.values()]
        .map((placement) => placement.location?.id)
        .filter((id): id is number => id != null),
    ),
  ]

  const locations =
    locationIds.length > 0
      ? await database.select().from(location).where(inArray(location.id, locationIds))
      : []

  const unitById = new Map(units.map((row) => [row.id, row]))
  const locationById = new Map(locations.map((row) => [row.id, row]))
  const tagsByContainerId = new Map<number, Array<{ id: number; name: string }>>()
  for (const row of tagRows) {
    const list = tagsByContainerId.get(row.containerId) ?? []
    list.push({ id: row.id, name: row.name })
    tagsByContainerId.set(row.containerId, list)
  }

  return containers.map((container) => {
    const placement = placements.get(container.id)!
    const micronixInfo = subtypes.micronixById.get(container.id)
    const cryovialInfo = subtypes.cryovialById.get(container.id)
    const paperInfo = subtypes.paperById.get(container.id)
    const staticWellInfo = subtypes.staticWellById.get(container.id)
    const locationInfo = placement.location ? locationById.get(placement.location.id) ?? null : null

    return {
      ...container,
      containerType: placement.containerType,
      tags: tagsByContainerId.get(container.id) ?? [],
      unit: unitById.get(container.unitId),
      location: locationInfo,
      locationPath: placement.locationPath ?? '',
      collection: projectContainerCollection(placement),
      micronixTube: micronixInfo,
      cryovialTube: cryovialInfo,
      paper: paperInfo,
      staticWell: staticWellInfo,
    }
  })
}

export async function enrichContainerForApi(
  database: Database,
  container: StorageContainer,
): Promise<EnrichedContainerApi> {
  const [enriched] = await enrichContainersForApi(database, [container])
  return enriched
}
