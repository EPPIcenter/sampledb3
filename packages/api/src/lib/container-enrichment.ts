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

export type ContainerPlacementInfo = {
  type: string
  collectionName: string
  position?: string
  id: number
  locationPath?: string
  locationId?: number
  locationName?: string
}

export type StorageContainerSummaryRow = {
  id: number
  specimenId: number
  comment?: string | null
  totalQuantity?: number | null
  remainingQuantity?: number | null
  unitSymbol?: string | null
}

export type SpecimenSummaryInput = {
  id: number
  specimenTypeId: number
  collectionDate: string | null
  created: string
  lastUpdated: string
}

export type EnrichedContainerDetail = {
  id: number
  type: string
  remainingQuantity: number
  unit: string
  comment?: string
  collectionName: string
  position?: string
  collectionId?: number
  locationPath?: string
}

export type EnrichedSpecimenSummary = {
  id: number
  specimenTypeId: number
  specimenTypeName: string
  collectionDate: string | null
  created: string
  lastUpdated: string
  containerCount: number
  containerBreakdown: Record<string, number>
  unitBreakdown: Record<string, number>
  containers: EnrichedContainerDetail[]
}

export type InventoryBreakdownEntry = {
  type: string
  unit: string
  totalQuantity: number
  remainingQuantity: number
  containerCount: number
  collections: string[]
  locationPaths: string[]
}

export type SpecimenTimelineEntry = {
  id: number
  date: string
  specimenTypeName: string
  specimenTypeId: number
}

export type SpecimenCollectionSummary = {
  totalSpecimens: number
  totalContainers: number
  totalRemainingQuantity?: number
  inventory?: InventoryBreakdownEntry[]
  specimenTypes: Array<{ name: string; count: number }>
  containerTypes: Record<string, number>
  collectionDateRange: { earliest: string; latest: string } | null
  timeline: SpecimenTimelineEntry[]
}

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

