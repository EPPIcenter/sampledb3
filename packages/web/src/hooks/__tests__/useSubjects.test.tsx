import { describe, it, expect, beforeEach, vi } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ReactNode } from 'react'
import { ToastProvider } from '../../contexts/ToastContext'
import {
  useSubject,
  useSubjectSummary,
  useCreateSubject,
  useUpdateSubject,
  useMergeSubjects,
  subjectKeys,
} from '../useSubjects'
import { studyKeys } from '../useStudies'
import { specimenKeys } from '../useSpecimens'
import { collectionKeys } from '../useCollections'
import { dashboardKeys } from '../useDashboard'
import { subjectsApi } from '../../lib/api/subjects'
import {
  createInvalidationTestClient,
  keysNotInvalidated,
  observeQuery,
  seedQueries,
} from '../../__tests__/helpers/query-invalidation'

// Mock the API module
vi.mock('../../lib/api/subjects', async () => {
  const { createMockedDomainModule } = await import('../../__tests__/helpers/mock-api')
  const { subjectsHooksMock } = await import('../../__tests__/helpers/mock-api-templates')
  return createMockedDomainModule('subjects', subjectsHooksMock())
})

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
        gcTime: 0,
      },
      mutations: {
        retry: false,
      },
    },
  })

  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>
      <ToastProvider>
        {children}
      </ToastProvider>
    </QueryClientProvider>
  )
}

describe('useSubjects Hooks', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('useSubject', () => {
    it('should fetch a single subject by ID', async () => {
      const mockData = {
        subject: {
          id: 1,
          studyId: 1,
          name: 'Subject 1',
          created: '2024-01-01',
          lastUpdated: '2024-01-01',
        },
      }

      vi.mocked(subjectsApi.get).mockResolvedValue(mockData)

      const { result } = renderHook(() => useSubject(1), {
        wrapper: createWrapper(),
      })

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true)
      })

      expect(result.current.data).toEqual(mockData.subject)
      expect(subjectsApi.get).toHaveBeenCalledWith(1)
    })
  })

  describe('useSubjectSummary', () => {
    it('should fetch subject summary', async () => {
      const mockData = {
        subject: { id: 1, studyId: 1, name: 'Subject 1', created: '2024-01-01', lastUpdated: '2024-01-01' },
        specimens: [],
        summary: { specimenCount: 5, totalSpecimens: 5, totalContainers: 10, specimenTypes: [], timeline: [], collectionDateRange: null },
      }

      vi.mocked(subjectsApi.getSummary).mockResolvedValue(mockData)

      const { result } = renderHook(() => useSubjectSummary(1), {
        wrapper: createWrapper(),
      })

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true)
      })

      expect(result.current.data).toEqual(mockData)
    })
  })

  describe('useCreateSubject', () => {
    it('should create a subject and invalidate queries', async () => {
      const mockCreated = {
        subject: {
          id: 3,
          studyId: 1,
          name: 'New Subject',
          created: '2024-01-01',
          lastUpdated: '2024-01-01',
        },
      }

      vi.mocked(subjectsApi.create).mockResolvedValue(mockCreated)

      const queryClient = new QueryClient({
        defaultOptions: {
          queries: { retry: false, gcTime: 0 },
          mutations: { retry: false },
        },
      })

      const wrapper = ({ children }: { children: ReactNode }) => (
        <QueryClientProvider client={queryClient}>
          {children}
        </QueryClientProvider>
      )

      const { result } = renderHook(() => useCreateSubject(), {
        wrapper,
      })

      const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries')

      result.current.mutate({
        studyId: 1,
        name: 'New Subject',
      })

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true)
      })

      expect(subjectsApi.create).toHaveBeenCalled()
      expect(result.current.data).toEqual(mockCreated.subject)
      expect(invalidateSpy).toHaveBeenCalled()
    })
  })

  describe('useUpdateSubject', () => {
    it('should update a subject and invalidate queries', async () => {
      const mockUpdated = {
        subject: {
          id: 1,
          studyId: 1,
          name: 'Updated Subject',
          created: '2024-01-01',
          lastUpdated: '2024-01-02',
        },
      }

      vi.mocked(subjectsApi.update).mockResolvedValue(mockUpdated)

      const queryClient = new QueryClient({
        defaultOptions: {
          queries: { retry: false, gcTime: 0 },
          mutations: { retry: false },
        },
      })

      const wrapper = ({ children }: { children: ReactNode }) => (
        <QueryClientProvider client={queryClient}>
          {children}
        </QueryClientProvider>
      )

      const { result } = renderHook(() => useUpdateSubject(), {
        wrapper,
      })

      const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries')

      result.current.mutate({
        id: 1,
        data: { name: 'Updated Subject' },
      })

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true)
      })

      expect(subjectsApi.update).toHaveBeenCalledWith(1, { name: 'Updated Subject' })
      expect(result.current.data).toEqual(mockUpdated.subject)
      expect(invalidateSpy).toHaveBeenCalled()
    })
  })
})

describe('useMergeSubjects', () => {
  const studyPages = [
    [...studyKeys.detail(1), 'subjects', { page: 1 }],
    [...studyKeys.detail(1), 'summary'],
    [...studyKeys.detail(1), 'timeline'],
    subjectKeys.summary(20),
    specimenKeys.list({}),
    collectionKeys.cryovialBox(4),
    dashboardKeys.count('subjects'),
  ]

  function setup() {
    const queryClient = createInvalidationTestClient()
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    )
    return { queryClient, wrapper }
  }

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('invalidates the study Subjects, summary, timeline, target Subject and dashboard', async () => {
    vi.mocked(subjectsApi.merge).mockResolvedValue({ success: true } as never)
    const { queryClient, wrapper } = setup()
    seedQueries(queryClient, studyPages)

    const { result } = renderHook(() => useMergeSubjects(), { wrapper })
    result.current.mutate({ targetId: 20, sourceId: 21 })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(subjectsApi.merge).toHaveBeenCalledWith(20, 21)
    expect(keysNotInvalidated(queryClient, studyPages)).toEqual([])
  })

  it("marks the deleted source Subject's pages stale without refetching them", async () => {
    vi.mocked(subjectsApi.merge).mockResolvedValue({ success: true } as never)
    const { queryClient, wrapper } = setup()
    const source = await observeQuery(queryClient, subjectKeys.summary(21))
    const target = await observeQuery(queryClient, subjectKeys.summary(20))

    const { result } = renderHook(() => useMergeSubjects(), { wrapper })
    result.current.mutate({ targetId: 20, sourceId: 21 })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(target.queryFn).toHaveBeenCalledTimes(2)
    expect(source.queryFn).toHaveBeenCalledTimes(1)
    expect(queryClient.getQueryState(subjectKeys.summary(21))?.isInvalidated).toBe(true)
    source.unsubscribe()
    target.unsubscribe()
  })

  it('invalidates nothing when the merge fails', async () => {
    vi.mocked(subjectsApi.merge).mockRejectedValue(new Error('Subjects are in different studies'))
    const { queryClient, wrapper } = setup()
    seedQueries(queryClient, studyPages)

    const { result } = renderHook(() => useMergeSubjects(), { wrapper })
    result.current.mutate({ targetId: 20, sourceId: 21 })

    await waitFor(() => expect(result.current.isError).toBe(true))
    expect(keysNotInvalidated(queryClient, studyPages)).toEqual(studyPages)
  })
})
