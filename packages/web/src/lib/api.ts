import axios from 'axios'

const api = axios.create({
  baseURL: '/api',
  withCredentials: true,
  headers: {
    'Content-Type': 'application/json',
  },
})

export interface Study {
  id: number
  title: string
  description?: string
  shortCode: string
  isLongitudinal: boolean
  leadPerson: string
  created: string
  lastUpdated: string
}

export interface StudySubject {
  id: number
  studyId: number
  name: string
  created: string
  lastUpdated: string
  specimenCount?: number
}

export interface Specimen {
  id: number
  studySubjectId?: number
  controlBatchId?: number
  specimenTypeId: number
  collectionDate?: string
  created: string
  lastUpdated: string
  specimenType?: { id: number; name: string }
  sourceType?: 'subject' | 'control' | 'reagent' | 'cell_line' | 'plasmid' | 'standard'
  sourceId?: number
}

export interface SpecimenType {
  id: number
  name: string
  created: string
  lastUpdated: string
}

export interface ControlDefinition {
  id: number
  name: string
  controlType: 'blood' | 'plasma_positive' | 'plasma_negative' | 'antibody' | 'extraction' | 'negative'
  description?: string
  properties?: Record<string, any> // For blood controls: { strains: [...], targetDensity, targetDensityUnitId, targetDensityUnitSymbol }
  created: string
  lastUpdated: string
  // Parsed from properties for convenience
  targetDensity?: number
  targetDensityUnitId?: number
  unitSymbol?: string
  batchCount?: number
  specimenCount?: number
  spotCount?: number
  tubeCount?: number
  inventoryTotal?: number
  strains?: Array<{ id: number; name: string; percentage?: number }>
}

export interface Reagent {
  id: number
  name: string
  reagentType: 'antibody' | 'primer' | 'probe' | 'enzyme' | 'buffer'
  vendor?: string
  catalogNumber?: string
  lotNumber?: string
  receivedDate?: string
  expirationDate?: string
  storageTemp?: string
  properties?: Record<string, any>
  created: string
  lastUpdated: string
}

export interface StudySummary {
  study: Study
  summary: {
    totalSubjects: number
    totalSpecimens: number
    totalContainers: number
    averageSpecimensPerSubject: number
    specimenTypes: Array<{ name: string; count: number; percentage: number }>
    containerTypes: Record<string, number>
    collectionDateRange: { earliest: string; latest: string } | null
    studyDurationDays: number | null
    collectionTimeline: Array<{ date: string; count: number }>
    enrollmentTimeline: Array<{ date: string; count: number }>
  }
}

export interface StudyTimelineData {
  subjects: Array<{
    id: number
    name: string
    specimens: Array<{
      id: number
      collectionDate: string
      specimenTypeId: number
      specimenTypeName: string
    }>
  }>
  specimenTypes: Array<{ id: number; name: string }>
  dateRange: { earliest: string; latest: string } | null
}

export interface StudySummaryBasic {
  studyId: number
  totalSubjects: number
  totalSpecimens: number
  totalContainers: number
  collectionDateRange: { earliest: string; latest: string } | null
}

export const studiesApi = {
  list: (search?: string, params?: { page?: number; limit?: number }) =>
    api.get<{ studies: Study[]; pagination?: { page: number; limit: number; total: number; totalPages: number } }>('/studies', {
      params: { search, ...params }
    }),
  get: (id: number) => api.get<{ study: Study }>(`/studies/${id}`),
  getSubjects: (id: number, params?: { page?: number; limit?: number }) =>
    api.get<{ subjects: StudySubject[]; pagination?: { page: number; limit: number; total: number; totalPages: number } }>(`/studies/${id}/subjects`, { params }),
  getSummary: (id: number) => api.get<StudySummary>(`/studies/${id}/summary`),
  getSummaries: (ids: number[]) => api.get<{ summaries: StudySummaryBasic[] }>('/studies/summaries', {
    params: { ids: ids.join(',') }
  }),
  getTimeline: (id: number) => api.get<StudyTimelineData>(`/studies/${id}/timeline`),
  create: (data: Omit<Study, 'id' | 'created' | 'lastUpdated'>) => api.post<{ study: Study }>('/studies', data),
  update: (id: number, data: Partial<Pick<Study, 'title' | 'leadPerson' | 'shortCode' | 'description' | 'isLongitudinal'>>) =>
    api.put<{ study: Study }>(`/studies/${id}`, data),
}

export interface SubjectSummarySpecimen {
  id: number
  specimenTypeId: number
  specimenTypeName: string
  collectionDate?: string
  created: string
  lastUpdated: string
  containerCount: number
  totalRemainingQuantity?: number
  containerBreakdown: Record<string, number>
  unitBreakdown?: Record<string, number>
  containers?: Array<{
    id: number
    type: string
    remainingQuantity: number
    unit: string
    collectionName?: string
    position?: string
    collectionId?: number
    locationPath?: string
  }>
}

export interface InventoryItem {
  type: string
  unit: string
  totalQuantity: number
  remainingQuantity: number
  containerCount: number
  collections?: string[]
  locationPaths?: string[]
}

