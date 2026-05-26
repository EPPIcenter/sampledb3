import type { Database } from '../db/client'
import {
  micronixPlate,
  micronixTube,
  cryovialBox,
  cryovialTube,
  box,
  bag,
  paper,
  sheet,
  staticWell,
  location,
} from '../db/schema'
import { eq, inArray } from 'drizzle-orm'

export type ContainerSubtype = 'micronix_tube' | 'cryovial_tube' | 'paper' | 'static_well' | 'unknown'

export type CollectionType = 'micronix_plate' | 'cryovial_box' | 'sheet'

export type ParentCollectionType = 'box' | 'bag'

export type ContainerPlacementCollection = {
  type: CollectionType
  id: number
  name: string
  position?: string | null
}

export type ContainerPlacementLocation = {
  id: number
  name: string
  path: string
}

export type ContainerPlacementParentCollection = {
  type: ParentCollectionType
  id: number
  name: string
}

export type KnownContainerPlacement = {
  containerType: Exclude<ContainerSubtype, 'unknown'>
  collection: ContainerPlacementCollection
  location: ContainerPlacementLocation | null
  parentCollection: ContainerPlacementParentCollection | null
  locationPath?: string
}

export type UnknownContainerPlacement = {
  containerType: 'unknown'
  collection: null
  location: null
  parentCollection: null
  locationPath?: undefined
}

export type ContainerPlacement = KnownContainerPlacement | UnknownContainerPlacement

type LocationPathInput = {
  path?: string | null
  locationPath?: string | null
  name?: string | null
  locationName?: string | null
} | null | undefined

/** Format a location path with optional parent collection name (box, bag, plate). */
export function formatLocationPath(loc: LocationPathInput, parentName?: string): string | undefined {
  if (!loc) return parentName || undefined
  const path = loc.path ?? loc.locationPath
  const name = loc.name ?? loc.locationName
  if (path) {
    return parentName ? `${path} → ${parentName}` : path
  }
  if (name) {
    return parentName ? `${name} → ${parentName}` : name
  }
  return parentName || undefined
}

export const UNKNOWN_CONTAINER_PLACEMENT: UnknownContainerPlacement = {
  containerType: 'unknown',
  collection: null,
  location: null,
  parentCollection: null,
}

function toLocationFields(row: {
  locationId?: number | null
  locationPath?: string | null
  locationName?: string | null
}): ContainerPlacementLocation | null {
  if (!row.locationId) return null
  const name = row.locationName ?? ''
  const path = row.locationPath ?? name
  return { id: row.locationId, name, path }
}

function isUnknownPlacement(placement: ContainerPlacement): placement is UnknownContainerPlacement {
  return placement.containerType === 'unknown'
}

function setPlacementIfUnset(map: Map<number, ContainerPlacement>, id: number, placement: KnownContainerPlacement) {
  const current = map.get(id)
  if (current && !isUnknownPlacement(current)) return
  map.set(id, placement)
}

