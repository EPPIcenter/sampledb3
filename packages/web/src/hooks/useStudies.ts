import { useCallback, useEffect, useRef, useState } from 'react'
import {
  useQuery,
  useInfiniteQuery,
  useMutation,
  useQueryClient,
  type QueryClient,
} from '@tanstack/react-query'
import { studiesApi, type Study, type StudySummaryBasic } from '../lib/api/studies'
import { api } from '../lib/api/client'
import { useToast } from '../contexts/ToastContext'

export const studyKeys = {
  all: ['studies'] as const,
  lists: () => [...studyKeys.all, 'list'] as const,
  list: (filters?: { search?: string; page?: number; limit?: number }) =>
    [...studyKeys.lists(), filters] as const,
  infinite: (limit?: number) => [...studyKeys.all, 'infinite', { limit }] as const,
  leadPersons: () => [...studyKeys.all, 'lead-persons'] as const,
  details: () => [...studyKeys.all, 'detail'] as const,
  detail: (id: number) => [...studyKeys.details(), id] as const,
  specimenCount: (shortCode: string) => [...studyKeys.all, 'specimen-count', shortCode] as const,
  summaryCard: (id: number) => [...studyKeys.all, 'summary-card', id] as const,
}

const STUDIES_PAGE_LIMIT = 50
const SUMMARY_CARD_STALE_MS = 5 * 60 * 1000

function summaryBatchKey(ids: number[]) {
  return [...studyKeys.all, 'summaries-batch', [...ids].sort((a, b) => a - b)] as const
}

function isSummaryCardResolved(queryClient: QueryClient, id: number): boolean {
  const state = queryClient.getQueryState(studyKeys.summaryCard(id))
  return state?.status === 'success' || state?.status === 'error'
}

export async function prefetchStudySummaryCards(
  queryClient: QueryClient,
  studyIds: number[]
): Promise<void> {
  const toFetch = studyIds.filter((id) => !isSummaryCardResolved(queryClient, id))
  if (toFetch.length === 0) return

  await queryClient.fetchQuery({
    queryKey: summaryBatchKey(toFetch),
    queryFn: async () => {
      const { summaries } = await studiesApi.getSummaries(toFetch)
      const found = new Set(summaries.map((s) => s.studyId))
      summaries.forEach((summary) => {
        queryClient.setQueryData(studyKeys.summaryCard(summary.studyId), summary)
      })
      toFetch
        .filter((id) => !found.has(id))
        .forEach((id) => queryClient.setQueryData(studyKeys.summaryCard(id), null))
      return summaries
    },
    staleTime: SUMMARY_CARD_STALE_MS,
  })
}

/** Batched lazy summaries for Studies list cards (viewport-driven prefetch). */
export function useStudySummaryCards() {
  const queryClient = useQueryClient()
  const [cacheTick, setCacheTick] = useState(0)
  const loadingIdsRef = useRef(new Set<number>())

  useEffect(() => {
    return queryClient.getQueryCache().subscribe((event) => {
      const key = event.query?.queryKey
      if (
        key?.[0] === studyKeys.all[0] &&
        (key[1] === 'summary-card' || key[1] === 'summaries-batch')
      ) {
        setCacheTick((n) => n + 1)
      }
    })
  }, [queryClient])

  const prefetch = useCallback(
    (studyIds: number[]) => {
      const toFetch = studyIds.filter((id) => !isSummaryCardResolved(queryClient, id))
      if (toFetch.length === 0) return
      toFetch.forEach((id) => loadingIdsRef.current.add(id))
      setCacheTick((n) => n + 1)
      void prefetchStudySummaryCards(queryClient, toFetch).finally(() => {
        toFetch.forEach((id) => loadingIdsRef.current.delete(id))
        setCacheTick((n) => n + 1)
      })
    },
    [queryClient]
  )

  const getCardState = useCallback(
    (studyId: number): { summary?: StudySummaryBasic | null; loading: boolean } => {
      void cacheTick
      const cached = queryClient.getQueryData<StudySummaryBasic | null>(
        studyKeys.summaryCard(studyId)
      )
      return {
        summary: cached,
        loading: loadingIdsRef.current.has(studyId),
      }
    },
    [queryClient, cacheTick]
  )

  return { prefetch, getCardState }
}