export interface SubjectSummary {
  totalSpecimens: number
  totalContainers: number
  totalRemainingQuantity?: number
  inventory?: InventoryItem[]
  specimenTypes: Array<{ name: string; count: number }>
  containerTypes?: Record<string, number>
  collectionDateRange: { earliest: string; latest: string } | null
  timeline: Array<{
    id: number
    date: string
    specimenTypeName: string
    specimenTypeId: number
  }>
}

export interface SubjectSummaryResponse {
  subject: StudySubject & { study?: { id: number; title: string; shortCode: string } }
  specimens: SubjectSummarySpecimen[]
  summary: SubjectSummary
}

export const subjectsApi = {
  get: (id: number) => api.get<{ subject: StudySubject }>(`/subjects/${id}`),
  getSummary: (id: number) => api.get<SubjectSummaryResponse>(`/subjects/${id}/summary`),
  create: (data: { studyId?: number; studyShortCode?: string; name: string }) =>
    api.post<{ subject: StudySubject }>('/subjects', data),
  update: (id: number, data: { name: string }) =>
    api.put<{ subject: StudySubject }>(`/subjects/${id}`, data),
  createBulk: (data: { subjects: Array<{ studyShortCode: string; name: string }> }) =>
    api.post<{ subjects: StudySubject[]; created: number; errors?: Array<{ index: number; error: string }> }>('/subjects/bulk', data),
  createWithSpecimens: (data: {
    studyShortCode: string
    subjectName: string
    specimens: Array<{
      specimenTypeName: string
      collectionDate?: string
      container?: {
        mode?: 'create' | 'link' | 'skip'
        containerType?: 'micronix_tube' | 'cryovial_tube' | 'paper' | 'static_well'
        containerBarcode?: string
        containerId?: number
        collectionName?: string
        collectionBarcode?: string
        barcode?: string
        position?: string
        label?: string
        unitId?: number
        totalQuantity?: number
        remainingQuantity?: number
        comment?: string
        collectionLocationId?: number
      }
    }>
  }) =>
    api.post<{
      subject: StudySubject
      subjectCreated: boolean
      specimens: Array<{
        specimen: Specimen
        containerCreated: boolean
        containerId?: number
      }>
      summary: {
        subjectsCreated: number
        subjectsUpdated: number
        specimensCreated: number
        containersCreated: number
      }
    }>('/subjects/with-specimens', data),
  merge: (targetId: number, sourceId: number) =>
    api.post<{
      success: boolean
      specimensTransferred: number
      specimensMerged: number
      containersMerged: number
      totalContainersTransferred: number
      targetSubject: StudySubject
    }>(`/subjects/${targetId}/merge`, { sourceId }),
}

export const specimensApi = {
  search: (params?: { source_type?: string; study?: string; barcode?: string; subject_id?: string }) =>
    api.get<{ specimens: Specimen[] }>('/specimens', { params }),
  get: (id: number) => api.get<{ specimen: Specimen }>(`/specimens/${id}`),
  create: (data: {
    sourceType: 'subject' | 'control' | 'reagent' | 'cell_line' | 'plasmid' | 'standard'
    sourceId?: number
    studyShortCode?: string
    subjectName?: string
    specimenTypeId?: number
    specimenTypeName?: string
    collectionDate?: string
    containerBarcode?: string
  }) => api.post<{ specimen: Specimen }>('/specimens', data),
  createBulk: (data: {
    specimens: Array<{
      sourceType: 'subject' | 'control' | 'reagent' | 'cell_line' | 'plasmid' | 'standard'
      sourceId?: number
      studyShortCode?: string
      subjectName?: string
      specimenTypeName: string
      collectionDate?: string
      containerBarcode?: string
    }>
  }) =>
    api.post<{ specimens: Specimen[]; created: number; errors?: Array<{ index: number; error: string }> }>('/specimens/bulk', data),
}

// State interface removed - states deprecated in favor of tags
export interface Tag {
  id: number
  name: string
}

export interface StorageType {
  id: number
  name: string
  description?: string
}

export interface Strain {
  id: number
  name: string
  description?: string
}

export interface Location {
  id: number
  parentId: number | null
  name: string
  storageTypeId: string | null  // Only root locations have storage_type_id
  storageTypeName?: string | null  // Storage type name (for root locations)
  effectiveStorageTypeId?: string | null  // Effective storage type ID (from root)
  effectiveStorageTypeName?: string | null  // Effective storage type name (from root)
  description?: string
  canContainCollections: boolean
  path?: string  // Full path string
  created: string
  lastUpdated: string
}

export interface LocationHierarchyStats {
  depth: number
  totalDescendants: number
  directContainers: {
    micronix: number
    cryovial: number
    boxes: number
    bags: number
  }
  aggregatedContainers: {
    micronix: number
    cryovial: number
    boxes: number
    bags: number
  }
  childLocationStats: Array<{
    locationId: number
    locationName: string
    canContainCollections: boolean
    containerCounts: {
      micronix: number
      cryovial: number
      boxes: number
      bags: number
    }
  }>
}

