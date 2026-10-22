import { eq } from 'drizzle-orm'
import type { Database } from '../../db/client'
import { study } from '../../db/schema'
import { selectContainers, type ContainerSelection, type ContainerSelectionFilters } from '../container-selection'
import { computeContainerAggregates } from './container-aggregates'
import { computeSpecimenAggregates } from './specimen-aggregates'
import { computeStorageStatistics } from './storage-aggregates'
import type { DashboardStatistics, StatisticsFilters } from './types'

/** Statistics with every count zero, for filters that match nothing. */
function emptyDashboardStatistics(): DashboardStatistics {
  return {
    specimens: {
      total: 0,
      bySourceType: {},
      bySpecimenType: {},
      byStudy: {},
      collectionTimeline: [],
      creationTimeline: [],
    },
    containers: {
      total: 0,
      byType: {},
      byTags: {},
      byStatus: {},
      averagePerSpecimen: 0,
    },
    storage: {
      byLocation: [],
      byRootLocation: {},
    },
  }
}

/** Parse an integer id query value; anything else means no filter. */
function parseId(value: string | undefined): number | undefined {
  if (!value) return undefined
  const id = parseInt(value)
  return isNaN(id) ? undefined : id
}

/** Map the statistics query to Container selection filters (ADR 0011). */
function selectionFilters(filters: StatisticsFilters): ContainerSelectionFilters {
  const specimenTypeId = parseId(filters.specimen_type_id)
  return {
    specimenTypeIds: specimenTypeId === undefined ? undefined : [specimenTypeId],
    collectionDate: { from: filters.collection_date_from, to: filters.collection_date_to },
    specimenCreated: { from: filters.created_from, to: filters.created_to },
    containerTypes: filters.container_type ? [filters.container_type] : undefined,
    tagIds: filters.tag_ids,
    locationId: parseId(filters.location_id),
  }
}

/**
 * The selection the statistics query describes, or null when it matches nothing: an
 * unknown Study, or control Specimens within a Study. An unknown Location or Tag
 * matches nothing inside the selection.
 */
async function statisticsSelection(
  database: Database,
  filters: StatisticsFilters,
): Promise<ContainerSelection | null> {
  const sourceType =
    filters.source_type === 'subject' || filters.source_type === 'control' ? filters.source_type : undefined
  if (!filters.study) return { kind: 'database', sourceType, filters: selectionFilters(filters) }
  if (sourceType === 'control') return null
  const studyRecord = await database
    .select({ id: study.id })
    .from(study)
    .where(eq(study.shortCode, filters.study))
    .get()
  if (!studyRecord) return null
  return { kind: 'study', studyId: studyRecord.id, filters: selectionFilters(filters) }
}

/** Filtered dashboard statistics for specimens, containers, and storage. */
export async function getDashboardStatistics(
  database: Database,
  filters: StatisticsFilters,
): Promise<DashboardStatistics> {
  const selection = await statisticsSelection(database, filters)
  if (!selection) return emptyDashboardStatistics()
  const { containers, specimens, containerTypes } = await selectContainers(database, selection)
  if (specimens.length === 0) return emptyDashboardStatistics()

  const hasContainerFilter =
    !!filters.container_type || (filters.tag_ids?.length ?? 0) > 0 || parseId(filters.location_id) !== undefined
  const specimenAggregates = await computeSpecimenAggregates(database, specimens, {
    useSpecimenTypeCache: !hasContainerFilter,
  })
  const containerTotal = containers.length
  const averagePerSpecimen = specimenAggregates.total > 0 ? containerTotal / specimenAggregates.total : 0
  const containerAggregates = await computeContainerAggregates(database, containers, containerTypes)
  const storage = await computeStorageStatistics(
    database,
    containers.map((container) => container.id),
    containerTotal,
  )

  return {
    specimens: specimenAggregates,
    containers: {
      total: containerTotal,
      ...containerAggregates,
      averagePerSpecimen: Math.round(averagePerSpecimen * 100) / 100,
    },
    storage,
  }
}
