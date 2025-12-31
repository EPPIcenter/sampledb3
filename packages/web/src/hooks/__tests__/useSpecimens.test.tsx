import { describe, it, expect, beforeEach, vi } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ReactNode } from 'react'
import {
  useSpecimens,
  useSpecimen,
  useCreateSpecimen,
} from '../useSpecimens'
import * as api from '../../lib/api'

// Mock the API module
vi.mock('../../lib/api', () => ({
  specimensApi: {
    search: vi.fn(),
    get: vi.fn(),
    create: vi.fn(),
  },
}))

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
      {children}
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

      vi.mocked(api.specimensApi.search).mockResolvedValue({
        data: mockData,
        status: 200,
        statusText: 'OK',
        headers: {},
        config: {} as any,
      })

      const { result } = renderHook(() => useSpecimens(), {
        wrapper: createWrapper(),
      })

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true)
      })

      expect(result.current.data).toEqual(mockData.specimens)
      expect(api.specimensApi.search).toHaveBeenCalledWith(undefined)
    })

    it('should pass filters to search', async () => {
      const mockData = { specimens: [] }

      vi.mocked(api.specimensApi.search).mockResolvedValue({
        data: mockData,
        status: 200,
        statusText: 'OK',
        headers: {},
        config: {} as any,
      })

      const filters = { source_type: 'subject', study: 'ST1' }
      const { result } = renderHook(() => useSpecimens(filters), {
        wrapper: createWrapper(),
      })

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true)
      })

      expect(api.specimensApi.search).toHaveBeenCalledWith(filters)
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

      vi.mocked(api.specimensApi.get).mockResolvedValue({
        data: mockData,
        status: 200,
        statusText: 'OK',
        headers: {},
        config: {} as any,
      })

      const { result } = renderHook(() => useSpecimen(1), {
        wrapper: createWrapper(),
      })

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true)
      })

      expect(result.current.data).toEqual(mockData.specimen)
      expect(api.specimensApi.get).toHaveBeenCalledWith(1)
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

      vi.mocked(api.specimensApi.create).mockResolvedValue({
        data: mockCreated,
        status: 201,
        statusText: 'Created',
        headers: {},
        config: {} as any,
      })

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

      expect(api.specimensApi.create).toHaveBeenCalled()
      expect(result.current.data).toEqual(mockCreated.specimen)
      expect(invalidateSpy).toHaveBeenCalled()
    })
  })
})