export const specimenTypesApi = {
  list: () => api.get<{ specimenTypes: SpecimenType[] }>('/specimen-types'),
  get: (id: number) => api.get<{ specimenType: SpecimenType }>(`/specimen-types/${id}`),
  create: (data: Omit<SpecimenType, 'id' | 'created' | 'lastUpdated'>) =>
    api.post<{ specimenType: SpecimenType }>('/specimen-types', data),
  update: (id: number, data: Partial<SpecimenType>) =>
    api.put<{ specimenType: SpecimenType }>(`/specimen-types/${id}`, data),
  delete: (id: number) => api.delete<{ message: string }>(`/specimen-types/${id}`),
  getContainerTypes: (id: number) => api.get<{ containerTypes: string[]; usageInfo?: Record<string, boolean> }>(`/specimen-types/${id}/container-types`),
  addContainerType: (id: number, containerType: string) =>
    api.post<{ success: boolean; containerType: string }>(`/specimen-types/${id}/container-types`, { containerType }),
  removeContainerType: (id: number, containerType: string) =>
    api.delete<{ success: boolean }>(`/specimen-types/${id}/container-types/${containerType}`),
  getByContainerType: (containerType: string) =>
    api.get<{ specimenTypes: SpecimenType[] }>(`/specimen-types/container-types/${containerType}`),
}

// States API removed - replaced with tags
export const tagsApi = {
  list: () => api.get<{ tags: Tag[] }>('/tags'),
  get: (id: number) => api.get<{ tag: Tag }>(`/tags/${id}`),
  create: (data: Omit<Tag, 'id'>) => api.post<{ tag: Tag }>('/tags', data),
  update: (id: number, data: Partial<Tag>) => api.put<{ tag: Tag }>(`/tags/${id}`, data),
  delete: (id: number) => api.delete<{ message: string }>(`/tags/${id}`),
}

export const storageTypesApi = {
  list: () => api.get<{ storageTypes: StorageType[] }>('/storage-types'),
  get: (id: number) => api.get<{ storageType: StorageType }>(`/storage-types/${id}`),
  create: (data: Omit<StorageType, 'id'>) => api.post<{ storageType: StorageType }>('/storage-types', data),
  update: (id: number, data: Partial<StorageType>) => api.put<{ storageType: StorageType }>(`/storage-types/${id}`, data),
  delete: (id: number) => api.delete<{ message: string }>(`/storage-types/${id}`),
}

export const strainsApi = {
  list: () => api.get<{ strains: Strain[] }>('/strains'),
  get: (id: number) => api.get<{ strain: Strain }>(`/strains/${id}`),
  create: (data: Omit<Strain, 'id'>) => api.post<{ strain: Strain }>('/strains', data),
  update: (id: number, data: Partial<Strain>) => api.put<{ strain: Strain }>(`/strains/${id}`, data),
  delete: (id: number) => api.delete<{ message: string }>(`/strains/${id}`),
}

export const unitsApi = {
  list: () => api.get<{ units: Unit[] }>('/units'),
  get: (id: number) => api.get<{ unit: Unit }>(`/units/${id}`),
  create: (data: Omit<Unit, 'id'>) => api.post<{ unit: Unit }>('/units', data),
  update: (id: number, data: Partial<Unit>) => api.put<{ unit: Unit }>(`/units/${id}`, data),
  delete: (id: number) => api.delete<{ message: string }>(`/units/${id}`),
}


export interface CellLine {
  id: number
  name: string
  species: string
  strain?: string
  source?: string
  properties?: Record<string, any>
  created: string
  lastUpdated: string
}

export interface Plasmid {
  id: number
  name: string
  backbone?: string
  insertName?: string
  insertSizeBp?: number
  resistance?: string
  source?: string
  properties?: Record<string, any>
  created: string
  lastUpdated: string
}

export interface Standard {
  id: number
  name: string
  standardType: string
  manufacturer?: string
  catalogNumber?: string
  lotNumber?: string
  properties?: Record<string, any>
  created: string
  lastUpdated: string
}

export const cellLinesApi = {
  list: () => api.get<{ cellLines: CellLine[] }>('/cell-lines'),
  get: (id: number) => api.get<{ cellLine: CellLine }>(`/cell-lines/${id}`),
}

export const plasmidsApi = {
  list: () => api.get<{ plasmids: Plasmid[] }>('/plasmids'),
  get: (id: number) => api.get<{ plasmid: Plasmid }>(`/plasmids/${id}`),
}

export const standardsApi = {
  list: () => api.get<{ standards: Standard[] }>('/standards'),
  get: (id: number) => api.get<{ standard: Standard }>(`/standards/${id}`),
}

export interface ControlBatch {
  id: number
  controlDefinitionId: number
  name: string
  productionDate?: string
  properties?: Record<string, any>
  created: string
  lastUpdated: string
  specimenCount?: number
  spotCount?: number
  tubeCount?: number
  inventoryTotal?: number
  controlType?: string
  strains?: Array<{ id: number; name: string }>
  targetDensity?: number
  unitSymbol?: string
}

export interface ControlBatchSummaryResponse {
  batch: ControlBatch & {
    definition?: {
      id: number;
      name: string;
      controlType: string;
      description?: string;
      targetDensity?: number;
      targetDensityUnitId?: number;
      compositionId?: number;
      unitSymbol?: string;
    };
    composition?: {
      id: number;
      label: string;
      strains: Array<{
        id: number;
        name: string;
        percentage: number;
      }>;
    };
  }
  specimens: SubjectSummarySpecimen[]
  summary: SubjectSummary
}

