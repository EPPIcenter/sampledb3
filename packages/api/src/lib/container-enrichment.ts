import type { Database } from '../db/client'
import {
  resolveContainerPlacements,
  type ContainerPlacement,
} from './container-placement'

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

function collectionNameFromPlacement(placement: ContainerPlacement): string {
  return placement.collection?.name ?? 'Unknown'
}

/** Build per-specimen container breakdown from storage rows and placement info. */
export function enrichSpecimensWithContainers(
  specimens: SpecimenSummaryInput[],
  containers: StorageContainerSummaryRow[],
  placementMap: Map<number, ContainerPlacement>,
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
      const placement = placementMap.get(c.id)!
      containerBreakdown[placement.containerType] = (containerBreakdown[placement.containerType] || 0) + 1
      const unit = (c.unitSymbol as string | null) ?? defaultUnit
      unitBreakdown[unit] = (unitBreakdown[unit] || 0) + (c.remainingQuantity ?? 0)
      const detail: EnrichedContainerDetail = {
        id: c.id,
        type: placement.containerType,
        remainingQuantity: c.remainingQuantity ?? 0,
        unit,
        collectionName: collectionNameFromPlacement(placement),
        position: placement.collection?.position ?? undefined,
        collectionId: placement.collection?.id,
        locationPath: placement.locationPath,
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
  placementMap: Map<number, ContainerPlacement>,
): InventoryBreakdownEntry[] {
  const inventoryMap = new Map<string, {
    totalQuantity: number
    remainingQuantity: number
    containerCount: number
    collections: Set<string>
    locationPaths: Set<string>
  }>()

  for (const container of containers) {
    const placement = placementMap.get(container.id)!
    const unitSymbol = container.unitSymbol || 'units'
    const key = `${placement.containerType}|${unitSymbol}`
    const current = inventoryMap.get(key) ?? {
      totalQuantity: 0,
      remainingQuantity: 0,
      containerCount: 0,
      collections: new Set<string>(),
      locationPaths: new Set<string>(),
    }
    const collectionName = collectionNameFromPlacement(placement)
    if (collectionName && collectionName !== 'Unknown') {
      current.collections.add(collectionName)
    }
    if (placement.locationPath) {
      current.locationPaths.add(placement.locationPath)
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
  placementMap: Map<number, ContainerPlacement>,
  options?: { includeInventory?: boolean },
): SpecimenCollectionSummary {
  const specimenTypeCounts: Record<string, number> = {}
  for (const spec of enrichedSpecimens) {
    specimenTypeCounts[spec.specimenTypeName] = (specimenTypeCounts[spec.specimenTypeName] || 0) + 1
  }

  const containerTypeCounts: Record<string, number> = {}
  for (const container of containers) {
    const placement = placementMap.get(container.id)!
    containerTypeCounts[placement.containerType] = (containerTypeCounts[placement.containerType] || 0) + 1
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
    summary.inventory = buildInventoryBreakdown(containers, placementMap)
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
  placementMap: Map<number, ContainerPlacement>
  summary: SpecimenCollectionSummary
}> {
  const containerIds = containers.map((c) => c.id)
  const placementMap = await resolveContainerPlacements(database, containerIds)
  const enrichedSpecimens = enrichSpecimensWithContainers(
    specimens,
    containers,
    placementMap,
    specimenTypeMap,
    { includeComment: options?.includeComment, defaultUnit: options?.defaultUnit },
  )
  const summary = buildSpecimenCollectionSummary(
    enrichedSpecimens,
    containers,
    placementMap,
    { includeInventory: options?.includeInventory },
  )
  return { enrichedSpecimens, placementMap, summary }
}

export const emptySpecimenCollectionSummary = (): SpecimenCollectionSummary => ({
  totalSpecimens: 0,
  totalContainers: 0,
  specimenTypes: [],
  containerTypes: {},
  collectionDateRange: null,
  timeline: [],
})

// Re-export placement helpers used by summary callers and legacy imports during migration.
export { formatLocationPath, resolveContainerPlacements, type ContainerPlacement } from './container-placement'