/** Resolve container type, collection, position, and location for storage container ids. */
export async function buildContainerInfoMap(
  database: Database,
  containerIds: number[],
): Promise<Map<number, ContainerPlacementInfo>> {
  const containerInfoMap = new Map<number, ContainerPlacementInfo>()
  if (containerIds.length === 0) {
    return containerInfoMap
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

  for (const t of micronixTubesList) {
    containerInfoMap.set(t.id, {
      type: 'micronix_tube',
      collectionName: t.collectionName || 'Unknown',
      position: t.position || undefined,
      id: t.collectionId,
      locationPath: formatLocationPath(t),
      locationId: t.locationId ?? undefined,
      locationName: t.locationName ?? undefined,
    })
  }

  for (const t of cryovialTubesList) {
    containerInfoMap.set(t.id, {
      type: 'cryovial_tube',
      collectionName: t.collectionName || 'Unknown',
      position: t.position || undefined,
      id: t.collectionId,
      locationPath: formatLocationPath(t),
      locationId: t.locationId ?? undefined,
      locationName: t.locationName ?? undefined,
    })
  }

  for (const t of papersList) {
    let locPath: string | undefined
    let locationId: number | undefined
    let locationName: string | undefined
    if (t.boxId) {
      const res = await database
        .select({
          box: box,
          locationPath: location.path,
          locationName: location.name,
          locationId: location.id,
        })
        .from(box)
        .leftJoin(location, eq(box.locationId, location.id))
        .where(eq(box.id, t.boxId))
        .get()
      locPath = formatLocationPath(res, res?.box.name)
      locationId = res?.locationId ?? undefined
      locationName = res?.locationName ?? undefined
    } else if (t.bagId) {
      const res = await database
        .select({
          bag: bag,
          locationPath: location.path,
          locationName: location.name,
          locationId: location.id,
        })
        .from(bag)
        .leftJoin(location, eq(bag.locationId, location.id))
        .where(eq(bag.id, t.bagId))
        .get()
      locPath = formatLocationPath(res, res?.bag.name)
      locationId = res?.locationId ?? undefined
      locationName = res?.locationName ?? undefined
    }
    containerInfoMap.set(t.id, {
      type: 'paper',
      collectionName: t.collectionName || 'Unknown',
      position: t.position || undefined,
      id: t.sheetId,
      locationPath: locPath,
      locationId,
      locationName,
    })
  }

  for (const t of staticWellsList) {
    containerInfoMap.set(t.id, {
      type: 'static_well',
      collectionName: t.collectionName || 'Unknown',
      position: t.position || undefined,
      id: t.collectionId,
      locationPath: formatLocationPath(t),
      locationId: t.locationId ?? undefined,
      locationName: t.locationName ?? undefined,
    })
  }

  return containerInfoMap
}

function defaultPlacementInfo(): ContainerPlacementInfo {
  return { type: 'unknown', collectionName: 'Unknown', id: 0, position: undefined, locationPath: undefined }
}

/** Build per-specimen container breakdown from storage rows and placement info. */
export function enrichSpecimensWithContainers(
  specimens: SpecimenSummaryInput[],
  containers: StorageContainerSummaryRow[],
  containerInfoMap: Map<number, ContainerPlacementInfo>,
  specimenTypeMap: Map<number, string>,
  options?: { includeComment?: boolean; defaultUnit?: string },
): EnrichedSpecimenSummary[] {
  const defaultUnit = options?.defaultUnit ?? 'Unknown'
  const includeComment = options?.includeComment ?? false

  const containersBySpecimen = new Map<number, StorageContainerSummaryRow[]>()
  for (const container of containers) {
    const list = containersBySpecimen.get(container.specimenId) ?? []
    list.push(container)
    containersBySpecimen.set(container.specimenId, list)
  }

  return specimens.map((spec) => {
    const specContainers = containersBySpecimen.get(spec.id) ?? []
    const containerBreakdown: Record<string, number> = {}
    const unitBreakdown: Record<string, number> = {}
    const containersDetailed: EnrichedContainerDetail[] = []

    for (const c of specContainers) {
      const info = containerInfoMap.get(c.id) ?? defaultPlacementInfo()
      containerBreakdown[info.type] = (containerBreakdown[info.type] || 0) + 1
      const unit = (c.unitSymbol as string | null) ?? defaultUnit
      unitBreakdown[unit] = (unitBreakdown[unit] || 0) + (c.remainingQuantity ?? 0)
      const detail: EnrichedContainerDetail = {
        id: c.id,
        type: info.type,
        remainingQuantity: c.remainingQuantity ?? 0,
        unit,
        collectionName: info.collectionName,
        position: info.position,
        collectionId: info.id,
        locationPath: info.locationPath,
      }
      if (includeComment) {
        detail.comment = c.comment ?? undefined
      }
      containersDetailed.push(detail)
    }

    return {
      id: spec.id,
      specimenTypeId: spec.specimenTypeId,
      specimenTypeName: specimenTypeMap.get(spec.specimenTypeId) || 'Unknown',
      collectionDate: spec.collectionDate,
      created: spec.created,
      lastUpdated: spec.lastUpdated,
      containerCount: specContainers.length,
      containerBreakdown,
      unitBreakdown,
      containers: containersDetailed,
    }
  })
}

/** Aggregate inventory by container type and unit. */
export function buildInventoryBreakdown(
  containers: StorageContainerSummaryRow[],
  containerInfoMap: Map<number, ContainerPlacementInfo>,
): InventoryBreakdownEntry[] {
  const inventoryMap = new Map<string, {
    totalQuantity: number
    remainingQuantity: number
    containerCount: number
    collections: Set<string>
    locationPaths: Set<string>
  }>()

  for (const container of containers) {
    const info = containerInfoMap.get(container.id) ?? defaultPlacementInfo()
    const unitSymbol = container.unitSymbol || 'units'
    const key = `${info.type}|${unitSymbol}`
    const current = inventoryMap.get(key) ?? {
      totalQuantity: 0,
      remainingQuantity: 0,
      containerCount: 0,
      collections: new Set<string>(),
      locationPaths: new Set<string>(),
    }
    if (info.collectionName && info.collectionName !== 'Unknown') {
      current.collections.add(info.collectionName)
    }
    if (info.locationPath) {
      current.locationPaths.add(info.locationPath)
    }
    inventoryMap.set(key, {
      totalQuantity: current.totalQuantity + (container.totalQuantity || 0),
      remainingQuantity: current.remainingQuantity + (container.remainingQuantity || 0),
      containerCount: current.containerCount + 1,
      collections: current.collections,
      locationPaths: current.locationPaths,
    })
  }

  return Array.from(inventoryMap.entries()).map(([key, stats]) => {
    const [type, unitSymbol] = key.split('|')
    return {
      type,
      unit: unitSymbol,
      totalQuantity: stats.totalQuantity,
      remainingQuantity: stats.remainingQuantity,
      containerCount: stats.containerCount,
      collections: Array.from(stats.collections),
      locationPaths: Array.from(stats.locationPaths),
    }
  })
}

/** Build summary stats shared by subject and control batch summary endpoints. */
export function buildSpecimenCollectionSummary(
  enrichedSpecimens: EnrichedSpecimenSummary[],
  containers: StorageContainerSummaryRow[],
  containerInfoMap: Map<number, ContainerPlacementInfo>,
  options?: { includeInventory?: boolean },
): SpecimenCollectionSummary {
  const specimenTypeCounts: Record<string, number> = {}
  for (const spec of enrichedSpecimens) {
    specimenTypeCounts[spec.specimenTypeName] = (specimenTypeCounts[spec.specimenTypeName] || 0) + 1
  }

  const containerTypeCounts: Record<string, number> = {}
  for (const container of containers) {
    const info = containerInfoMap.get(container.id) ?? defaultPlacementInfo()
    containerTypeCounts[info.type] = (containerTypeCounts[info.type] || 0) + 1
  }

  const collectionDates = enrichedSpecimens
    .map((s) => s.collectionDate)
    .filter(Boolean)
    .sort() as string[]
  const collectionDateRange = collectionDates.length > 0
    ? { earliest: collectionDates[0], latest: collectionDates[collectionDates.length - 1] }
    : null

  const timeline: SpecimenTimelineEntry[] = enrichedSpecimens
    .map((spec) => ({
      id: spec.id,
      date: spec.collectionDate || spec.created,
      specimenTypeName: spec.specimenTypeName,
      specimenTypeId: spec.specimenTypeId,
    }))
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())

  const summary: SpecimenCollectionSummary = {
    totalSpecimens: enrichedSpecimens.length,
    totalContainers: containers.length,
    specimenTypes: Object.entries(specimenTypeCounts).map(([name, count]) => ({ name, count })),
    containerTypes: containerTypeCounts,
    collectionDateRange,
    timeline,
  }

  if (options?.includeInventory) {
    summary.totalRemainingQuantity = containers.reduce((sum, c) => sum + (c.remainingQuantity || 0), 0)
    summary.inventory = buildInventoryBreakdown(containers, containerInfoMap)
  }

  return summary
}

