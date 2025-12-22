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
  compositionId?: number
  targetDensity?: number
  targetDensityUnitId?: number
  description?: string
  properties?: Record<string, any>
  created: string
  lastUpdated: string
  unitSymbol?: string
  batchCount?: number
  specimenCount?: number
  spotCount?: number
  tubeCount?: number
  inventoryTotal?: number
  strains?: Array<{ id: number; name: string }>
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
    totalAliquots: number
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
  totalAliquots: number
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
  aliquotCount: number
  totalRemainingQuantity?: number
  containerBreakdown: Record<string, number>
  unitBreakdown?: Record<string, number>
  containers?: Array<{
    id: number
    type: string
    remainingQuantity: number
    unit: string
    manifestName?: string
    position?: string
    manifestId?: number
    locationPath?: string
  }>
}

export interface InventoryItem {
  type: string
  unit: string
  totalQuantity: number
  remainingQuantity: number
  containerCount: number
  manifests?: string[]
  locationPaths?: string[]
}

export interface SubjectSummary {
  totalSpecimens: number
  totalAliquots: number
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
    specimens: Array<{ specimenTypeName: string; collectionDate?: string }>
  }) =>
    api.post<{ subject: StudySubject; specimens: Specimen[] }>('/subjects/with-specimens', data),
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

export interface State {
  id: number
  name: string
}

export interface StorageType {
  id: number
  name: string
  description?: string
}

export interface SampleType {
  id: number
  name: string
  description?: string
  parentId?: number
}

export interface Strain {
  id: number
  name: string
  description?: string
}

export interface Composition {
  id: number
  index?: number
  label: string
  legacy: number
}

export interface Location {
  id: number
  locationRoot: string
  storageTypeId: string
  description?: string
  levelI: string
  levelII: string
  levelIII?: string
  created: string
  lastUpdated: string
}

export const specimenTypesApi = {
  list: () => api.get<{ specimenTypes: SpecimenType[] }>('/specimen-types'),
  get: (id: number) => api.get<{ specimenType: SpecimenType }>(`/specimen-types/${id}`),
  create: (data: Omit<SpecimenType, 'id' | 'created' | 'lastUpdated'>) => 
    api.post<{ specimenType: SpecimenType }>('/specimen-types', data),
  update: (id: number, data: Partial<SpecimenType>) => 
    api.put<{ specimenType: SpecimenType }>(`/specimen-types/${id}`, data),
  delete: (id: number) => api.delete<{ message: string }>(`/specimen-types/${id}`),
}

export const statesApi = {
  list: () => api.get<{ states: State[] }>('/states'),
  get: (id: number) => api.get<{ state: State }>(`/states/${id}`),
  create: (data: Omit<State, 'id'>) => api.post<{ state: State }>('/states', data),
  update: (id: number, data: Partial<State>) => api.put<{ state: State }>(`/states/${id}`, data),
  delete: (id: number) => api.delete<{ message: string }>(`/states/${id}`),
}

export const storageTypesApi = {
  list: () => api.get<{ storageTypes: StorageType[] }>('/storage-types'),
  get: (id: number) => api.get<{ storageType: StorageType }>(`/storage-types/${id}`),
  create: (data: Omit<StorageType, 'id'>) => api.post<{ storageType: StorageType }>('/storage-types', data),
  update: (id: number, data: Partial<StorageType>) => api.put<{ storageType: StorageType }>(`/storage-types/${id}`, data),
  delete: (id: number) => api.delete<{ message: string }>(`/storage-types/${id}`),
}

export const sampleTypesApi = {
  list: () => api.get<{ sampleTypes: SampleType[] }>('/sample-types'),
  get: (id: number) => api.get<{ sampleType: SampleType }>(`/sample-types/${id}`),
  create: (data: Omit<SampleType, 'id'>) => api.post<{ sampleType: SampleType }>('/sample-types', data),
  update: (id: number, data: Partial<SampleType>) => api.put<{ sampleType: SampleType }>(`/sample-types/${id}`, data),
  delete: (id: number) => api.delete<{ message: string }>(`/sample-types/${id}`),
}

export const strainsApi = {
  list: () => api.get<{ strains: Strain[] }>('/strains'),
  get: (id: number) => api.get<{ strain: Strain }>(`/strains/${id}`),
  create: (data: Omit<Strain, 'id'>) => api.post<{ strain: Strain }>('/strains', data),
  update: (id: number, data: Partial<Strain>) => api.put<{ strain: Strain }>(`/strains/${id}`, data),
  delete: (id: number) => api.delete<{ message: string }>(`/strains/${id}`),
}