export interface ControlDefinitionSummaryResponse {
  control: ControlDefinition & { unitSymbol?: string }
  composition?: {
    id: number
    label: string
    strains: Array<{
      id: number
      name: string
      percentage: number
    }>
  }
  batches: Array<ControlBatch & {
    specimenCount: number
    spotCount?: number
    tubeCount?: number
    inventoryTotal?: number
    inventory: Array<{
      totalRemaining: number
      unitSymbol: string
    }>
  }>
  stats: {
    totalBatches: number
    totalContainers: number
    totalSpots: number
    totalTubes: number
    latestBatchDate?: string | null
    totalSpecimens: number
    inStockBatchesCount: number
    activeLocationsCount: number
  }
}

export const controlsApi = {
  list: (type?: string) => api.get<{ controls: ControlDefinition[] }>('/blood-controls', { params: { type } }),
  get: (id: number) => api.get<{ control: ControlDefinition }>(`/blood-controls/${id}`),
  getDefinitionSummary: (id: number) => api.get<ControlDefinitionSummaryResponse>(`/blood-controls/${id}/summary`),
  checkUnique: (data: { controlType: ControlDefinition['controlType']; targetDensity?: number; targetDensityUnitId?: number; strains?: Array<{ strainId: number; percentage: number }> }) => api.post<{ exists: boolean; controlDefinition?: ControlDefinition }>('/blood-controls/check-unique', data),
  create: (data: Omit<ControlDefinition, 'id' | 'created' | 'lastUpdated' | 'strains'> & { strains?: Array<{ strainId: number; percentage: number }> }) => api.post<{ control: ControlDefinition }>('/blood-controls', data),
  update: (id: number, data: Partial<ControlDefinition> & { strains?: Array<{ strainId: number; percentage: number }> }) => api.patch<{ control: ControlDefinition }>(`/blood-controls/${id}`, data),
  listAllBatches: () => api.get<{ batches: Array<ControlBatch & { definitionName?: string }> }>('/blood-controls/batches'),
  getBatches: (id: number) => api.get<{ batches: ControlBatch[] }>(`/blood-controls/${id}/batches`),
  createBatch: (id: number, data: Omit<ControlBatch, 'id' | 'controlDefinitionId' | 'created' | 'lastUpdated'>) =>
    api.post<{ batch: ControlBatch }>(`/blood-controls/${id}/batches`, data),
  getBatch: (id: number) => api.get<{ batch: ControlBatch }>(`/blood-controls/batches/${id}`),
  getBatchSummary: (id: number) => api.get<ControlBatchSummaryResponse>(`/blood-controls/batches/${id}/summary`),
  createBatchWithSpecimens: (data: {
    batch: {
      controlDefinitionId: number
      name: string
      productionDate?: string
      properties?: Record<string, any>
    }
    specimens: Array<{
      specimenTypeName: string
      collectionDate?: string
      containers: Array<{
        type: 'paper' | 'cryovial_tube' | 'micronix_tube'
        collectionId?: number
        collectionName?: string
        collectionLocationId?: number
        collectionType?: 'box' | 'bag' | 'micronix_plate' | 'cryovial_box'
        containerBarcode?: string
        position?: string
        quantity?: number
        unitSymbol?: string
      }>
    }>
    createCollections?: Array<{
      type: 'box' | 'bag' | 'micronix_plate' | 'cryovial_box'
      name: string
      locationId: number
      barcode?: string
    }>
  }) => api.post<{ batch: ControlBatch; specimens: Array<{ id: number; specimenTypeName: string; containerCount: number; containerIds: number[] }>; createdCollections: Array<{ type: string; id: number; name: string }> }>('/blood-controls/batches/create-with-specimens', data),
  addSpecimensToBatch: (batchId: number, data: {
    specimens: Array<{
      specimenTypeName: string
      collectionDate?: string
      containers: Array<{
        type: 'paper' | 'cryovial_tube' | 'micronix_tube'
        collectionId?: number
        collectionName?: string
        collectionLocationId?: number
        collectionType?: 'box' | 'bag' | 'micronix_plate' | 'cryovial_box'
        containerBarcode?: string
        position?: string
        quantity?: number
        unitSymbol?: string
      }>
    }>
    createCollections?: Array<{
      type: 'box' | 'bag' | 'micronix_plate' | 'cryovial_box'
      name: string
      locationId: number
      barcode?: string
    }>
  }) => api.post<{ specimens: Array<{ id: number; specimenTypeName: string; containerCount: number; containerIds: number[] }>; createdCollections: Array<{ type: string; id: number; name: string }> }>(`/blood-controls/batches/${batchId}/specimens/bulk`, data),
  validateCSV: (data: { csvText: string }) => api.post<{ valid: boolean; errors: Array<{ row: number; field?: string; error: string }>; preview: Array<Record<string, any>> }>('/blood-controls/batches/validate-csv', data),
  deleteBatch: (id: number) => api.delete<{ message: string }>(`/blood-controls/batches/${id}`),
}