/** Full pipeline: placement map → enriched specimens → summary block. */
export async function buildSpecimenSummaryData(
  database: Database,
  specimens: SpecimenSummaryInput[],
  containers: StorageContainerSummaryRow[],
  specimenTypeMap: Map<number, string>,
  options?: { includeComment?: boolean; defaultUnit?: string; includeInventory?: boolean },
): Promise<{
  enrichedSpecimens: EnrichedSpecimenSummary[]
  containerInfoMap: Map<number, ContainerPlacementInfo>
  summary: SpecimenCollectionSummary
}> {
  const containerIds = containers.map((c) => c.id)
  const containerInfoMap = await buildContainerInfoMap(database, containerIds)
  const enrichedSpecimens = enrichSpecimensWithContainers(
    specimens,
    containers,
    containerInfoMap,
    specimenTypeMap,
    { includeComment: options?.includeComment, defaultUnit: options?.defaultUnit },
  )
  const summary = buildSpecimenCollectionSummary(
    enrichedSpecimens,
    containers,
    containerInfoMap,
    { includeInventory: options?.includeInventory },
  )
  return { enrichedSpecimens, containerInfoMap, summary }
}

export const emptySpecimenCollectionSummary = (): SpecimenCollectionSummary => ({
  totalSpecimens: 0,
  totalContainers: 0,
  specimenTypes: [],
  containerTypes: {},
  collectionDateRange: null,
  timeline: [],
})
