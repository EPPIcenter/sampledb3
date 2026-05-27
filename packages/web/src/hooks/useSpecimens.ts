import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '../lib/api/client'
import { specimensApi } from '../lib/api/specimens'
import type { Specimen } from '../lib/api/types'
import { useToast } from '../contexts/ToastContext'

export const specimenKeys = {
  all: ['specimens'] as const,
  lists: () => [...specimenKeys.all, 'list'] as const,
  list: (filters?: {
    source_type?: string
    study?: string
    barcode?: string
    subject_id?: string
  }) => [...specimenKeys.lists(), filters] as const,
  details: () => [...specimenKeys.all, 'detail'] as const,
  detail: (id: number) => [...specimenKeys.details(), id] as const,
  containers: (specimenId: string | number) => ['containers', 'specimen', specimenId] as const,
}

export function useSpecimens(filters?: {
  source_type?: string
  study?: string
  barcode?: string
  subject_id?: string
}) {
  return useQuery({
    queryKey: specimenKeys.list(filters),
    queryFn: async () => {
      const res = await specimensApi.search(filters)
      return res.specimens
    },
  })
}

export function useSpecimen(id: number) {
  return useQuery({
    queryKey: specimenKeys.detail(id),
    queryFn: async () => {
      const res = await specimensApi.get(id)
      return res.specimen
    },
    enabled: !!id,
  })
}

export function useContainersForSpecimen(specimenId: string | number | undefined) {
  return useQuery({
    queryKey: specimenKeys.containers(specimenId!),
    queryFn: async () => {
      const res = await api.get<{ containers: unknown[] }>('/containers', {
        params: { specimen_id: specimenId },
      })
      const data = res.data as { containers?: unknown[] } | undefined
      return data?.containers ?? []
    },
    enabled: !!specimenId,
  })
}

export function useCreateSpecimen() {
  const queryClient = useQueryClient()
  const { success, error: showError } = useToast()
  
  return useMutation({
    mutationFn: async (data: {
      sourceType: 'subject' | 'control' | 'reagent' | 'cell_line' | 'plasmid' | 'standard'
      sourceId?: number
      studyShortCode?: string
      subjectName?: string
      specimenTypeId?: number
      specimenTypeName?: string
      collectionDate?: string
      containerBarcode?: string
    }) => {
      try {
        const res = await specimensApi.create(data)
        return res.specimen
      } catch (err: any) {
        showError(err.response?.data?.error || 'Failed to create specimen')
        throw err
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: specimenKeys.lists() })
      success('Specimen created successfully')
    },
    onError: () => {
      // Error already shown in mutationFn
    },
  })
}