export const reagentsApi = {
  list: (params?: { type?: string; expiring_within_days?: number }) =>
    api.get<{ reagents: Reagent[] }>('/reagents', { params }),
  get: (id: number) => api.get<{ reagent: Reagent }>(`/reagents/${id}`),
  create: (data: Omit<Reagent, 'id' | 'created' | 'lastUpdated'>) => api.post<{ reagent: Reagent }>('/reagents', data),
  update: (id: number, data: Partial<Reagent>) => api.patch<{ reagent: Reagent }>(`/reagents/${id}`, data),
}

export const locationsApi = {
  list: (page?: number, limit?: number, search?: string) => {
    const params: any = {}
    if (page) params.page = page
    if (limit) params.limit = limit
    if (search && search.trim()) params.search = search.trim()
    return api.get<{ locations: Location[]; pagination?: { page: number; limit: number; total: number; totalPages: number } }>('/locations', { params })
  },
  get: (id: number, params?: {
    boxes_page?: number;
    boxes_limit?: number;
    plates_page?: number;
    plates_limit?: number;
    cryovial_boxes_page?: number;
    cryovial_boxes_limit?: number;
    bags_page?: number;
    bags_limit?: number;
  }) => {
    const queryParams: any = {}
    if (params?.boxes_page) queryParams.boxes_page = params.boxes_page
    if (params?.boxes_limit) queryParams.boxes_limit = params.boxes_limit
    if (params?.plates_page) queryParams.plates_page = params.plates_page
    if (params?.plates_limit) queryParams.plates_limit = params.plates_limit
    if (params?.cryovial_boxes_page) queryParams.cryovial_boxes_page = params.cryovial_boxes_page
    if (params?.cryovial_boxes_limit) queryParams.cryovial_boxes_limit = params.cryovial_boxes_limit
    if (params?.bags_page) queryParams.bags_page = params.bags_page
    if (params?.bags_limit) queryParams.bags_limit = params.bags_limit
    return api.get<{ location: Location; contents: any; pagination?: any; hierarchyStats?: LocationHierarchyStats }>(`/locations/${id}`, { params: queryParams })
  },
  create: (data: Omit<Location, 'id' | 'created' | 'lastUpdated'>) =>
    api.post<{ location: Location }>('/locations', data),
  update: (id: number, data: Partial<Omit<Location, 'id' | 'created' | 'lastUpdated'>>) =>
    api.put<{ location: Location }>(`/locations/${id}`, data),
  delete: (id: number) => api.delete<{ message: string }>(`/locations/${id}`),
}

export const collectionsApi = {
  getMicronixPlate: (id: number) =>
    api.get<{ plate: any; wells: Record<string, any> }>(`/collections/plates/micronix/${id}`),
  getCryovialBox: (id: number) =>
    api.get<{ box: any; positions: Record<string, any[]> }>(`/collections/boxes/cryovial/${id}`),
  getBox: (id: number) =>
    api.get<{ box: any; contents: { tubes: any[]; papers: any[] } }>(`/collections/boxes/${id}`),
  getBag: (id: number) =>
    api.get<{ bag: any; contents: { papers: any[] } }>(`/collections/bags/${id}`),
  getSheet: (id: number) =>
    api.get<{ sheet: any; papers: any[] }>(`/collections/sheets/${id}`),
  check: (data: { collections: Array<{ identifier: string; type: 'micronix_plate' | 'cryovial_box' | 'box' | 'bag' | 'sheet' }> }) =>
    api.post<{ results: Array<{ identifier: string; type: string; exists: boolean; id: number | null }> }>('/collections/check', data),
  createMicronixPlate: (data: { name: string; locationId: number; barcode?: string }) =>
    api.post<{ plate: any }>('/collections/plates/micronix', data),
  createCryovialBox: (data: { name: string; locationId: number; barcode?: string }) =>
    api.post<{ box: any }>('/collections/boxes/cryovial', data),
  createBox: (data: { name: string; locationId: number }) =>
    api.post<{ box: any }>('/collections/boxes', data),
  createBag: (data: { name: string; locationId: number }) =>
    api.post<{ bag: any }>('/collections/bags', data),
  resolveContainers: (data: {
    identifiers: Array<
      | { type: 'barcode'; barcode: string }
      | { type: 'position'; sourceCollectionName: string; sourcePosition: string }
    >
  }) =>
    api.post<{ containers: Array<{ identifier: any; container: any }> }>('/collections/containers/resolve', data),
  listCollectionsByType: (type: 'micronix_plate' | 'cryovial_box' | 'box' | 'bag' | 'sheet') =>
    api.get<{ collections: Array<{ id: number; name: string }> }>(`/collections/list/${type}`),
  moveContainers: (data: {
    collectionType?: 'micronix_plate' | 'cryovial_box' | 'box' | 'bag' | 'sheet'
    mappings: Array<{
      fromCollectionName: string
      toCollectionName: string
    }>
    moves: Array<{
      identifier:
      | { type: 'barcode'; barcode: string }
      | { type: 'position'; sourceCollectionName: string; sourcePosition: string }
      | { type: 'container_id'; containerId: number }
      targetPosition?: string
    }>
  }) =>
    api.post<{ success: boolean; moved: number; errors?: Array<{ row: number; error: string }> }>(
      '/collections/containers/move',
      data
    ),
  moveSheets: (data: {
    sheetIds: number[]
    targetCollectionId: number
    targetCollectionType: 'box' | 'bag'
  }) => api.post<{ success: boolean; moved: number }>('/collections/sheets/move', data),
  moveCollections: (data: {
    collectionType: 'micronix_plate' | 'cryovial_box' | 'box' | 'bag'
    moves: Array<{
      identifier:
        | { type: 'id'; id: number }
        | { type: 'name'; name: string; locationId?: number; locationPath?: string }
        | { type: 'barcode'; barcode: string; locationId?: number; locationPath?: string }
      targetLocationId: number
    }>
  }) =>
    api.post<{ success: boolean; moved: number; errors?: Array<{ row: number; error: string }> }>(
      '/collections/move',
      data
    ),
}

