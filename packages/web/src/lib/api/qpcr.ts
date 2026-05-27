import { api } from './client'
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
  list: (params?: { status?: string; limit?: number }) =>
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
