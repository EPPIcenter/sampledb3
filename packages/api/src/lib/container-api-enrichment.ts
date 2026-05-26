import { eq, inArray } from 'drizzle-orm'
import type { Database } from '../db/client'
import {
  location,
  micronixPlate,
  micronixTube,
  cryovialBox,
  cryovialTube,
  paper,
  sheet,
  staticWell,
  storageContainerTag,
  tag,
  unit,
  type Location,
  type StorageContainer,
  type Unit,
} from '../db/schema'
import { resolveContainerPlacements, type ContainerPlacement } from './container-placement'
import type { CollectionInfo } from '../types/collections'

type MicronixSubtypeRow = {
  barcode: string | null
  position: string | null
  plateId: number | null
  plateName: string | null
  locationId: number | null
}

type CryovialSubtypeRow = {
  barcode: string | null
  position: string | null
  boxId: number | null
  boxName: string | null
  locationId: number | null
}

type PaperSubtypeRow = {
  barcode: string | null
  position: string | null
  sheetId: number | null
  sheetName: string | null
  boxId: number | null
  bagId: number | null
}

type StaticWellSubtypeRow = {
  position: string | null
  plateId: number | null
  plateName: string | null
  locationId: number | null
}

export type EnrichedContainerApi = StorageContainer & {
  containerType: 'micronix_tube' | 'cryovial_tube' | 'paper' | 'static_well' | 'unknown'
  tags: Array<{ id: number; name: string }>
  unit: Unit | undefined
  location: Location | null
  locationPath: string
  collection: CollectionInfo | null
  micronixTube?: MicronixSubtypeRow
  cryovialTube?: CryovialSubtypeRow
  paper?: PaperSubtypeRow
  staticWell?: StaticWellSubtypeRow
}

function collectionInfoFromPlacement(
  placement: ContainerPlacement,
  micronixInfo?: MicronixSubtypeRow,
  cryovialInfo?: CryovialSubtypeRow,
  paperInfo?: PaperSubtypeRow,
  staticWellInfo?: StaticWellSubtypeRow,
): CollectionInfo | null {
  if (placement.containerType === 'unknown' || !placement.collection) {
    return null
  }

  if (placement.containerType === 'micronix_tube' && micronixInfo) {
    return {
      type: 'micronix_plate',
      id: placement.collection.id,
      name: placement.collection.name,
      position: placement.collection.position,
      barcode: micronixInfo.barcode,
    }
  }

  if (placement.containerType === 'cryovial_tube' && cryovialInfo) {
    return {
      type: 'cryovial_box',
      id: placement.collection.id,
      name: placement.collection.name,
      position: placement.collection.position,
      barcode: cryovialInfo.barcode,
    }
  }

  if (placement.containerType === 'paper' && paperInfo) {
    return {
      type: 'sheet',
      id: placement.collection.id,
      name: placement.collection.name,
      position: placement.collection.position,
      barcode: paperInfo.barcode,
    }
  }

  if (placement.containerType === 'static_well' && staticWellInfo) {
    return {
      type: 'micronix_plate',
      id: placement.collection.id,
      name: placement.collection.name,
      position: placement.collection.position,
    }
  }

  return null
}

