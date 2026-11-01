import { describe, it, expect, beforeEach, vi } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ReactNode } from 'react'
import { ToastProvider } from '../../contexts/ToastContext'
import {
  useSpecimens,
  useSpecimen,
  useCreateSpecimen,
  specimenKeys,
} from '../useSpecimens'
import { dashboardKeys } from '../useDashboard'
import { studyKeys } from '../useStudies'
import { specimensApi } from '../../lib/api/specimens'

// Mock the API module
vi.mock('../../lib/api/specimens', async () => {
  const { createMockedDomainModule } = await import('../../__tests__/helpers/mock-api')
  const { specimensHooksMock } = await import('../../__tests__/helpers/mock-api-templates')
  return createMockedDomainModule('specimens', specimensHooksMock())
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

describe('useSpecimens Hooks', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('useSpecimens', () => {
    it('returns one page of specimens with the pagination totals', async () => {
      const mockData = {
        specimens: [
          { id: 1, specimenTypeId: 1, created: '2024-01-01', lastUpdated: '2024-01-01' },
          { id: 2, specimenTypeId: 1, created: '2024-01-01', lastUpdated: '2024-01-01' },
        ],
        pagination: { page: 1, limit: 2, total: 9, totalPages: 5 },
      }

      vi.mocked(specimensApi.search).mockResolvedValue(mockData)

      const { result } = renderHook(() => useSpecimens({ page: 1, limit: 2 }), {
        wrapper: createWrapper(),
      })

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true)
      })

      expect(result.current.data).toEqual(mockData)
      expect(specimensApi.search).toHaveBeenCalledWith({ page: 1, limit: 2 })
    })

    it('keeps the previous page on screen while the next page loads', async () => {
      const page1 = {
        specimens: [{ id: 1, specimenTypeId: 1, created: '2024-01-01', lastUpdated: '2024-01-01' }],
        pagination: { page: 1, limit: 1, total: 2, totalPages: 2 },
      }
      let resolvePage2: (value: typeof page1) => void = () => {}
      vi.mocked(specimensApi.search)
        .mockResolvedValueOnce(page1)
        .mockReturnValueOnce(new Promise((resolve) => (resolvePage2 = resolve)))

      const { result, rerender } = renderHook(({ page }) => useSpecimens({ page, limit: 1 }), {
        wrapper: createWrapper(),
        initialProps: { page: 1 },
      })
      await waitFor(() => expect(result.current.isSuccess).toBe(true))

      rerender({ page: 2 })

      await waitFor(() => expect(result.current.isPlaceholderData).toBe(true))
      expect(result.current.data).toEqual(page1)
      resolvePage2({ ...page1, pagination: { ...page1.pagination, page: 2 } })
      await waitFor(() => expect(result.current.data?.pagination.page).toBe(2))
    })

    it('should pass filters to search', async () => {
      const mockData = { specimens: [], pagination: { page: 1, limit: 50, total: 0, totalPages: 0 } }

      vi.mocked(specimensApi.search).mockResolvedValue(mockData)

      const filters = { source_type: 'subject', study: 'ST1', page: 1, limit: 50 }
      const { result } = renderHook(() => useSpecimens(filters), {
        wrapper: createWrapper(),
      })

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true)
      })

      expect(specimensApi.search).toHaveBeenCalledWith(filters)
    })
  })

  describe('useSpecimen', () => {
    it('should fetch a single specimen by ID', async () => {
      const mockData = {
        specimen: {
          id: 1,
          specimenTypeId: 1,
          created: '2024-01-01',
          lastUpdated: '2024-01-01',
        },
      }

      vi.mocked(specimensApi.get).mockResolvedValue(mockData)

      const { result } = renderHook(() => useSpecimen(1), {
        wrapper: createWrapper(),
      })

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true)
      })

      expect(result.current.data).toEqual(mockData.specimen)
      expect(specimensApi.get).toHaveBeenCalledWith(1)
    })
  })

  describe('useCreateSpecimen', () => {
    it('should create a specimen and invalidate list and dashboard queries', async () => {
      const mockCreated = {
        specimen: {
          id: 3,
          studySubjectId: 10,
          studyId: 5,
          specimenTypeId: 1,
          created: '2024-01-01',
          lastUpdated: '2024-01-01',
        },
      }

      vi.mocked(specimensApi.create).mockResolvedValue(mockCreated)

      const queryClient = new QueryClient({
        defaultOptions: {
          queries: { retry: false, gcTime: 0 },
          mutations: { retry: false },
        },
      })

      const wrapper = ({ children }: { children: ReactNode }) => (
        <QueryClientProvider client={queryClient}>
          <ToastProvider>
            {children}
          </ToastProvider>
        </QueryClientProvider>
      )

      const { result } = renderHook(() => useCreateSpecimen(), {
        wrapper,
      })

      const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries')

      result.current.mutate({
        sourceType: 'subject',
        sourceId: 10,
        specimenTypeId: 1,
      })

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true)
      })

      expect(specimensApi.create).toHaveBeenCalled()
      expect(result.current.data).toEqual(mockCreated.specimen)
      expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: specimenKeys.lists() })
      expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: dashboardKeys.all })
      expect(invalidateSpy).toHaveBeenCalledWith({
        queryKey: [...studyKeys.detail(5), 'subjects'],
      })
    })
  })
})