export function useStudies(search?: string, params?: { page?: number; limit?: number }) {
  return useQuery({
    queryKey: studyKeys.list({ search, ...params }),
    queryFn: () => studiesApi.list(search, params),
  })
}

/** Unfiltered browse with server pagination (infinite scroll). */
export function useInfiniteStudies(limit = STUDIES_PAGE_LIMIT) {
  return useInfiniteQuery({
    queryKey: studyKeys.infinite(limit),
    queryFn: async ({ pageParam }) => studiesApi.list(undefined, { page: pageParam, limit }),
    initialPageParam: 1,
    getNextPageParam: (lastPage, _pages, lastPageParam) => {
      const pagination = lastPage.pagination
      if (!pagination || lastPageParam >= pagination.totalPages) return undefined
      return lastPageParam + 1
    },
  })
}

/** All studies matching filters (client-side sort/pagination on the list page). */
export function useStudiesFiltered(search: string, enabled: boolean) {
  return useQuery({
    queryKey: studyKeys.list({ search, page: 1, limit: 10000 }),
    queryFn: () => studiesApi.list(search || undefined, { page: 1, limit: 10000 }),
    enabled,
  })
}

export function useStudyLeadPersons() {
  return useQuery({
    queryKey: studyKeys.leadPersons(),
    queryFn: async () => {
      const res = await studiesApi.list(undefined, { page: 1, limit: 10000 })
      const leads = new Set(res.studies.map((s) => s.leadPerson).filter(Boolean))
      return Array.from(leads).sort() as string[]
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

export function useStudySummary(studyId: number) {
  return useQuery({
    queryKey: [...studyKeys.detail(studyId), 'summary'],
    queryFn: () => studiesApi.getSummary(studyId),
    enabled: !!studyId,
  })
}

export function useStudyTimeline(studyId: number) {
  return useQuery({
    queryKey: [...studyKeys.detail(studyId), 'timeline'],
    queryFn: () => studiesApi.getTimeline(studyId),
    enabled: !!studyId,
  })
}

export function useStudySpecimenCount(shortCode: string | undefined) {
  return useQuery({
    queryKey: studyKeys.specimenCount(shortCode ?? ''),
    queryFn: async () => {
      const response = await api.get<{ pagination?: { total: number } }>('/specimens', {
        params: { study: shortCode, limit: 1 },
      })
      return response.pagination?.total ?? 0
    },
    enabled: !!shortCode,
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
      } catch (err: unknown) {
        const message =
          err && typeof err === 'object' && 'response' in err
            ? (err as { response?: { data?: { error?: string } } }).response?.data?.error
            : undefined
        showError(message || 'Failed to create study')
        throw err
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: studyKeys.lists() })
      queryClient.invalidateQueries({ queryKey: studyKeys.infinite() })
      success('Study created successfully')
    },
  })
}

export function useUpdateStudy() {
  const queryClient = useQueryClient()
  const { success, error: showError } = useToast()

  return useMutation({
    mutationFn: async ({
      id,
      data,
    }: {
      id: number
      data: Partial<
        Pick<Study, 'title' | 'leadPerson' | 'shortCode' | 'description' | 'isLongitudinal'>
      >
    }) => {
      try {
        const res = await studiesApi.update(id, data)
        return res.study
      } catch (err: unknown) {
        const message =
          err && typeof err === 'object' && 'response' in err
            ? (err as { response?: { data?: { error?: string } } }).response?.data?.error
            : undefined
        showError(message || 'Failed to update study')
        throw err
      }
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: studyKeys.detail(data.id) })
      queryClient.invalidateQueries({ queryKey: studyKeys.lists() })
      queryClient.invalidateQueries({ queryKey: studyKeys.infinite() })
      success('Study updated successfully')
    },
  })
}
