import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '../lib/api/client'
import { specimensApi, type SpecimenListParams } from '../lib/api/specimens'
import type { Specimen } from '../lib/api/types'
import { useToast } from '../contexts/ToastContext'

export type SpecimenSourceInfo = {
  type: string
  id: number
  name: string
  study?: {
    id: number
    title: string
    code: string
  }
  definition?: {
    id: number
    name: string
  }
}

export const specimenKeys = {
  all: ['specimens'] as const,
  lists: () => [...specimenKeys.all, 'list'] as const,
  list: (filters?: SpecimenListParams) => [...specimenKeys.lists(), filters] as const,
  details: () => [...specimenKeys.all, 'detail'] as const,
  detail: (id: number) => [...specimenKeys.details(), id] as const,
  sourceInfo: (id: number) => [...specimenKeys.detail(id), 'source-info'] as const,
  containers: (specimenId: string | number) => ['containers', 'specimen', specimenId] as const,
}

export function useSpecimens(filters?: SpecimenListParams) {
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

export function useSpecimenSourceInfo(specimen: Specimen | null | undefined) {
  return useQuery({
    queryKey: specimenKeys.sourceInfo(specimen?.id ?? 0),
    queryFn: async (): Promise<SpecimenSourceInfo | null> => {
      if (!specimen) return null
      if (specimen.studySubjectId) {
        const subjectRes = await api.get<{ subject: { id: number; name: string; studyId: number } }>(
          `/subjects/${specimen.studySubjectId}`
        )
        const subject = subjectRes.subject
        if (!subject) return null
        const studyRes = await api.get<{ study: { id: number; title: string; shortCode: string } }>(
          `/studies/${subject.studyId}`
        )
        const study = studyRes.study
        if (!study) return null
        return {
          type: 'subject',
          id: specimen.studySubjectId,
          name: subject.name,
          study: { id: study.id, title: study.title, code: study.shortCode },
        }
      }
      if (specimen.controlBatchId) {
        const batchRes = await api.get<{ batch: { id: number; name: string; controlDefinitionId: number } }>(
          `/blood-controls/batches/${specimen.controlBatchId}`
        )
        const batch = batchRes.batch
        if (!batch) return null
        const defRes = await api.get<{ control: { id: number; name: string } }>(
          `/blood-controls/${batch.controlDefinitionId}`
        )
        const control = defRes.control
        return {
          type: 'control',
          id: specimen.controlBatchId,
          name: batch.name,
          definition: control ? { id: control.id, name: control.name } : undefined,
        }
      }
      return null
    },
    enabled: !!specimen && (!!specimen.studySubjectId || !!specimen.controlBatchId),
  })
}

export function useContainersForSpecimen(specimenId: string | number | undefined) {
  return useQuery({
    queryKey: specimenKeys.containers(specimenId!),
    queryFn: async () => {
      const res = await api.get<{ containers: unknown[] }>('/containers', {
        params: { specimen_id: specimenId },
      })
      return res.containers ?? []
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
      } catch (err: unknown) {
        const message =
          err && typeof err === 'object' && 'response' in err
            ? (err as { response?: { data?: { error?: string } } }).response?.data?.error
            : undefined
        showError(message || 'Failed to create specimen')
        throw err
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: specimenKeys.lists() })
      success('Specimen created successfully')
    },
  })
}