export const compositionsApi = {
  list: () => api.get<{ compositions: Composition[] }>('/compositions'),
  get: (id: number) => api.get<{ composition: Composition }>(`/compositions/${id}`),
  create: (data: Omit<Composition, 'id'>) => api.post<{ composition: Composition }>('/compositions', data),
  update: (id: number, data: Partial<Composition>) => api.put<{ composition: Composition }>(`/compositions/${id}`, data),
  delete: (id: number) => api.delete<{ message: string }>(`/compositions/${id}`),
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
    totalAliquots: number
    totalSpots: number
    totalTubes: number
    latestBatchDate?: string | null
    totalSpecimens: number
    inStockBatchesCount: number
    activeLocationsCount: number
  }
}

export const controlsApi = {
  list: (type?: string) => api.get<{ controls: ControlDefinition[] }>('/controls', { params: { type } }),
  get: (id: number) => api.get<{ control: ControlDefinition }>(`/controls/${id}`),
  getDefinitionSummary: (id: number) => api.get<ControlDefinitionSummaryResponse>(`/controls/${id}/summary`),
  create: (data: Omit<ControlDefinition, 'id' | 'created' | 'lastUpdated'>) => api.post<{ control: ControlDefinition }>('/controls', data),
  update: (id: number, data: Partial<ControlDefinition>) => api.patch<{ control: ControlDefinition }>(`/controls/${id}`, data),
  listAllBatches: () => api.get<{ batches: Array<ControlBatch & { definitionName?: string }> }>('/controls/batches'),
  getBatches: (id: number) => api.get<{ batches: ControlBatch[] }>(`/controls/${id}/batches`),
  createBatch: (id: number, data: Omit<ControlBatch, 'id' | 'controlDefinitionId' | 'created' | 'lastUpdated'>) => 
    api.post<{ batch: ControlBatch }>(`/controls/${id}/batches`, data),
  getBatch: (id: number) => api.get<{ batch: ControlBatch }>(`/controls/batches/${id}`),
  getBatchSummary: (id: number) => api.get<ControlBatchSummaryResponse>(`/controls/batches/${id}/summary`),
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
    return api.get<{ location: Location; contents: any; pagination?: any }>(`/locations/${id}`, { params: queryParams })
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
  resolveAliquots: (data: {
    identifiers: Array<
      | { type: 'barcode'; barcode: string }
      | { type: 'position'; sourceCollectionName: string; sourcePosition: string }
    >
  }) =>
    api.post<{ aliquots: Array<{ identifier: any; aliquot: any }> }>('/collections/aliquots/resolve', data),
  listCollectionsByType: (type: 'micronix_plate' | 'cryovial_box' | 'box' | 'bag' | 'sheet') =>
    api.get<{ collections: Array<{ id: number; name: string }> }>(`/collections/list/${type}`),
  moveAliquots: (data: {
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
      '/collections/aliquots/move',
      data
    ),
  moveSheets: (data: {
    sheetIds: number[]
    targetCollectionId: number
    targetCollectionType: 'box' | 'bag'
  }) => api.post<{ success: boolean; moved: number }>('/collections/sheets/move', data),
}

export interface ExportFilters {
  study: string
  specimen_type_ids?: number[]
  container_types?: string[]
  date_from?: string
  date_to?: string
  created_from?: string
  created_to?: string
  state_ids?: number[]
  subject_ids?: number[]
}

export interface ContainerExportData {
  container_id: number
  container_type: string
  barcode?: string
  position?: string
  state: string
  status: string
  comment?: string
  specimen_id: number
  specimen_type: string
  collection_date?: string
  subject_id?: number
  subject_name?: string
  study_id: number
  study_title: string
  study_code: string
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
  containers: (params: ExportFilters, format: 'csv' | 'xlsx' | 'json' = 'csv') => {
    const queryParams: any = { format }
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
    if (params.state_ids && params.state_ids.length > 0) {
      queryParams.state_ids = params.state_ids
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
    if (params.state_ids && params.state_ids.length > 0) {
      queryParams.state_ids = params.state_ids
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
    byState: Record<string, number>
    averagePerSpecimen: number
  }
  storage: {
    byLocation: Array<{ location: string; count: number }>
    byLocationRoot: Record<string, number>
  }
}

export interface StatisticsFilters {
  study?: string
  source_type?: string
  specimen_type_id?: string
  container_type?: string
  state_id?: string
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
    api.get<StatisticsData>('/statistics', { params: filters }),
}

export default api
