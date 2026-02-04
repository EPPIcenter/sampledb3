import axios from 'axios'
import type { ApiResponse } from '../types/api'

const api = axios.create({
  baseURL: '/api',
  withCredentials: true,
  headers: {
    'Content-Type': 'application/json',
  },
})

/**
 * Helper to extract data from standardized API response format
 */
function extractData<T>(response: { data: ApiResponse<T> }): T {
  return response.data.data
}

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

// Import property types (defined locally for web package)
interface BloodControlProperties {
  strains?: Array<{ id: number; name?: string; percentage?: number } | number>
  targetDensity?: number
  targetDensityUnitId?: number
  targetDensityUnitSymbol?: string
  targetDensityUnit?: { id: number; symbol: string } | string
}

export interface ControlDefinition {
  id: number
  name: string
  controlType: 'blood' | 'plasma_positive' | 'plasma_negative' | 'antibody' | 'extraction' | 'negative'
  description?: string
  properties?: BloodControlProperties | ControlBatchProperties | Record<string, unknown>
  created: string
  lastUpdated: string
  // Parsed from properties for convenience
  targetDensity?: number
  targetDensityUnitId?: number
  unitSymbol?: string
  batchCount?: number
  specimenCount?: number
  spotCount?: number
  micronixCount?: number
  cryovialCount?: number
  staticWellCount?: number
  tubeCount?: number
  inventoryTotal?: number
  strains?: Array<{ id: number; name: string; percentage?: number }>
}

interface ControlBatchProperties {
  [key: string]: unknown
}