export interface ExportFilters {
  study: string
  specimen_type_ids?: number[]
  container_types?: string[]
  date_from?: string
  date_to?: string
  created_from?: string
  created_to?: string
  tag_ids?: number[] // Replaces state_ids
  subject_ids?: number[]
}

export interface ContainerExportData {
  container_id: number
  container_type: string
  barcode?: string
  position?: string
  label?: string
  collection_name?: string
  tags: string // Comma-separated tag names
  status: string
  comment?: string
  specimen_id: number
  specimen_type: string
  collection_date?: string
  subject_id?: number
  subject_name?: string
  control_batch_id?: number
  control_batch_name?: string
  control_definition_name?: string
  control_type?: string
  target_density?: number
  target_density_unit?: string
  strain_composition?: string
  study_id: number
  study_title: string
  study_code: string
  study_lead_person?: string
  location_path?: string
  location_root?: string
  location_level_i?: string
  location_level_ii?: string
  location_level_iii?: string
  created: string
  last_updated: string
}

export const exportApi = {
  specimens: (params?: { study?: string; source_type?: string }) =>
    api.get('/export/specimens.csv', { params, responseType: 'blob' }),
  inventory: () => api.get('/export/inventory.csv', { responseType: 'blob' }),
  containers: (params: ExportFilters, format: 'csv' | 'xlsx' | 'json' = 'csv', configName?: string) => {
    const queryParams: any = { format }
    // Add study
    queryParams.study = params.study
    // Add date filters
    if (params.date_from) queryParams.date_from = params.date_from
    if (params.date_to) queryParams.date_to = params.date_to
    if (params.created_from) queryParams.created_from = params.created_from
    if (params.created_to) queryParams.created_to = params.created_to
    // Add config_name if provided
    if (configName) queryParams.config_name = configName
    // Add arrays - axios will serialize these correctly
    if (params.specimen_type_ids && params.specimen_type_ids.length > 0) {
      queryParams.specimen_type_ids = params.specimen_type_ids
    }
    if (params.container_types && params.container_types.length > 0) {
      queryParams.container_types = params.container_types
    }
    if (params.tag_ids && params.tag_ids.length > 0) {
      queryParams.tag_ids = params.tag_ids
    }
    if (params.subject_ids && params.subject_ids.length > 0) {
      queryParams.subject_ids = params.subject_ids
    }
    return api.get('/export/containers', {
      params: queryParams,
      paramsSerializer: {
        indexes: null, // Use format: key=value1&key=value2 instead of key[]=value1&key[]=value2
      },
      responseType: format === 'json' ? 'json' : 'blob',
    })
  },
  containersCount: (params: ExportFilters) => {
    const queryParams: any = { count_only: 'true' }
    // Add study
    queryParams.study = params.study
    // Add date filters
    if (params.date_from) queryParams.date_from = params.date_from
    if (params.date_to) queryParams.date_to = params.date_to
    if (params.created_from) queryParams.created_from = params.created_from
    if (params.created_to) queryParams.created_to = params.created_to
    // Add arrays - axios will serialize these correctly
    if (params.specimen_type_ids && params.specimen_type_ids.length > 0) {
      queryParams.specimen_type_ids = params.specimen_type_ids
    }
    if (params.container_types && params.container_types.length > 0) {
      queryParams.container_types = params.container_types
    }
    if (params.tag_ids && params.tag_ids.length > 0) {
      queryParams.tag_ids = params.tag_ids
    }
    if (params.subject_ids && params.subject_ids.length > 0) {
      queryParams.subject_ids = params.subject_ids
    }
    return api.get<{ count: number }>('/export/containers', {
      params: queryParams,
      paramsSerializer: {
        indexes: null, // Use format: key=value1&key=value2 instead of key[]=value1&key[]=value2
      },
    })
  },
  availableTypes: (studyCode: string) =>
    api.get<{ specimen_types: Array<{ id: number; name: string }>; container_types: string[] }>(
      '/export/available-types',
      { params: { study: studyCode } }
    ),
  containersByNames: (params: {
    study: string
    subject_names: string[]
    subject_dates?: { [subjectName: string]: { exact?: string; from?: string; to?: string } }
    date_tolerance?: number
    format?: 'csv' | 'xlsx' | 'json'
    config_name?: string
    specimen_type_ids?: number[]
    container_types?: string[]
    date_from?: string
    date_to?: string
    created_from?: string
    created_to?: string
  }) => {
    return api.post<{
      summary: {
        total_containers: number
        subjects_with_results: Array<{ name: string; count: number }>
        subjects_no_results: string[]
        subjects_not_found: string[]
        errors?: string[]
      }
      data: ContainerExportData[] | string
      format: 'csv' | 'xlsx' | 'json'
      filename?: string
    }>('/export/containers', params)
  },
  containersCountByNames: (params: {
    study: string
    subject_names: string[]
    subject_dates?: { [subjectName: string]: { exact?: string; from?: string; to?: string } }
    date_tolerance?: number
    specimen_type_ids?: number[]
    container_types?: string[]
    date_from?: string
    date_to?: string
    created_from?: string
    created_to?: string
  }) => {
    return api.post<{
      count: number
      summary: {
        total_containers: number
        subjects_with_results: Array<{ name: string; count: number }>
        subjects_no_results: string[]
        subjects_not_found: string[]
        errors?: string[]
      }
    }>('/export/containers', { ...params, count_only: true })
  },
  validateStudyCodes: (studyCodes: string[]) => {
    return api.post<{
      valid: Array<{ code: string; id: number; title?: string; lead_person?: string }>
      invalid: string[]
      total_unique: number
      valid_count: number
      invalid_count: number
    }>('/export/containers/validate-studies', { study_codes: studyCodes })
  },
  containersByNamesMultiStudy: (params: {
    entries: Array<{
      study_short_code: string
      subject_name: string
      collection_date?: string
      date_from?: string
      date_to?: string
    }>
    subject_dates?: { [subjectName: string]: { exact?: string; from?: string; to?: string } }
    date_tolerance?: number
    format?: 'csv' | 'xlsx' | 'json'
    config_name?: string
    specimen_type_ids?: number[]
    container_types?: string[]
    date_from?: string
    date_to?: string
    created_from?: string
    created_to?: string
  }) => {
    return api.post<{
      summary: {
        total_containers: number
        studies: Array<{
          study_code: string
          study_title: string
          study_lead_person: string
          containers: number
          subjects_with_results: Array<{ name: string; count: number }>
          subjects_no_results: string[]
          subjects_not_found: string[]
        }>
        invalid_study_codes: string[]
        errors?: string[]
      }
      data: ContainerExportData[] | string
      format: 'csv' | 'xlsx' | 'json'
      filename?: string
    }>('/export/containers/multi-study', params)
  },
  containersCountByNamesMultiStudy: (params: {
    entries: Array<{
      study_short_code: string
      subject_name: string
      collection_date?: string
      date_from?: string
      date_to?: string
    }>
    date_tolerance?: number
    specimen_type_ids?: number[]
    container_types?: string[]
    date_from?: string
    date_to?: string
    created_from?: string
    created_to?: string
  }) => {
    return api.post<{
      count: number
      summary: {
        total_containers: number
        studies: Array<{
          study_code: string
          study_title: string
          study_lead_person: string
          containers: number
          subjects_with_results: Array<{ name: string; count: number }>
          subjects_no_results: string[]
          subjects_not_found: string[]
        }>
        invalid_study_codes: string[]
        errors?: string[]
      }
    }>('/export/containers/multi-study', { ...params, count_only: true })
  },
  containersByBarcodes: (params: {
    barcodes: string[]
    format?: 'csv' | 'xlsx' | 'json'
    config_name?: string
  }) => {
    return api.post<{
      summary: {
        total_containers: number
        barcodes_found: string[]
        barcodes_not_found: string[]
      }
      data: ContainerExportData[] | string
      format: 'csv' | 'xlsx' | 'json'
      filename?: string
    }>('/export/containers/by-barcodes', params)
  },
}

