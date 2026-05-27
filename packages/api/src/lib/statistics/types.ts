export type StatisticsFilters = {
  study?: string
  source_type?: string
  specimen_type_id?: string
  container_type?: string
  tag_ids?: number[]
  location_id?: string
  collection_date_from?: string
  collection_date_to?: string
  created_from?: string
  created_to?: string
}

export type DashboardStatistics = {
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
    byState?: Record<string, number>
    averagePerSpecimen: number
  }
  storage: {
    byLocation: Array<{ location: string; count: number }>
    byRootLocation: Record<string, number>
    _summary?: {
      totalContainers: number
      containersWithLocations: number
      containersWithoutLocations: number
    }
  }
}

export type AdminStatistics = {
  users: {
    total: number
    active: number
    deleted: number
    byRole: Record<string, number>
    recentLogins: number
  }
  sessions: {
    active: number
  }
  entities: {
    studies: number
    subjects: number
    specimens: number
    containers: number
  }
  containers: {
    micronixTubes: number
    cryovialTubes: number
    papers: number
    staticWells: number
  }
  collections: {
    micronixPlates: number
    cryovialBoxes: number
    boxes: number
    bags: number
  }
  referenceData: {
    specimenTypes: number
    storageTypes: number
    tags: number
    units: number
    strains: number
  }
  locations: {
    total: number
  }
}