/** Batch-enrich storage containers for API responses (placement + tags + unit + legacy subtype blobs). */
export async function enrichContainersForApi(
  database: Database,
  containers: StorageContainer[],
): Promise<EnrichedContainerApi[]> {
  if (containers.length === 0) {
    return []
  }

  const ids = containers.map((container) => container.id)
  const unitIds = [...new Set(containers.map((container) => container.unitId))]

  const [placementMap, units, tagRows, micronixRows, cryovialRows, paperRows, staticWellRows] = await Promise.all([
    resolveContainerPlacements(database, ids),
    database.select().from(unit).where(inArray(unit.id, unitIds)),
    database
      .select({ containerId: storageContainerTag.storageContainerId, id: tag.id, name: tag.name })
      .from(tag)
      .innerJoin(storageContainerTag, eq(tag.id, storageContainerTag.tagId))
      .where(inArray(storageContainerTag.storageContainerId, ids)),
    database
      .select({
        id: micronixTube.id,
        barcode: micronixTube.barcode,
        position: micronixTube.position,
        plateId: micronixPlate.id,
        plateName: micronixPlate.name,
        locationId: micronixPlate.locationId,
      })
      .from(micronixTube)
      .leftJoin(micronixPlate, eq(micronixTube.collectionId, micronixPlate.id))
      .where(inArray(micronixTube.id, ids)),
    database
      .select({
        id: cryovialTube.id,
        barcode: cryovialTube.barcode,
        position: cryovialTube.position,
        boxId: cryovialBox.id,
        boxName: cryovialBox.name,
        locationId: cryovialBox.locationId,
      })
      .from(cryovialTube)
      .leftJoin(cryovialBox, eq(cryovialTube.collectionId, cryovialBox.id))
      .where(inArray(cryovialTube.id, ids)),
    database
      .select({
        id: paper.id,
        barcode: paper.barcode,
        position: paper.position,
        sheetId: sheet.id,
        sheetName: sheet.name,
        boxId: sheet.boxId,
        bagId: sheet.bagId,
      })
      .from(paper)
      .leftJoin(sheet, eq(paper.sheetId, sheet.id))
      .where(inArray(paper.id, ids)),
    database
      .select({
        id: staticWell.id,
        position: staticWell.position,
        plateId: micronixPlate.id,
        plateName: micronixPlate.name,
        locationId: micronixPlate.locationId,
      })
      .from(staticWell)
      .leftJoin(micronixPlate, eq(staticWell.collectionId, micronixPlate.id))
      .where(inArray(staticWell.id, ids)),
  ])

  const locationIds = [
    ...new Set(
      [...placementMap.values()]
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

  const micronixById = new Map<number, MicronixSubtypeRow>()
  for (const row of micronixRows) {
    micronixById.set(row.id, {
      barcode: row.barcode,
      position: row.position,
      plateId: row.plateId,
      plateName: row.plateName,
      locationId: row.locationId,
    })
  }

  const cryovialById = new Map<number, CryovialSubtypeRow>()
  for (const row of cryovialRows) {
    cryovialById.set(row.id, {
      barcode: row.barcode,
      position: row.position,
      boxId: row.boxId,
      boxName: row.boxName,
      locationId: row.locationId,
    })
  }

  const paperById = new Map<number, PaperSubtypeRow>()
  for (const row of paperRows) {
    paperById.set(row.id, {
      barcode: row.barcode,
      position: row.position,
      sheetId: row.sheetId,
      sheetName: row.sheetName,
      boxId: row.boxId,
      bagId: row.bagId,
    })
  }

  const staticWellById = new Map<number, StaticWellSubtypeRow>()
  for (const row of staticWellRows) {
    staticWellById.set(row.id, {
      position: row.position,
      plateId: row.plateId,
      plateName: row.plateName,
      locationId: row.locationId,
    })
  }

  return containers.map((container) => {
    const placement = placementMap.get(container.id)!
    const micronixInfo = micronixById.get(container.id)
    const cryovialInfo = cryovialById.get(container.id)
    const paperInfo = paperById.get(container.id)
    const staticWellInfo = staticWellById.get(container.id)
    const locationInfo = placement.location ? locationById.get(placement.location.id) ?? null : null

    return {
      ...container,
      containerType: placement.containerType,
      tags: tagsByContainerId.get(container.id) ?? [],
      unit: unitById.get(container.unitId),
      location: locationInfo,
      locationPath: placement.locationPath ?? '',
      collection: collectionInfoFromPlacement(placement, micronixInfo, cryovialInfo, paperInfo, staticWellInfo),
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
