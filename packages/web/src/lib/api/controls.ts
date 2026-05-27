import { api } from './client'
import type { SubjectSummary, SubjectSummarySpecimen, SubjectSummaryResponse } from './subjects'
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
  /** Create or get multiple definitions for same composition at multiple densities. Returns 201 with controls array. names[] (same length as targetDensities) is required and used when creating new definitions. */
  createDefinitionsBulk: (data: { strains: Array<{ strainId: number; percentage: number }>; targetDensities: number[]; targetDensityUnitId?: number; names: string[] }) =>
    api.post<{ controls: ControlDefinition[] }>('/blood-controls/definitions/bulk', data),
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
  updateBatch: (id: number, data: { name?: string; productionDate?: string; properties?: Record<string, any> }) => api.patch<{ batch: ControlBatch }>(`/blood-controls/batches/${id}`, data),
  deleteSpecimenFromBatch: (batchId: number, specimenId: number) => api.delete<{ message: string }>(`/blood-controls/batches/${batchId}/specimens/${specimenId}`),
  deleteBatch: (id: number) => api.delete<{ message: string }>(`/blood-controls/batches/${id}`),
}

