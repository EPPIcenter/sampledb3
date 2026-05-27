import { api } from './client'
import type { Study, StudySubject } from './types'

export type { Study, StudySubject } from './types'
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