export interface Derivation {
  id: number
  parentContainerId: number
  childContainerId: number
  derivationType: string
  derivationDate?: string
  protocol?: string
  notes?: string
  properties?: Record<string, any> | null
}

export interface CreateDerivationPayload {
  derivationType: string
  specimenTypeName: string
  containerType: 'micronix_tube' | 'cryovial_tube' | 'paper' | 'static_well'
  quantity?: number
  unitSymbol?: string
  quantityUsed?: number
  reduceParentQuantity?: boolean
  derivationDate?: string
  protocol?: string
  notes?: string
  properties?: Record<string, any>
  collectionId?: number
   collectionName?: string
   collectionType?: 'micronix_plate' | 'cryovial_box' | 'sheet'
   collectionLocationId?: number
  sheetParentType?: 'box' | 'bag'
  sheetParentName?: string
  containerBarcode?: string
  position?: string
  operatorId?: number
}

export interface CreateDerivationResponse {
  derivation: Derivation
  parentContainer: any
  childContainer: any
  specimen: Specimen
  warnings: string[]
}

export interface DerivationCsvImportResultRow {
  index: number
  success: boolean
  error?: string
  warnings?: string[]
  derivationId?: number
  parentContainerId?: number
  childContainerId?: number
}

export const derivationsApi = {
  createFromContainer: (parentContainerId: number, payload: CreateDerivationPayload) =>
    api.post<CreateDerivationResponse>(`/containers/${parentContainerId}/derive`, payload),
  listFromContainer: (containerId: number, params?: { derivation_type?: string }) =>
    api.get<{ derivations: Derivation[]; count: number }>(`/containers/${containerId}/derivations`, {
      params,
    }),
  getSource: (containerId: number) =>
    api.get<{
      derivation: Derivation
      parentContainer: any
      parentSpecimen: Specimen
    }>(`/containers/${containerId}/source`),
  getChain: (containerId: number) =>
    api.get<{
      ancestors: Array<{ container: any; derivation: Derivation }>
      descendants: Array<{ container: any; derivation: Derivation }>
      current: any
    }>(`/containers/${containerId}/derivation-chain`),
  update: (id: number, patch: Partial<Pick<Derivation, 'derivationDate' | 'protocol' | 'notes' | 'properties'>>) =>
    api.patch<{ derivation: Derivation }>(`/derivations/${id}`, patch),
  delete: (id: number) =>
    api.delete<{ message: string }>(`/derivations/${id}`),
  importCsv: (csv: string, dryRun?: boolean) =>
    api.post<{ rows: DerivationCsvImportResultRow[] }>('/imports/derivations-csv', {
      csv,
      dryRun,
    }),
}

