import { api } from './client'
import type { Study, StudySubject, Specimen } from './types'
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
  validateBulk: (data: { subjects: Array<{ studyShortCode: string; name: string }> }) =>
    api.post<{ valid: boolean; errors: Array<{ index: number; message: string }> }>('/subjects/bulk/validate', data),
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
