import { describe, it, expect, beforeEach, vi } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ReactNode } from 'react'
import { ToastProvider } from '../../contexts/ToastContext'
import {
  useSpecimens,
  useSpecimen,
  useCreateSpecimen,
} from '../useSpecimens'
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
    it('should fetch and return specimens', async () => {
      const mockData = {
        specimens: [
          { id: 1, specimenTypeId: 1, created: '2024-01-01', lastUpdated: '2024-01-01' },
          { id: 2, specimenTypeId: 1, created: '2024-01-01', lastUpdated: '2024-01-01' },
        ],
      }

      vi.mocked(specimensApi.search).mockResolvedValue(mockData)

      const { result } = renderHook(() => useSpecimens(), {
        wrapper: createWrapper(),
      })

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true)
      })

      expect(result.current.data).toEqual(mockData.specimens)
      expect(specimensApi.search).toHaveBeenCalledWith(undefined)
    })

    it('should pass filters to search', async () => {
      const mockData = { specimens: [] }

      vi.mocked(specimensApi.search).mockResolvedValue(mockData)

      const filters = { source_type: 'subject', study: 'ST1' }
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
    it('should create a specimen and invalidate queries', async () => {
      const mockCreated = {
        specimen: {
          id: 3,
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
        specimenTypeId: 1,
      })

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true)
      })

      expect(specimensApi.create).toHaveBeenCalled()
      expect(result.current.data).toEqual(mockCreated.specimen)
      expect(invalidateSpy).toHaveBeenCalled()
    })
  })
})



