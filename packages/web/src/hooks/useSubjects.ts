import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { subjectsApi, type SubjectSummaryResponse } from '../lib/api/subjects'
import { studyKeys } from './useStudies'
import { specimenKeys } from './useSpecimens'

export const subjectKeys = {
  all: ['subjects'] as const,
  details: () => [...subjectKeys.all, 'detail'] as const,
  detail: (id: number) => [...subjectKeys.details(), id] as const,
  summary: (id: number) => [...subjectKeys.detail(id), 'summary'] as const,
}

export function useSubject(id: number) {
  return useQuery({
    queryKey: subjectKeys.detail(id),
    queryFn: async () => {
      const res = await subjectsApi.get(id)
      return res.subject
    },
    enabled: !!id,
  })
}

export function useSubjectSummary(id: number) {
  return useQuery({
    queryKey: subjectKeys.summary(id),
    queryFn: async () => {
      const res = await subjectsApi.getSummary(id)
      return res
    },
    enabled: !!id,
  })
}

export function useCreateSubject() {
  const queryClient = useQueryClient()
  
  return useMutation({
    mutationFn: async (data: { studyId?: number; studyShortCode?: string; name: string }) => {
      const res = await subjectsApi.create(data)
      return res.subject
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: subjectKeys.detail(data.id) })
      if (data.studyId) {
        queryClient.invalidateQueries({ queryKey: [...studyKeys.detail(data.studyId), 'subjects'] })
        queryClient.invalidateQueries({ queryKey: [...studyKeys.detail(data.studyId), 'summary'] })
      }
    },
  })
}

export function useUpdateSubject() {
  const queryClient = useQueryClient()
  
  return useMutation({
    mutationFn: async ({ id, data }: { id: number; data: { name: string } }) => {
      const res = await subjectsApi.update(id, data)
      return res.subject
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: subjectKeys.detail(data.id) })
      queryClient.invalidateQueries({ queryKey: subjectKeys.summary(data.id) })
      if (data.studyId) {
        queryClient.invalidateQueries({ queryKey: [...studyKeys.detail(data.studyId), 'subjects'] })
        queryClient.invalidateQueries({ queryKey: [...studyKeys.detail(data.studyId), 'summary'] })
      }
    },
  })
}

export function invalidateSubjectDetail(queryClient: ReturnType<typeof useQueryClient>, subjectId: number, studyId?: number) {
  void queryClient.invalidateQueries({ queryKey: subjectKeys.summary(subjectId) })
  void queryClient.invalidateQueries({ queryKey: subjectKeys.detail(subjectId) })
  void queryClient.invalidateQueries({ queryKey: specimenKeys.lists() })
  if (studyId) {
    void queryClient.invalidateQueries({ queryKey: [...studyKeys.detail(studyId), 'subjects'] })
    void queryClient.invalidateQueries({ queryKey: [...studyKeys.detail(studyId), 'summary'] })
  }
}

