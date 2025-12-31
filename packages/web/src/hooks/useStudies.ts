import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { studiesApi, type Study, type StudySummary, type StudyTimelineData, type StudySummaryBasic } from '../lib/api'

export const studyKeys = {
  all: ['studies'] as const,
  lists: () => [...studyKeys.all, 'list'] as const,
  list: (filters?: { search?: string; page?: number; limit?: number }) => 
    [...studyKeys.lists(), filters] as const,
  details: () => [...studyKeys.all, 'detail'] as const,
  detail: (id: number) => [...studyKeys.details(), id] as const,
  summary: (id: number) => [...studyKeys.detail(id), 'summary'] as const,
  timeline: (id: number) => [...studyKeys.detail(id), 'timeline'] as const,
  summaries: (ids: number[]) => [...studyKeys.all, 'summaries', ids] as const,
}

export function useStudies(search?: string, params?: { page?: number; limit?: number }) {
  return useQuery({
    queryKey: studyKeys.list({ search, ...params }),
    queryFn: async () => {
      const res = await studiesApi.list(search, params)
      return res.data
    },
  })
}

export function useStudy(id: number) {
  return useQuery({
    queryKey: studyKeys.detail(id),
    queryFn: async () => {
      const res = await studiesApi.get(id)
      return res.data.study
    },
    enabled: !!id,
  })
}

export function useStudySubjects(studyId: number, params?: { page?: number; limit?: number }) {
  return useQuery({
    queryKey: [...studyKeys.detail(studyId), 'subjects', params],
    queryFn: async () => {
      const res = await studiesApi.getSubjects(studyId, params)
      return res.data
    },
    enabled: !!studyId,
  })
}

export function useStudySummary(studyId: number) {
  return useQuery({
    queryKey: studyKeys.summary(studyId),
    queryFn: async () => {
      const res = await studiesApi.getSummary(studyId)
      return res.data
    },
    enabled: !!studyId,
  })
}

export function useStudyTimeline(studyId: number) {
  return useQuery({
    queryKey: studyKeys.timeline(studyId),
    queryFn: async () => {
      const res = await studiesApi.getTimeline(studyId)
      return res.data
    },
    enabled: !!studyId,
  })
}

export function useStudySummaries(ids: number[]) {
  return useQuery({
    queryKey: studyKeys.summaries(ids),
    queryFn: async () => {
      const res = await studiesApi.getSummaries(ids)
      return res.data.summaries
    },
    enabled: ids.length > 0,
  })
}

export function useCreateStudy() {
  const queryClient = useQueryClient()
  
  return useMutation({
    mutationFn: async (data: Omit<Study, 'id' | 'created' | 'lastUpdated'>) => {
      const res = await studiesApi.create(data)
      return res.data.study
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: studyKeys.lists() })
    },
  })
}

export function useUpdateStudy() {
  const queryClient = useQueryClient()
  
  return useMutation({
    mutationFn: async ({ id, data }: { 
      id: number
      data: Partial<Pick<Study, 'title' | 'leadPerson' | 'shortCode' | 'description' | 'isLongitudinal'>>
    }) => {
      const res = await studiesApi.update(id, data)
      return res.data.study
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: studyKeys.detail(data.id) })
      queryClient.invalidateQueries({ queryKey: studyKeys.lists() })
    },
  })
}



