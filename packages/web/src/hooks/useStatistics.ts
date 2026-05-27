import { useQuery } from '@tanstack/react-query'
import { statisticsApi } from '../lib/api/statistics'
import type { StatisticsData, StatisticsFilters as ApiFilters } from '../lib/api/statistics'
import type { StatisticsFilters } from '../components/StatisticsFilter'

export const statisticsKeys = {
  all: ['statistics'] as const,
  filtered: (filters: StatisticsFilters) => [...statisticsKeys.all, filters] as const,
}

function filtersToApi(filters: StatisticsFilters): ApiFilters {
  const apiFilters: ApiFilters = {}
  if (filters.study) apiFilters.study = filters.study
  if (filters.sourceType) apiFilters.source_type = filters.sourceType
  if (filters.specimenTypeId) apiFilters.specimen_type_id = filters.specimenTypeId
  if (filters.containerType) apiFilters.container_type = filters.containerType
  if (filters.tagIds?.length) {
    apiFilters.tag_ids = filters.tagIds.map((id) => parseInt(id, 10)).filter((id) => !Number.isNaN(id))
  }
  if (filters.collectionDateFrom) apiFilters.collection_date_from = filters.collectionDateFrom
  if (filters.collectionDateTo) apiFilters.collection_date_to = filters.collectionDateTo
  if (filters.createdFrom) apiFilters.created_from = filters.createdFrom
  if (filters.createdTo) apiFilters.created_to = filters.createdTo
  if (filters.locationId) apiFilters.location_id = filters.locationId
  return apiFilters
}

function normalizeStatistics(raw: StatisticsData): StatisticsData {
  const specimens = raw.specimens
  const containers = raw.containers
  const storage = raw.storage
  return {
    specimens: {
      total: specimens.total,
      bySourceType: specimens.bySourceType,
      bySpecimenType: specimens.bySpecimenType,
      byStudy: specimens.byStudy,
      collectionTimeline: Array.isArray(specimens.collectionTimeline) ? specimens.collectionTimeline : [],
      creationTimeline: Array.isArray(specimens.creationTimeline) ? specimens.creationTimeline : [],
    },
    containers: {
      total: containers.total,
      byType: containers.byType,
      byTags: containers.byTags,
      byStatus: containers.byStatus,
      averagePerSpecimen:
        typeof containers.averagePerSpecimen === 'number' ? containers.averagePerSpecimen : 0,
    },
    storage: {
      byLocation: Array.isArray(storage.byLocation) ? storage.byLocation : [],
      byRootLocation: storage.byRootLocation,
    },
  }
}

export function useStatistics(filters: StatisticsFilters) {
  return useQuery({
    queryKey: statisticsKeys.filtered(filters),
    queryFn: async () => {
      const response = await statisticsApi.get(filtersToApi(filters))
      return normalizeStatistics(response)
    },
  })
}