export const searchApi = {
  search: (query: string, type?: string) =>
    api.get<{ results: any[]; query: string; count: number }>('/search', {
      params: { q: query, type },
    }),
}

export const activityApi = {
  recent: (limit?: number) =>
    api.get<{ activity: Array<{ id: number; type: string; timestamp: string }> }>('/activity/recent', {
      params: { limit },
    }),
}

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
    byState: Record<string, number>
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
  location_root?: string
  location_level_i?: string
  location_level_ii?: string
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

// Settings interfaces
export interface ContainerDefaults {
  micronix_tube: { totalQuantity: number; remainingQuantity: number; defaultUnitSymbol: string }
  cryovial_tube: { totalQuantity: number; remainingQuantity: number; defaultUnitSymbol: string }
  paper: { totalQuantity: number; remainingQuantity: number; defaultUnitSymbol: string }
  static_well: { totalQuantity: number; remainingQuantity: number; defaultUnitSymbol: string }
}

export interface PaginationSettings {
  defaultPageSize: number
  maxPageSize: number
}

export interface PasswordRequirements {
  minLength: number
}

export interface SessionSettings {
  maxAgeSeconds: number
}

export interface ExportConfiguration {
  name: string
  columns: string[]
  isDefault?: boolean
}

export interface ExportConfigurations {
  configurations: ExportConfiguration[]
}

export interface ScannerConfiguration {
  id: string
  name: string
  barcodeColumn: string
  positionType: 'single' | 'combined'
  positionColumn?: string
  rowColumn?: string
  columnColumn?: string
  skipRows: number
  isDefault?: boolean
}

export interface ScannerConfigurations {
  configurations: ScannerConfiguration[]
}

export interface AllSettings {
  container_defaults: ContainerDefaults | null
  pagination_settings: PaginationSettings | null
  password_requirements: PasswordRequirements | null
  session_settings: SessionSettings | null
  export_configurations: ExportConfigurations | null
  scanner_configurations: ScannerConfigurations | null
}

export interface Unit {
  id: number
  symbol: string
  name: string
  category: string
}

export const settingsApi = {
  getAll: () => api.get<AllSettings>('/settings'),
  get: (key: string) => api.get<{ key: string; value: any }>(`/settings/${key}`),
  update: (key: string, value: any) => api.put<{ key: string; value: any }>(`/settings/${key}`, value),
  getUnits: () => api.get<Unit[]>('/settings/units'),
  getContainerTypeUnits: (containerType: string) =>
    api.get<{ units: Unit[] }>(`/settings/container-types/${containerType}/units`),
  addContainerTypeUnit: (containerType: string, unitId: number) =>
    api.post<{ success: boolean; unitId: number }>(`/settings/container-types/${containerType}/units`, { unitId }),
  removeContainerTypeUnit: (containerType: string, unitId: number) =>
    api.delete<{ success: boolean }>(`/settings/container-types/${containerType}/units/${unitId}`),
  getUnitsByContainerType: (containerType: string) =>
    api.get<{ units: Unit[] }>(`/settings/units/container-types/${containerType}`),
}

export const exportConfigurationsApi = {
  getAll: () => api.get<ExportConfigurations>('/settings/export_configurations'),
  update: (configs: ExportConfigurations) => api.put<ExportConfigurations>('/settings/export_configurations', configs),
}

export const scannerConfigurationsApi = {
  getAll: () => api.get<ScannerConfigurations>('/settings/scanner_configurations'),
  update: (configs: ScannerConfigurations) => api.put<ScannerConfigurations>('/settings/scanner_configurations', configs),
}

export const setupApi = {
  status: () => api.get<{ initialized: boolean }>('/setup/status'),
  initialize: (data: {
    adminName: string
    adminEmail: string
    adminPassword: string
    seedData?: boolean
    locations?: Array<{ name: string; storageTypeId?: string; description?: string }>
    specimenTypes?: Array<{ name: string }>
    units?: Array<{ name: string; symbol: string; category: string }>
    storageTypes?: Array<{ name: string; description?: string }>
    strains?: Array<{ name: string; description?: string }>
  }) => api.post<{ success: boolean; message: string }>('/setup/initialize', data),
}

export default api
