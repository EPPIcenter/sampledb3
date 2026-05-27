import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { studiesApi, type Study } from '../lib/api/studies'
import { useToast } from '../contexts/ToastContext'

export const studyKeys = {
  all: ['studies'] as const,
  lists: () => [...studyKeys.all, 'list'] as const,
  list: (filters?: { search?: string; page?: number; limit?: number }) => 
    [...studyKeys.lists(), filters] as const,
  details: () => [...studyKeys.all, 'detail'] as const,
  detail: (id: number) => [...studyKeys.details(), id] as const,
}

export function useStudies(search?: string, params?: { page?: number; limit?: number }) {
  const { error: showError } = useToast()
  
  return useQuery({
    queryKey: studyKeys.list({ search, ...params }),
    queryFn: async () => {
      try {
        const res = await studiesApi.list(search, params)
        return res
      } catch (err: any) {
        showError(err.response?.data?.error || 'Failed to load studies')
        throw err
      }
    },
  })
}

export function useStudy(id: number) {
  return useQuery({
    queryKey: studyKeys.detail(id),
    queryFn: async () => {
      const res = await studiesApi.get(id)
      return res.study
    },
    enabled: !!id,
  })
}

export function useStudySubjects(studyId: number, params?: { page?: number; limit?: number }) {
  return useQuery({
    queryKey: [...studyKeys.detail(studyId), 'subjects', params],
    queryFn: async () => {
      const res = await studiesApi.getSubjects(studyId, params)
      return res
    },
    enabled: !!studyId,
  })
}

export function useCreateStudy() {
  const queryClient = useQueryClient()
  const { success, error: showError } = useToast()
  
  return useMutation({
    mutationFn: async (data: Omit<Study, 'id' | 'created' | 'lastUpdated'>) => {
      try {
        const res = await studiesApi.create(data)
        return res.study
      } catch (err: any) {
        showError(err.response?.data?.error || 'Failed to create study')
        throw err
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: studyKeys.lists() })
      success('Study created successfully')
    },
    onError: () => {
      // Error already shown in mutationFn
    },
  })
}

export function useUpdateStudy() {
  const queryClient = useQueryClient()
  const { success, error: showError } = useToast()
  
  return useMutation({
    mutationFn: async ({ id, data }: { 
      id: number
      data: Partial<Pick<Study, 'title' | 'leadPerson' | 'shortCode' | 'description' | 'isLongitudinal'>>
    }) => {
      try {
        const res = await studiesApi.update(id, data)
        return res.study
      } catch (err: any) {
        showError(err.response?.data?.error || 'Failed to update study')
        throw err
      }
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: studyKeys.detail(data.id) })
      queryClient.invalidateQueries({ queryKey: studyKeys.lists() })
      success('Study updated successfully')
    },
    onError: () => {
      // Error already shown in mutationFn
    },
  })
}



