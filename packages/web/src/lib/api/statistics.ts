import { api } from './client'
export interface StatisticsData {
  specimens: {
    total: number
    bySourceType: Record<string, number>
    bySpecimenType: Record<string, number>
    byStudy: Record<string, number>
    collectionTimeline: Array<{ date: string; count: number }>
    creationTimeline: Array<{ date: string; count: number }>
  }
  containers: {
    total: number
    byType: Record<string, number>
    byTags: Record<string, number>
    byStatus: Record<string, number>
    averagePerSpecimen: number
  }
  storage: {
    byLocation: Array<{ location: string; count: number }>
    byRootLocation: Record<string, number>
  }
}

export interface StatisticsFilters {
  study?: string
  source_type?: string
  specimen_type_id?: string
  container_type?: string
  tag_ids?: number[] // Array of tag IDs for filtering (axios serializes as multiple query params)
  collection_date_from?: string
  collection_date_to?: string
  created_from?: string
  created_to?: string
  location_id?: string
}

export const statisticsApi = {
  get: (filters?: StatisticsFilters) =>
    api.get<StatisticsData>('/statistics', {
      params: filters,
      paramsSerializer: {
        indexes: null, // Use format: key=value1&key=value2 instead of key[]=value1&key[]=value2
      },
    }),
}
