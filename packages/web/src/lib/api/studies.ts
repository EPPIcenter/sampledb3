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
  list: (search?: string, params?: { page?: number; limit?: number }) =>
    api.get<StudiesListResponse>('/studies', { params: { search, ...params } }),
  get: (id: number) => api.get<StudyResponse>(`/studies/${id}`),
  getSubjects: (id: number, params?: { page?: number; limit?: number }) =>
    api.get<SubjectsListResponse>(`/studies/${id}/subjects`, { params }),
  getSummary: (id: number) => api.get<StudySummary>(`/studies/${id}/summary`),
  getSummaries: (ids: number[]) =>
    api.get<SummariesResponse>('/studies/summaries', { params: { ids: ids.join(',') } }),
  getTimeline: (id: number) => api.get<StudyTimelineData>(`/studies/${id}/timeline`),
  create: (data: Omit<Study, 'id' | 'created' | 'lastUpdated'>) =>
    api.post<StudyResponse>('/studies', data),
  update: (
    id: number,
    data: Partial<Pick<Study, 'title' | 'leadPerson' | 'shortCode' | 'description' | 'isLongitudinal'>>
  ) => api.put<StudyResponse>(`/studies/${id}`, data),
  delete: (id: number) => api.delete<{ message: string }>(`/studies/${id}`),
}
