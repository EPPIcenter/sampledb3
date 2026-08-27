import { eq, inArray } from 'drizzle-orm'
import type { SpecimenSummaryWire } from '@sampledb/contract/wire'
import type { Database } from '../db/client'
import {
  location,
  specimen,
  specimenType,
  storageContainer,
  storageContainerTag,
  tag,
  unit,
  type Location,
  type StorageContainer,
  type Unit,
} from '../db/schema'
import {
  resolveContainerPlacementBundle,
  type ContainerPlacement,
  type CryovialSubtypeDetails,
  type MicronixSubtypeDetails,
  type PaperSubtypeDetails,
  type StaticWellSubtypeDetails,
} from './container-placement'
import { projectContainerCollection } from './container-projection'
import { resolveSpecimenSources, type SpecimenSource } from './specimens/provenance'
import type { CollectionInfo } from '../types/collections'

export type ContainerReadView = {
  container: StorageContainer
  containerType: 'micronix_tube' | 'cryovial_tube' | 'paper' | 'static_well' | 'unknown'
  tags: Array<{ id: number; name: string }>
  unit: Unit | undefined
  location: Location | null
  locationPath: string
  collection: CollectionInfo | null
  placement: ContainerPlacement
  micronixTube?: MicronixSubtypeDetails
  cryovialTube?: CryovialSubtypeDetails
  paper?: PaperSubtypeDetails
  staticWell?: StaticWellSubtypeDetails
  specimen: SpecimenSummaryWire | null
  source: SpecimenSource | null
}

/**
 * Load the operational Container read view for already-fetched rows.
 * Placement, identity, Tags, Specimen summary, and Source assemble here —
 * callers project to list wire, collection detail, or Container export.
 */
export async function loadContainerReadViews(
  database: Database,
  containers: StorageContainer[],
): Promise<ContainerReadView[]> {
  if (containers.length === 0) {
    return []
  }

  const ids = containers.map((container) => container.id)
  const unitIds = [...new Set(containers.map((container) => container.unitId))]
  const specimenIds = [...new Set(containers.map((container) => container.specimenId))]

  const [{ placements, subtypes }, units, tagRows, specimens, sourceMap] = await Promise.all([
    resolveContainerPlacementBundle(database, ids),
    database.select().from(unit).where(inArray(unit.id, unitIds)),
    database
      .select({ containerId: storageContainerTag.storageContainerId, id: tag.id, name: tag.name })
      .from(tag)
      .innerJoin(storageContainerTag, eq(tag.id, storageContainerTag.tagId))
      .where(inArray(storageContainerTag.storageContainerId, ids)),
    database.select().from(specimen).where(inArray(specimen.id, specimenIds)),
    resolveSpecimenSources(database, specimenIds),
  ])

  const specimenTypeIds = [
    ...new Set(specimens.map((row) => row.specimenTypeId).filter((id): id is number => id != null)),
  ]
  const specimenTypes =
    specimenTypeIds.length > 0
      ? await database
          .select({ id: specimenType.id, name: specimenType.name })
          .from(specimenType)
          .where(inArray(specimenType.id, specimenTypeIds))
      : []

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
  const specimenById = new Map(specimens.map((row) => [row.id, row]))
  const typeById = new Map(specimenTypes.map((row) => [row.id, row]))
  const tagsByContainerId = new Map<number, Array<{ id: number; name: string }>>()
  for (const row of tagRows) {
    const list = tagsByContainerId.get(row.containerId) ?? []
    list.push({ id: row.id, name: row.name })
    tagsByContainerId.set(row.containerId, list)
  }

  return containers.map((container) => {
    const placement = placements.get(container.id)!
    const spec = specimenById.get(container.specimenId) ?? null
    const type = spec != null ? typeById.get(spec.specimenTypeId) : undefined
    const locationInfo = placement.location ? locationById.get(placement.location.id) ?? null : null

    const specimenSummary: SpecimenSummaryWire | null = spec
      ? {
          id: spec.id,
          studySubjectId: spec.studySubjectId,
          controlBatchId: spec.controlBatchId,
          specimenTypeId: spec.specimenTypeId,
          collectionDate: spec.collectionDate,
          created: spec.created,
          lastUpdated: spec.lastUpdated,
          ...(type ? { specimenType: { id: type.id, name: type.name } } : {}),
        }
      : null

    return {
      container,
      containerType: placement.containerType,
      tags: tagsByContainerId.get(container.id) ?? [],
      unit: unitById.get(container.unitId),
      location: locationInfo,
      locationPath: placement.locationPath ?? '',
      collection: projectContainerCollection(placement),
      placement,
      micronixTube: subtypes.micronixById.get(container.id),
      cryovialTube: subtypes.cryovialById.get(container.id),
      paper: subtypes.paperById.get(container.id),
      staticWell: subtypes.staticWellById.get(container.id),
      specimen: specimenSummary,
      source: sourceMap.get(container.specimenId) ?? null,
    }
  })
}

export async function loadContainerReadViewsByIds(
  database: Database,
  containerIds: number[],
): Promise<Map<number, ContainerReadView>> {
  const result = new Map<number, ContainerReadView>()
  if (containerIds.length === 0) return result

  const uniqueIds = [...new Set(containerIds)]
  const containers = await database
    .select()
    .from(storageContainer)
    .where(inArray(storageContainer.id, uniqueIds))
  if (containers.length === 0) return result

  const views = await loadContainerReadViews(database, containers)
  for (const view of views) {
    result.set(view.container.id, view)
  }
  return result
}