interface ReagentProperties {
  [key: string]: unknown
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
  properties?: ReagentProperties
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

type StudiesListResponse = {
  studies: Study[]
  pagination?: { page: number; limit: number; total: number; totalPages: number }
}

type StudyResponse = { study: Study }
type SubjectsListResponse = {
  subjects: StudySubject[]
  pagination?: { page: number; limit: number; total: number; totalPages: number }
}
type SummariesResponse = { summaries: StudySummaryBasic[] }

export const studiesApi = {
  list: async (
    search?: string,
    params?: { page?: number; limit?: number }
  ): Promise<StudiesListResponse> => {
    const response = await api.get<StudiesListResponse>('/studies', {
      params: { search, ...params }
    })
    return response.data
  },
  get: async (id: number): Promise<StudyResponse> => {
    const response = await api.get<StudyResponse>(`/studies/${id}`)
    return response.data
  },
  getSubjects: async (
    id: number,
    params?: { page?: number; limit?: number }
  ): Promise<SubjectsListResponse> => {
    const response = await api.get<SubjectsListResponse>(`/studies/${id}/subjects`, { params })
    return response.data
  },
  getSummary: async (id: number): Promise<StudySummary> => {
    const response = await api.get<StudySummary>(`/studies/${id}/summary`)
    return response.data
  },
  getSummaries: async (ids: number[]): Promise<SummariesResponse> => {
    const response = await api.get<SummariesResponse>('/studies/summaries', {
      params: { ids: ids.join(',') }
    })
    return response.data
  },
  getTimeline: async (id: number): Promise<StudyTimelineData> => {
    const response = await api.get<StudyTimelineData>(`/studies/${id}/timeline`)
    return response.data
  },
  create: async (data: Omit<Study, 'id' | 'created' | 'lastUpdated'>): Promise<StudyResponse> => {
    const response = await api.post<StudyResponse>('/studies', data)
    return response.data
  },
  update: async (
    id: number,
    data: Partial<Pick<Study, 'title' | 'leadPerson' | 'shortCode' | 'description' | 'isLongitudinal'>>
  ): Promise<StudyResponse> => {
    const response = await api.put<StudyResponse>(`/studies/${id}`, data)
    return response.data
  },
  delete: async (id: number): Promise<{ message: string }> => {
    const response = await api.delete<{ message: string }>(`/studies/${id}`)
    return response.data
  },
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
    comment?: string | null
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

type SubjectResponse = { subject: StudySubject }

export const subjectsApi = {
  get: async (id: number): Promise<SubjectResponse> => {
    const response = await api.get<SubjectResponse>(`/subjects/${id}`)
    return response.data
  },
  getSummary: async (id: number): Promise<SubjectSummaryResponse> => {
    const response = await api.get<SubjectSummaryResponse>(`/subjects/${id}/summary`)
    return response.data
  },
  create: async (data: { studyId?: number; studyShortCode?: string; name: string }): Promise<SubjectResponse> => {
    const response = await api.post<SubjectResponse>('/subjects', data)
    return response.data
  },
  update: async (id: number, data: { name: string }): Promise<SubjectResponse> => {
    const response = await api.put<SubjectResponse>(`/subjects/${id}`, data)
    return response.data
  },
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

type SpecimensListResponse = { specimens: Specimen[] }
type SpecimenResponse = { specimen: Specimen }
type SpecimensBulkResponse = {
  specimens: Specimen[]
  created: number
  errors?: Array<{ index: number; error: string }>
}

type CreateSpecimenData = {
  sourceType: 'subject' | 'control' | 'reagent' | 'cell_line' | 'plasmid' | 'standard'
  sourceId?: number
  studyShortCode?: string
  subjectName?: string
  specimenTypeId?: number
  specimenTypeName?: string
  collectionDate?: string
  containerBarcode?: string
}

type CreateSpecimensBulkData = {
  specimens: Array<{
    sourceType: 'subject' | 'control' | 'reagent' | 'cell_line' | 'plasmid' | 'standard'
    sourceId?: number
    studyShortCode?: string
    subjectName?: string
    specimenTypeName: string
    collectionDate?: string
    containerBarcode?: string
  }>
}

export const specimensApi = {
  search: async (params?: { source_type?: string; study?: string; barcode?: string; subject_id?: string }): Promise<SpecimensListResponse> => {
    const response = await api.get<SpecimensListResponse>('/specimens', { params })
    return response.data
  },
  get: async (id: number): Promise<SpecimenResponse> => {
    const response = await api.get<SpecimenResponse>(`/specimens/${id}`)
    return response.data
  },
  create: async (data: CreateSpecimenData): Promise<SpecimenResponse> => {
    const response = await api.post<SpecimenResponse>('/specimens', data)
    return response.data
  },
  createBulk: async (data: CreateSpecimensBulkData): Promise<SpecimensBulkResponse> => {
    const response = await api.post<SpecimensBulkResponse>('/specimens/bulk', data)
    return response.data
  },
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
  list: async (): Promise<{ data: SpecimenType[]; meta?: ApiResponse<SpecimenType[]>['meta'] }> => {
    const response = await api.get<ApiResponse<SpecimenType[]>>('/specimen-types')
    return { data: extractData(response), meta: response.data.meta }
  },
  get: async (id: number) => {
    const response = await api.get<ApiResponse<SpecimenType>>(`/specimen-types/${id}`)
    return extractData(response)
  },
  create: async (data: Omit<SpecimenType, 'id' | 'created' | 'lastUpdated'>) => {
    const response = await api.post<ApiResponse<SpecimenType>>('/specimen-types', data)
    return extractData(response)
  },
  update: async (id: number, data: Partial<SpecimenType>) => {
    const response = await api.put<ApiResponse<SpecimenType>>(`/specimen-types/${id}`, data)
    return extractData(response)
  },
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
  list: async (): Promise<{ data: Tag[]; meta?: ApiResponse<Tag[]>['meta'] }> => {
    const response = await api.get<ApiResponse<Tag[]>>('/tags')
    return { data: extractData(response), meta: response.data.meta }
  },
  get: async (id: number) => {
    const response = await api.get<ApiResponse<Tag>>(`/tags/${id}`)
    return extractData(response)
  },
  create: async (data: Omit<Tag, 'id'>) => {
    const response = await api.post<ApiResponse<Tag>>('/tags', data)
    return extractData(response)
  },
  update: async (id: number, data: Partial<Tag>) => {
    const response = await api.put<ApiResponse<Tag>>(`/tags/${id}`, data)
    return extractData(response)
  },
  delete: (id: number) => api.delete<{ message: string }>(`/tags/${id}`),
}

export const storageTypesApi = {
  list: async (): Promise<{ data: StorageType[]; meta?: ApiResponse<StorageType[]>['meta'] }> => {
    const response = await api.get<ApiResponse<StorageType[]>>('/storage-types')
    return { data: extractData(response), meta: response.data.meta }
  },
  get: async (id: number) => {
    const response = await api.get<ApiResponse<StorageType>>(`/storage-types/${id}`)
    return extractData(response)
  },
  create: async (data: Omit<StorageType, 'id'>) => {
    const response = await api.post<ApiResponse<StorageType>>('/storage-types', data)
    return extractData(response)
  },
  update: async (id: number, data: Partial<StorageType>) => {
    const response = await api.put<ApiResponse<StorageType>>(`/storage-types/${id}`, data)
    return extractData(response)
  },
  delete: (id: number) => api.delete<{ message: string }>(`/storage-types/${id}`),
}

export const strainsApi = {
  list: async (): Promise<{ data: Strain[]; meta?: ApiResponse<Strain[]>['meta'] }> => {
    const response = await api.get<ApiResponse<Strain[]>>('/strains')
    return { data: extractData(response), meta: response.data.meta }
  },
  get: async (id: number) => {
    const response = await api.get<ApiResponse<Strain>>(`/strains/${id}`)
    return extractData(response)
  },
  create: async (data: Omit<Strain, 'id'>) => {
    const response = await api.post<ApiResponse<Strain>>('/strains', data)
    return extractData(response)
  },
  update: async (id: number, data: Partial<Strain>) => {
    const response = await api.put<ApiResponse<Strain>>(`/strains/${id}`, data)
    return extractData(response)
  },
  delete: (id: number) => api.delete<{ message: string }>(`/strains/${id}`),
}

export const unitsApi = {
  list: async (): Promise<{ data: Unit[]; meta?: ApiResponse<Unit[]>['meta'] }> => {
    const response = await api.get<ApiResponse<Unit[]>>('/units')
    return { data: extractData(response), meta: response.data.meta }
  },
  get: async (id: number) => {
    const response = await api.get<ApiResponse<Unit>>(`/units/${id}`)
    return extractData(response)
  },
  create: async (data: Omit<Unit, 'id'>) => {
    const response = await api.post<ApiResponse<Unit>>('/units', data)
    return extractData(response)
  },
  update: async (id: number, data: Partial<Unit>) => {
    const response = await api.put<ApiResponse<Unit>>(`/units/${id}`, data)
    return extractData(response)
  },
  delete: (id: number) => api.delete<{ message: string }>(`/units/${id}`),
}


interface CellLineProperties {
  [key: string]: unknown
}

interface PlasmidProperties {
  [key: string]: unknown
}

interface StandardProperties {
  [key: string]: unknown
}

export interface CellLine {
  id: number
  name: string
  species: string
  strain?: string
  source?: string
  properties?: CellLineProperties
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
  properties?: PlasmidProperties
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
  properties?: StandardProperties
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
  properties?: ControlBatchProperties
  created: string
  lastUpdated: string
  specimenCount?: number
  spotCount?: number
  micronixCount?: number
  cryovialCount?: number
  staticWellCount?: number
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
    micronixCount?: number
    cryovialCount?: number
    staticWellCount?: number
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
    totalMicronix: number
    totalCryovial: number
    totalStaticWells: number
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
  suggestName: (data: { controlType?: ControlDefinition['controlType']; targetDensity: number; targetDensityUnitId?: number; strains: Array<{ strainId: number; percentage: number }> }) => api.post<{ suggestedName: string; exists: boolean; existingDefinition?: ControlDefinition }>('/blood-controls/suggest-name', data),
  create: (data: Omit<ControlDefinition, 'id' | 'created' | 'lastUpdated' | 'strains'> & { strains?: Array<{ strainId: number; percentage: number }> }) => api.post<{ control: ControlDefinition }>('/blood-controls', data),
  update: (id: number, data: Partial<ControlDefinition> & { strains?: Array<{ strainId: number; percentage: number }> }) => api.patch<{ control: ControlDefinition }>(`/blood-controls/${id}`, data),
  listAllBatches: () => api.get<{ batches: Array<ControlBatch & { definitionName?: string }> }>('/blood-controls/batches'),
  getBatches: (id: number) => api.get<{ batches: ControlBatch[] }>(`/blood-controls/${id}/batches`),
  createBatch: (id: number, data: Omit<ControlBatch, 'id' | 'controlDefinitionId' | 'created' | 'lastUpdated'>) =>
    api.post<{ batch: ControlBatch }>(`/blood-controls/${id}/batches`, data),
  validateBatchName: (name: string, excludeId?: number) =>
    api.post<{ valid: boolean; error?: string; suggestion?: string }>('/blood-controls/batches/validate-name', { name, excludeId }),
  suggestBatchName: (definitionId: number, productionDate?: string) =>
    api.post<{ name: string }>('/blood-controls/batches/suggest-name', { definitionId, productionDate }),
  getBatch: (id: number) => api.get<{ batch: ControlBatch }>(`/blood-controls/batches/${id}`),
  getBatchSummary: (id: number) => api.get<ControlBatchSummaryResponse>(`/blood-controls/batches/${id}/summary`),
  createBatchWithSpecimens: (data: {
    batch: {
      controlDefinitionId: number
      name: string
      productionDate?: string
      properties?: ControlBatchProperties
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
    const params: Record<string, string | number> = {}
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
    const queryParams: Record<string, string | number | undefined> = {}
    if (params?.boxes_page) queryParams.boxes_page = params.boxes_page
    if (params?.boxes_limit) queryParams.boxes_limit = params.boxes_limit
    if (params?.plates_page) queryParams.plates_page = params.plates_page
    if (params?.plates_limit) queryParams.plates_limit = params.plates_limit
    if (params?.cryovial_boxes_page) queryParams.cryovial_boxes_page = params.cryovial_boxes_page
    if (params?.cryovial_boxes_limit) queryParams.cryovial_boxes_limit = params.cryovial_boxes_limit
    if (params?.bags_page) queryParams.bags_page = params.bags_page
    if (params?.bags_limit) queryParams.bags_limit = params.bags_limit
    return api.get<{ location: Location; contents: { micronixPlates?: Array<{ id: number; name: string; barcode?: string | null; locationId: number; itemCount?: number }>; cryovialBoxes?: Array<{ id: number; name: string; barcode?: string | null; locationId: number; itemCount?: number }>; boxes?: Array<{ id: number; name: string; locationId: number; itemCount?: number }>; bags?: Array<{ id: number; name: string; locationId: number; itemCount?: number }> }; pagination?: { page: number; limit: number; total: number; totalPages: number }; hierarchyStats?: LocationHierarchyStats }>(`/locations/${id}`, { params: queryParams })
  },
  create: (data: Omit<Location, 'id' | 'created' | 'lastUpdated'>) =>
    api.post<{ location: Location }>('/locations', data),
  update: (id: number, data: Partial<Omit<Location, 'id' | 'created' | 'lastUpdated'>>) =>
    api.put<{ location: Location }>(`/locations/${id}`, data),
  delete: (id: number) => api.delete<{ message: string }>(`/locations/${id}`),
}

// Collection response types
interface MicronixPlateResponse {
  id: number
  name: string
  barcode?: string | null
  locationId: number
  location?: Location | null
  locationPath?: string | null
  created: string
  lastUpdated: string
  createdBy?: number | null
  updatedBy?: number | null
}

interface CryovialBoxResponse {
  id: number
  name: string
  barcode?: string | null
  locationId: number
  location?: Location | null
  locationPath?: string | null
  created: string
  lastUpdated: string
  createdBy?: number | null
  updatedBy?: number | null
}

interface BoxResponse {
  id: number
  name: string
  locationId: number
  location?: Location | null
  locationPath?: string | null
  created: string
  lastUpdated: string
  createdBy?: number | null
  updatedBy?: number | null
}

interface BagResponse {
  id: number
  name: string
  locationId: number
  location?: Location | null
  locationPath?: string | null
  created: string
  lastUpdated: string
  createdBy?: number | null
  updatedBy?: number | null
}

interface SheetResponse {
  id: number
  name: string
  boxId?: number | null
  bagId?: number | null
  location?: Location | null
  locationPath?: string | null
  box?: { id: number; name: string } | null
  bag?: { id: number; name: string } | null
  created: string
  lastUpdated: string
  createdBy?: number | null
  updatedBy?: number | null
}

interface WellEntry {
  type: 'micronix_tube' | 'static_well'
  id: number
  barcode?: string | null
  position?: string | null
  container?: unknown
}

interface CryovialTubeEntry {
  kind: 'cryovial_tube'
  id: number
  barcode?: string | null
  position?: string | null
  container?: unknown
}

interface PaperEntry {
  type: 'paper'
  id: number
  barcode?: string | null
  position?: string | null
  container?: unknown
}

export const collectionsApi = {
  getMicronixPlate: (id: number) =>
    api.get<{ plate: MicronixPlateResponse; wells: Record<string, WellEntry> }>(`/collections/plates/micronix/${id}`),
  getCryovialBox: (id: number) =>
    api.get<{ box: CryovialBoxResponse; positions: Record<string, CryovialTubeEntry[]> }>(`/collections/boxes/cryovial/${id}`),
  getBox: (id: number) =>
    api.get<{ box: BoxResponse; contents: { sheets: Array<SheetResponse & { papers: PaperEntry[] }> } }>(`/collections/boxes/${id}`),
  getBag: (id: number) =>
    api.get<{ bag: BagResponse; contents: { sheets: Array<SheetResponse & { papers: PaperEntry[] }> } }>(`/collections/bags/${id}`),
  getSheet: (id: number) =>
    api.get<{ sheet: SheetResponse; papers: PaperEntry[] }>(`/collections/sheets/${id}`),
  check: (data: { collections: Array<{ identifier: string; type: 'micronix_plate' | 'cryovial_box' | 'box' | 'bag' | 'sheet' }> }) =>
    api.post<{ results: Array<{ identifier: string; type: string; exists: boolean; id: number | null }> }>('/collections/check', data),
  createMicronixPlate: (data: { name: string; locationId: number; barcode?: string }) =>
    api.post<{ plate: MicronixPlateResponse }>('/collections/plates/micronix', data),
  createCryovialBox: (data: { name: string; locationId: number; barcode?: string }) =>
    api.post<{ box: CryovialBoxResponse }>('/collections/boxes/cryovial', data),
  createBox: (data: { name: string; locationId: number }) =>
    api.post<{ box: BoxResponse }>('/collections/boxes', data),
  createBag: (data: { name: string; locationId: number }) =>
    api.post<{ bag: BagResponse }>('/collections/bags', data),
  resolveContainers: (data: {
    identifiers: Array<
      | { type: 'barcode'; barcode: string }
      | { type: 'position'; sourceCollectionName: string; sourcePosition: string }
    >
  }) =>
    api.post<{ containers: Array<{ identifier: { type: string; value: string } | string; container: unknown }> }>('/collections/containers/resolve', data),
  listCollectionsByType: (type: 'micronix_plate' | 'cryovial_box' | 'box' | 'bag' | 'sheet') =>
    api.get<{ collections: Array<{ id: number; name: string; locationId?: number | null; itemCount?: number; location?: { id: number; path: string | null } | null }> }>(`/collections/list/${type}`),
  listAllCollections: () =>
    api.get<{ collections: Array<{ id: number; name: string; type: 'micronix_plate' | 'cryovial_box' | 'box' | 'bag'; barcode: string | null; locationId: number | null; itemCount: number; location: { id: number; path: string | null } | null }> }>('/collections/list-all'),
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
  created: string
  last_updated: string
}

export interface CSVExportOptions {
  delimiter?: ',' | ';' | '\t'
  includeBOM?: boolean
  lineEnding?: 'LF' | 'CRLF'
}

export const exportApi = {
  specimens: (params?: { study?: string; source_type?: string; csv_delimiter?: ',' | ';' | '\t'; csv_bom?: boolean; csv_line_ending?: 'LF' | 'CRLF' }) => {
    const queryParams: any = { ...params }
    if (params?.csv_delimiter) queryParams.csv_delimiter = params.csv_delimiter
    if (params?.csv_bom !== undefined) queryParams.csv_bom = params.csv_bom
    if (params?.csv_line_ending) queryParams.csv_line_ending = params.csv_line_ending
    return api.get('/export/specimens.csv', { params: queryParams, responseType: 'blob' })
  },
  inventory: (csvOptions?: CSVExportOptions) => {
    const params: any = {}
    if (csvOptions?.delimiter) params.csv_delimiter = csvOptions.delimiter
    if (csvOptions?.includeBOM !== undefined) params.csv_bom = csvOptions.includeBOM
    if (csvOptions?.lineEnding) params.csv_line_ending = csvOptions.lineEnding
    return api.get('/export/inventory.csv', { params, responseType: 'blob' })
  },
  containers: (params: ExportFilters, format: 'csv' | 'xlsx' | 'json' = 'csv', columns?: string[], csvOptions?: CSVExportOptions) => {
    const queryParams: Record<string, string | number | number[] | string[] | undefined> = { format }
    // Add study
    queryParams.study = params.study
    // Add date filters
    if (params.date_from) queryParams.date_from = params.date_from
    if (params.date_to) queryParams.date_to = params.date_to
    if (params.created_from) queryParams.created_from = params.created_from
    if (params.created_to) queryParams.created_to = params.created_to
    // Add columns if provided
    if (columns && columns.length > 0) queryParams.columns = JSON.stringify(columns)
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
    // Add CSV options if provided
    if (csvOptions) {
      if (csvOptions.delimiter) queryParams.csv_delimiter = csvOptions.delimiter
      if (csvOptions.includeBOM !== undefined) queryParams.csv_bom = csvOptions.includeBOM ? 'true' : 'false'
      if (csvOptions.lineEnding) queryParams.csv_line_ending = csvOptions.lineEnding
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
    const queryParams: Record<string, string | number | number[] | string[] | undefined> = { count_only: 'true' }
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
    columns?: string[]
    specimen_type_ids?: number[]
    container_types?: string[]
    date_from?: string
    date_to?: string
    created_from?: string
    created_to?: string
    csv_delimiter?: ',' | ';' | '\t'
    csv_bom?: boolean
    csv_line_ending?: 'LF' | 'CRLF'
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
    columns?: string[]
    specimen_type_ids?: number[]
    container_types?: string[]
    date_from?: string
    date_to?: string
    created_from?: string
    created_to?: string
    csv_delimiter?: ',' | ';' | '\t'
    csv_bom?: boolean
    csv_line_ending?: 'LF' | 'CRLF'
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
    columns?: string[]
    csv_delimiter?: ',' | ';' | '\t'
    csv_bom?: boolean
    csv_line_ending?: 'LF' | 'CRLF'
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

interface DerivationProperties {
  [key: string]: unknown
}

export interface Derivation {
  id: number
  parentContainerId: number
  childContainerId: number
  derivationType: string
  derivationDate?: string
  protocol?: string
  notes?: string
  properties?: DerivationProperties | null
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
  properties?: DerivationProperties
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
  collectionStatus?: 'existing' | 'will_be_created'
}

export interface BulkDerivationSettings {
  derivationType: string
  specimenTypeName: string
  containerType: 'micronix_tube' | 'cryovial_tube' | 'paper'
  protocol: string
  derivationDate: string
  quantity?: number
  unitSymbol?: string
  quantityUsed?: number
  reduceParentQuantity?: boolean
  validateSourceSpecimenType?: boolean
  validateParentQuantity?: boolean
}

export interface CollectionStatus {
  name?: string
  barcode?: string
  status: 'existing' | 'will_be_created'
  containerType: 'micronix_tube' | 'cryovial_tube' | 'paper'
}

export interface ValidationResult {
  rows: Array<{
    index: number
    valid: boolean
    error?: string
    warnings?: string[]
    parentContainerId?: number
    collectionStatus?: 'existing' | 'will_be_created'
  }>
  collections: CollectionStatus[]
  summary: {
    total: number
    valid: number
    invalid: number
    warnings: number
  }
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
  importCsv: (csv: string, options?: { dryRun?: boolean; settings?: BulkDerivationSettings }) =>
    api.post<{ rows: DerivationCsvImportResultRow[] }>('/imports/derivations-csv', {
      csv,
      dryRun: options?.dryRun,
      settings: options?.settings,
    }),
  validateCsv: (csv: string, settings?: BulkDerivationSettings) =>
    api.post<ValidationResult>('/imports/derivations-csv/validate', {
      csv,
      settings,
    }),
}

/**
 * Search result types from the unified search API
 */
export type SearchResultType = 
  | 'specimen'
  | 'container'
  | 'study'
  | 'subject'
  | 'micronix_plate'
  | 'cryovial_box'
  | 'box'
  | 'bag'
  | 'control_batch'

/**
 * Base search result structure
 */
export interface BaseSearchResult {
  type: SearchResultType
  id: number
  title: string
  subtitle: string
  url: string
  data: unknown
}

/**
 * Collection search results (plates, boxes, bags) include additional fields
 */
export interface CollectionSearchResult extends BaseSearchResult {
  type: 'micronix_plate' | 'cryovial_box' | 'box' | 'bag'
  name: string // Always present for collection types
  barcode?: string | null
  locationId?: number | null
  locationPath?: string | null
}

/**
 * Union type for all possible search results
 */
export type SearchResult = BaseSearchResult | CollectionSearchResult

/**
 * Search API response
 */
export interface SearchResponse {
  results: SearchResult[]
  query: string
  count: number
}

export const searchApi = {
  search: (query: string, type?: string) =>
    api.get<SearchResponse>('/search', {
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

// Settings value discriminated union
export type SettingValue =
  | { type: 'container_defaults'; value: ContainerDefaults }
  | { type: 'pagination_settings'; value: PaginationSettings }
  | { type: 'password_requirements'; value: PasswordRequirements }
  | { type: 'session_settings'; value: SessionSettings }
  | { type: 'export_configurations'; value: ExportConfigurations }
  | { type: 'scanner_configurations'; value: ScannerConfigurations }

// Helper type to extract setting value by key
export type SettingValueByKey<T extends string> =
  T extends 'container_defaults' ? ContainerDefaults :
  T extends 'pagination_settings' ? PaginationSettings :
  T extends 'password_requirements' ? PasswordRequirements :
  T extends 'session_settings' ? SessionSettings :
  T extends 'export_configurations' ? ExportConfigurations :
  T extends 'scanner_configurations' ? ScannerConfigurations :
  never

export const settingsApi = {
  getAll: () => api.get<AllSettings>('/settings'),
  get: <T extends keyof AllSettings>(key: T): Promise<{ data: { key: T; value: AllSettings[T] } }> => 
    api.get<{ key: T; value: AllSettings[T] }>(`/settings/${key}`),
  update: <T extends keyof AllSettings>(key: T, value: AllSettings[T], userId?: number | null): Promise<{ data: { key: T; value: AllSettings[T]; userId?: number | null } }> =>
    api.put<{ key: T; value: AllSettings[T]; userId?: number | null }>(`/settings/${key}`, { ...value, userId }),
  resetUserSetting: (key: string): Promise<{ data: { success: boolean; message: string } }> =>
    api.delete<{ success: boolean; message: string }>(`/settings/${key}/user`),
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
  getShared: () => api.get<ExportConfigurations>('/settings/export-configurations/shared'),
  getPersonal: () => api.get<ExportConfigurations>('/settings/export-configurations/personal'),
  update: (configs: ExportConfigurations, userId?: number | null) => 
    api.put<ExportConfigurations>('/settings/export_configurations', { ...configs, userId }),
  createPersonal: (config: ExportConfiguration) => 
    api.post<{ success: boolean; config: ExportConfiguration }>('/settings/export-configurations/personal', config),
  updatePersonal: (configs: ExportConfigurations) => 
    api.put<{ success: boolean; configurations: ExportConfiguration[] }>('/settings/export-configurations/personal', configs),
}

export const scannerConfigurationsApi = {
  getAll: () => api.get<ScannerConfigurations>('/settings/scanner_configurations'),
  getShared: () => api.get<ScannerConfigurations>('/settings/scanner-configurations/shared'),
  getPersonal: () => api.get<ScannerConfigurations>('/settings/scanner-configurations/personal'),
  update: (configs: ScannerConfigurations, userId?: number | null) => 
    api.put<ScannerConfigurations>('/settings/scanner_configurations', { ...configs, userId }),
  createPersonal: (config: ScannerConfiguration) => 
    api.post<{ success: boolean; config: ScannerConfiguration }>('/settings/scanner-configurations/personal', config),
  updatePersonal: (configs: ScannerConfigurations) => 
    api.put<{ success: boolean; configurations: ScannerConfiguration[] }>('/settings/scanner-configurations/personal', configs),
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

export interface User {
  id: number
  email: string
  username?: string
  name: string
  role: 'admin' | 'member' | 'viewer'
  createdAt?: string
  lastLogin?: string
  deletedAt?: string
}

export interface UserSession {
  id: string
  expiresAt: number
}

export interface AdminSystemStats {
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

export const authApi = {
  login: (emailOrUsername: string, password: string) =>
    api.post<{ user: User }>('/auth/login', { emailOrUsername, password }),
  logout: () => api.post<{ message: string }>('/auth/logout'),
  getCurrentUser: () => api.get<{ user: User }>('/auth/current'),
  switchUser: (userId: number, password: string) =>
    api.post<{ user: User }>('/auth/switch', { userId, password }),
  updateProfile: (data: { name?: string; email?: string; username?: string | null }) =>
    api.patch<{ user: User }>('/auth/me', data),
  changePassword: (data: { currentPassword: string; newPassword: string }) =>
    api.patch<{ message: string }>('/auth/me/password', data),
}

export const adminApi = {
  getUsers: (includeDeleted = false) =>
    api.get<{ users: User[] }>('/auth/users', { params: { includeDeleted } }),
  createUser: (data: { email: string; name: string; password: string; role?: 'admin' | 'member' | 'viewer' }) =>
    api.post<{ user: User }>('/auth/register', data),
  updateUser: (id: number, data: { name?: string; email?: string; role?: 'admin' | 'member' | 'viewer' }) =>
    api.put<{ user: User }>(`/auth/users/${id}`, data),
  deleteUser: (id: number) =>
    api.delete<{ message: string }>(`/auth/users/${id}`),
  restoreUser: (id: number) =>
    api.post<{ user: User }>(`/auth/users/${id}/restore`),
  resetPassword: (id: number, password: string) =>
    api.patch<{ message: string }>(`/auth/users/${id}/password`, { password }),
  getUserSessions: (userId: number) =>
    api.get<{ sessions: UserSession[] }>(`/auth/users/${userId}/sessions`),
  revokeSession: (sessionId: string) =>
    api.delete<{ message: string }>(`/auth/sessions/${sessionId}`),
  getSystemStats: () =>
    api.get<AdminSystemStats>('/statistics/admin'),
}

export interface ErrorLog {
  id: number
  timestamp: string
  source: 'frontend' | 'backend'
  level: 'error' | 'warning' | 'info'
  message: string
  errorCode?: string
  stack?: string
  context?: Record<string, unknown>
  userId?: number
  url?: string
  userAgent?: string
  resolved: boolean
  resolvedAt?: string
  resolvedBy?: number
}

export interface ErrorLogsResponse {
  logs: ErrorLog[]
  pagination: {
    page: number
    limit: number
    total: number
    totalPages: number
  }
}

export interface ErrorLogsQueryParams {
  source?: 'frontend' | 'backend'
  level?: 'error' | 'warning' | 'info'
  resolved?: boolean
  page?: number
  limit?: number
  search?: string
}

export interface CleanupResponse {
  success: boolean
  deleted: number
  retentionDays: number
  message: string
}

// qPCR experiments
export interface QpcrExperimentTarget {
  id: number
  targetName: string
  fluorophore: string | null
  reporter: string | null
  sortOrder: number
}

export interface QpcrExperiment {
  id: number
  name: string | null
  templateFormat: 'biorad' | 'quant_studio'
  status: 'setup' | 'in_progress' | 'results_uploaded'
  standardLayout: Record<string, unknown> | null
  plateBarcode?: string | null
  instrumentType?: string | null
  created: string
  lastUpdated: string
  createdBy: number | null
  updatedBy: number | null
  /** Targets (multiplex); present on detail and list. */
  targets?: QpcrExperimentTarget[]
  /** Present when listing experiments (GET /qpcr-experiments). */
  wellCount?: number
  /** Present when listing experiments (GET /qpcr-experiments). */
  runCount?: number
  /** Present when listing experiments; ISO date of latest run. */
  lastRunAt?: string | null
}

export type QpcrExperimentWellSource =
  | { type: 'subject'; id: number; name: string; study: { id: number; title: string; code: string } }
  | { type: 'control'; id: number; name: string; definitionName: string | null; controlType: string }
  | null

export interface QpcrExperimentWell {
  id: number
  qpcrExperimentId: number
  wellPosition: string
  barcode: string | null
  storageContainerId: number | null
  specimenId: number | null
  contentType: 'standard' | 'unknown' | 'negative' | null
  standardDensity: number | null
  cq: number | null
  startingQuantity: number | null
  cqMean: number | null
  rawSampleName: string | null
  source?: QpcrExperimentWellSource
}

export interface QpcrExperimentDetailResponse {
  experiment: QpcrExperiment
  wells: QpcrExperimentWell[]
}

export const qpcrExperimentsApi = {
  list: (params?: { status?: string }) =>
    api.get<{ experiments: QpcrExperiment[] }>('/qpcr-experiments', { params }),
  get: (id: number) =>
    api.get<QpcrExperimentDetailResponse>(`/qpcr-experiments/${id}`),
  create: (data: { name?: string | null; templateFormat: 'biorad' | 'quant_studio'; standardLayout?: Record<string, unknown> | null }) =>
    api.post<QpcrExperiment>('/qpcr-experiments', data),
  update: (id: number, data: { name?: string | null; standardLayout?: Record<string, unknown> | null; status?: 'setup' | 'in_progress' | 'results_uploaded'; targets?: Array<{ targetName: string; fluorophore?: string | null; reporter?: string | null }>; instrumentType?: string | null }) =>
    api.patch<QpcrExperiment>(`/qpcr-experiments/${id}`, data),
  uploadPlate: (id: number, data: { csvText: string; scannerConfigurationId: string; plateBarcode?: string | null }) =>
    api.post<{ wells: QpcrExperimentWell[]; unresolved: Array<{ wellPosition: string; barcode: string }> }>(`/qpcr-experiments/${id}/plate`, data),
  updateWells: (id: number, data: { wellPosition?: string; positions?: string[]; contentType: 'empty' | 'negative' }) =>
    api.patch<{ wells: QpcrExperimentWell[] }>(`/qpcr-experiments/${id}/wells`, data),
  uploadResults: (id: number, data: { fileContent: string; fileName: string; instrumentType: 'Biorad_CFX' | 'QuantStudio' }) =>
    api.post<{ run: { id: number }; wellResultCount: number; amplificationCount: number }>(`/qpcr-experiments/${id}/results`, data),
  delete: (id: number) =>
    api.delete<void>(`/qpcr-experiments/${id}`),
}

export const errorLogsApi = {
  list: (params?: ErrorLogsQueryParams) =>
    api.get<ErrorLogsResponse>('/error-logs', { params }),
  get: (id: number) =>
    api.get<ErrorLog>(`/error-logs/${id}`),
  resolve: (id: number) =>
    api.patch<{ success: boolean }>(`/error-logs/${id}/resolve`),
  cleanup: (retentionDays?: number) =>
    api.post<CleanupResponse>('/error-logs/cleanup', retentionDays ? { retentionDays } : {}),
}

export default api
