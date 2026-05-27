import { useQuery, useMutation, useQueryClient, type QueryClient } from '@tanstack/react-query'
import { specimensApi, type SpecimenListParams } from '../lib/api/specimens'
import { containersApi } from '../lib/api/containers'
import { subjectsApi } from '../lib/api/subjects'
import { studiesApi } from '../lib/api/studies'
import { controlsApi } from '../lib/api/controls'
import type { Specimen } from '../lib/api/types'
import type { ContainerData } from '../components/ContainerRegistration'
import { useToast } from '../contexts/ToastContext'
import { invalidateDashboardQueries } from './useDashboard'
import { studyKeys } from './useStudies'
import { subjectKeys } from './useSubjects'
import { controlKeys } from './useControls'

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

export type CreateSpecimenInput = {
  sourceType: 'subject' | 'control' | 'reagent' | 'cell_line' | 'plasmid' | 'standard'
  sourceId?: number
  studyShortCode?: string
  subjectName?: string
  specimenTypeId?: number
  specimenTypeName?: string
  collectionDate?: string
  containerBarcode?: string
  container?: ContainerData
  /** When known before create (e.g. form state); API response studyId takes precedence. */
  studyId?: number
}

function getMutationErrorMessage(err: unknown, fallback: string): string {
  if (
    err &&
    typeof err === 'object' &&
    'response' in err &&
    err.response &&
    typeof (err.response as { data?: { error?: string } }).data?.error === 'string'
  ) {
    return (err.response as { data: { error: string } }).data.error
  }
  return fallback
}

/** Refresh list, dashboard, and contextual detail queries after specimen writes. */
export function invalidateSpecimenQueries(
  queryClient: QueryClient,
  ctx: {
    specimen: Specimen
    studyId?: number
  }
) {
  void queryClient.invalidateQueries({ queryKey: specimenKeys.lists() })
  invalidateDashboardQueries(queryClient)

  const studyId = ctx.specimen.studyId ?? ctx.studyId
  const subjectId = ctx.specimen.studySubjectId
  if (subjectId != null) {
    void queryClient.invalidateQueries({ queryKey: subjectKeys.detail(subjectId) })
    void queryClient.invalidateQueries({ queryKey: subjectKeys.summary(subjectId) })
  }
  if (studyId != null) {
    void queryClient.invalidateQueries({ queryKey: [...studyKeys.detail(studyId), 'subjects'] })
    void queryClient.invalidateQueries({ queryKey: [...studyKeys.detail(studyId), 'summary'] })
  }
  const controlBatchId = ctx.specimen.controlBatchId
  if (controlBatchId != null) {
    void queryClient.invalidateQueries({ queryKey: controlKeys.batchSummary(controlBatchId) })
    void queryClient.invalidateQueries({ queryKey: controlKeys.overview() })
  }
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
        const subjectRes = await subjectsApi.get(specimen.studySubjectId)
        const subject = subjectRes.subject
        if (!subject) return null
        const studyRes = await studiesApi.get(subject.studyId)
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
        const batchRes = await controlsApi.getBatch(specimen.controlBatchId)
        const batch = batchRes.batch
        if (!batch) return null
        const defRes = await controlsApi.get(batch.controlDefinitionId)
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
      const res = await containersApi.list({ specimen_id: specimenId })
      return res.containers ?? []
    },
    enabled: !!specimenId,
  })
}

export function useCreateSpecimen(options?: { silent?: boolean }) {
  const queryClient = useQueryClient()
  const { success, error: showError } = useToast()

  return useMutation({
    mutationFn: async ({ studyId: _studyIdHint, ...data }: CreateSpecimenInput) => {
      const res = await specimensApi.create(data)
      return res.specimen
    },
    onError: (err: unknown) => {
      if (options?.silent) return
      showError(getMutationErrorMessage(err, 'Failed to create specimen'))
    },
    onSuccess: (specimen, variables) => {
      invalidateSpecimenQueries(queryClient, {
        specimen,
        studyId: variables.studyId,
      })
      success('Specimen created successfully')
    },
  })
}