/** Resolve container type, collection, position, and location for storage container ids. */
export async function resolveContainerPlacements(
  database: Database,
  containerIds: number[],
): Promise<Map<number, ContainerPlacement>> {
  const placementMap = new Map<number, ContainerPlacement>()
  if (containerIds.length === 0) {
    return placementMap
  }

  for (const id of containerIds) {
    placementMap.set(id, { ...UNKNOWN_CONTAINER_PLACEMENT })
  }

  const [micronixTubesList, cryovialTubesList, papersList, staticWellsList] = await Promise.all([
    database
      .select({
        id: micronixTube.id,
        collectionId: micronixTube.collectionId,
        position: micronixTube.position,
        collectionName: micronixPlate.name,
        locationPath: location.path,
        locationName: location.name,
        locationId: location.id,
      })
      .from(micronixTube)
      .leftJoin(micronixPlate, eq(micronixTube.collectionId, micronixPlate.id))
      .leftJoin(location, eq(micronixPlate.locationId, location.id))
      .where(inArray(micronixTube.id, containerIds)),
    database
      .select({
        id: cryovialTube.id,
        collectionId: cryovialTube.collectionId,
        position: cryovialTube.position,
        collectionName: cryovialBox.name,
        locationPath: location.path,
        locationName: location.name,
        locationId: location.id,
      })
      .from(cryovialTube)
      .leftJoin(cryovialBox, eq(cryovialTube.collectionId, cryovialBox.id))
      .leftJoin(location, eq(cryovialBox.locationId, location.id))
      .where(inArray(cryovialTube.id, containerIds)),
    database
      .select({
        id: paper.id,
        sheetId: paper.sheetId,
        position: paper.position,
        collectionName: sheet.name,
        boxId: sheet.boxId,
        bagId: sheet.bagId,
      })
      .from(paper)
      .leftJoin(sheet, eq(paper.sheetId, sheet.id))
      .where(inArray(paper.id, containerIds)),
    database
      .select({
        id: staticWell.id,
        collectionId: staticWell.collectionId,
        position: staticWell.position,
        collectionName: micronixPlate.name,
        locationPath: location.path,
        locationName: location.name,
        locationId: location.id,
      })
      .from(staticWell)
      .leftJoin(micronixPlate, eq(staticWell.collectionId, micronixPlate.id))
      .leftJoin(location, eq(micronixPlate.locationId, location.id))
      .where(inArray(staticWell.id, containerIds)),
  ])

  for (const tube of micronixTubesList) {
    const locationPath = formatLocationPath(tube)
    setPlacementIfUnset(placementMap, tube.id, {
      containerType: 'micronix_tube',
      collection: {
        type: 'micronix_plate',
        id: tube.collectionId,
        name: tube.collectionName || 'Unknown',
        position: tube.position ?? null,
      },
      location: toLocationFields(tube),
      parentCollection: null,
      locationPath,
    })
  }

  for (const tube of cryovialTubesList) {
    const locationPath = formatLocationPath(tube)
    setPlacementIfUnset(placementMap, tube.id, {
      containerType: 'cryovial_tube',
      collection: {
        type: 'cryovial_box',
        id: tube.collectionId,
        name: tube.collectionName || 'Unknown',
        position: tube.position ?? null,
      },
      location: toLocationFields(tube),
      parentCollection: null,
      locationPath,
    })
  }

  const boxIds = [...new Set(papersList.map((p) => p.boxId).filter((id): id is number => id != null))]
  const bagIds = [...new Set(papersList.map((p) => p.bagId).filter((id): id is number => id != null))]

  const [boxesWithLocation, bagsWithLocation] = await Promise.all([
    boxIds.length > 0
      ? database
          .select({
            boxId: box.id,
            boxName: box.name,
            locationPath: location.path,
            locationName: location.name,
            locationId: location.id,
          })
          .from(box)
          .leftJoin(location, eq(box.locationId, location.id))
          .where(inArray(box.id, boxIds))
      : [],
    bagIds.length > 0
      ? database
          .select({
            bagId: bag.id,
            bagName: bag.name,
            locationPath: location.path,
            locationName: location.name,
            locationId: location.id,
          })
          .from(bag)
          .leftJoin(location, eq(bag.locationId, location.id))
          .where(inArray(bag.id, bagIds))
      : [],
  ])

  const boxLocationById = new Map(boxesWithLocation.map((row) => [row.boxId, row]))
  const bagLocationById = new Map(bagsWithLocation.map((row) => [row.bagId, row]))

  for (const p of papersList) {
    let locationPath: string | undefined
    let locationFields: ContainerPlacementLocation | null = null
    let parentCollection: ContainerPlacementParentCollection | null = null

    if (p.boxId) {
      const parent = boxLocationById.get(p.boxId)
      if (parent) {
        locationPath = formatLocationPath(parent, parent.boxName)
        locationFields = toLocationFields(parent)
        parentCollection = { type: 'box', id: p.boxId, name: parent.boxName }
      }
    } else if (p.bagId) {
      const parent = bagLocationById.get(p.bagId)
      if (parent) {
        locationPath = formatLocationPath(parent, parent.bagName)
        locationFields = toLocationFields(parent)
        parentCollection = { type: 'bag', id: p.bagId, name: parent.bagName }
      }
    }

    setPlacementIfUnset(placementMap, p.id, {
      containerType: 'paper',
      collection: {
        type: 'sheet',
        id: p.sheetId,
        name: p.collectionName || 'Unknown',
        position: p.position ?? null,
      },
      location: locationFields,
      parentCollection,
      locationPath,
    })
  }

  for (const well of staticWellsList) {
    const locationPath = formatLocationPath(well)
    setPlacementIfUnset(placementMap, well.id, {
      containerType: 'static_well',
      collection: {
        type: 'micronix_plate',
        id: well.collectionId,
        name: well.collectionName || 'Unknown',
        position: well.position ?? null,
      },
      location: toLocationFields(well),
      parentCollection: null,
      locationPath,
    })
  }

  return placementMap
}

const PLACEMENT_BATCH_SIZE = 500

/** Container subtype lookup derived from resolveContainerPlacements (chunked for SQLite limits). */
export async function resolveContainerTypes(
  database: Database,
  containerIds: number[],
): Promise<Map<number, ContainerSubtype>> {
  const typeMap = new Map<number, ContainerSubtype>()
  if (containerIds.length === 0) {
    return typeMap
  }

  for (let i = 0; i < containerIds.length; i += PLACEMENT_BATCH_SIZE) {
    const chunk = containerIds.slice(i, i + PLACEMENT_BATCH_SIZE)
    const placements = await resolveContainerPlacements(database, chunk)
    for (const [id, placement] of placements) {
      typeMap.set(id, placement.containerType)
    }
  }

  return typeMap
}
