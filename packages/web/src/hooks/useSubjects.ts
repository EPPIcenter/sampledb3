import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { subjectsApi, type StudySubject, type SubjectSummaryResponse } from '../lib/api'

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
      return res.data.subject
    },
    enabled: !!id,
  })
}

export function useSubjectSummary(id: number) {
  return useQuery({
    queryKey: subjectKeys.summary(id),
    queryFn: async () => {
      const res = await subjectsApi.getSummary(id)
      return res.data
    },
    enabled: !!id,
  })
}

export function useCreateSubject() {
  const queryClient = useQueryClient()
  
  return useMutation({
    mutationFn: async (data: { studyId?: number; studyShortCode?: string; name: string }) => {
      const res = await subjectsApi.create(data)
      return res.data.subject
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: subjectKeys.detail(data.id) })
    },
  })
}

export function useUpdateSubject() {
  const queryClient = useQueryClient()
  
  return useMutation({
    mutationFn: async ({ id, data }: { id: number; data: { name: string } }) => {
      const res = await subjectsApi.update(id, data)
      return res.data.subject
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: subjectKeys.detail(data.id) })
      queryClient.invalidateQueries({ queryKey: subjectKeys.summary(data.id) })
    },
  })
}



