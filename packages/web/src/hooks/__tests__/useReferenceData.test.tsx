import { describe, it, expect, beforeEach, vi } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ReactNode } from 'react'
import { ToastProvider } from '../../contexts/ToastContext'
import {
  useSpecimenTypes,
  useSpecimenType,
  useCreateSpecimenType,
  useUpdateSpecimenType,
  useDeleteSpecimenType,
  useStorageTypes,
} from '../useReferenceData'
import { specimenTypesApi, storageTypesApi } from '../../lib/api/reference-data'
import type { SpecimenType, StorageType } from '../../lib/api/types'
import type { AxiosResponse } from 'axios'

// Mock the API module
vi.mock('../../lib/api/reference-data', async () => {
  const { createMockedDomainModule } = await import('../../__tests__/helpers/mock-api')
  return createMockedDomainModule('reference-data', {
  specimenTypesApi: {
    list: vi.fn(),
    get: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  },
  statesApi: {
    list: vi.fn(),
  },
  storageTypesApi: {
    list: vi.fn(),
  }
  })
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

describe('useReferenceData Hooks', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('useSpecimenTypes', () => {
    it('should fetch and return specimen types', async () => {
      const mockData = {
        data: [
          { id: 1, name: 'Whole Blood', created: '2024-01-01', lastUpdated: '2024-01-01' },
          { id: 2, name: 'Plasma', created: '2024-01-01', lastUpdated: '2024-01-01' },
        ],
      }

      vi.mocked(specimenTypesApi.list).mockResolvedValue(mockData as Awaited<ReturnType<typeof specimenTypesApi.list>>)

      const { result } = renderHook(() => useSpecimenTypes(), {
        wrapper: createWrapper(),
      })

      expect(result.current.isLoading).toBe(true)

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true)
      })

      expect(result.current.data).toEqual(mockData.data)
      expect(specimenTypesApi.list).toHaveBeenCalledOnce()
    })

    it('should handle errors', async () => {
      vi.mocked(specimenTypesApi.list).mockRejectedValue(new Error('API Error'))

      const { result } = renderHook(() => useSpecimenTypes(), {
        wrapper: createWrapper(),
      })

      await waitFor(() => {
        expect(result.current.isError).toBe(true)
      })

      expect(result.current.error).toBeDefined()
    })
  })

  describe('useSpecimenType', () => {
    it('should fetch a single specimen type by ID', async () => {
      const mockData = {
        id: 1,
        name: 'Whole Blood',
        created: '2024-01-01',
        lastUpdated: '2024-01-01',
      }

      vi.mocked(specimenTypesApi.get).mockResolvedValue(mockData as Awaited<ReturnType<typeof specimenTypesApi.get>>)

      const { result } = renderHook(() => useSpecimenType(1), {
        wrapper: createWrapper(),
      })

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true)
      })

      expect(result.current.data).toEqual(mockData)
      expect(specimenTypesApi.get).toHaveBeenCalledWith(1)
    })

    it('should not fetch when ID is falsy', () => {
      const { result } = renderHook(() => useSpecimenType(0), {
        wrapper: createWrapper(),
      })

      expect(result.current.isFetching).toBe(false)
      expect(specimenTypesApi.get).not.toHaveBeenCalled()
    })
  })

  describe('useCreateSpecimenType', () => {
    it('should create a specimen type and invalidate queries', async () => {
      const mockCreated = {
        id: 3,
        name: 'New Type',
        created: '2024-01-01',
        lastUpdated: '2024-01-01',
      }

      vi.mocked(specimenTypesApi.create).mockResolvedValue(mockCreated as Awaited<ReturnType<typeof specimenTypesApi.create>>)

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

      const { result } = renderHook(() => useCreateSpecimenType(), {
        wrapper,
      })

      const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries')

      result.current.mutate({ name: 'New Type' })

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true)
      })

      expect(specimenTypesApi.create).toHaveBeenCalledWith({ name: 'New Type' })
      expect(result.current.data).toEqual(mockCreated)
      expect(invalidateSpy).toHaveBeenCalled()
    })
  })

  describe('useUpdateSpecimenType', () => {
    it('should update a specimen type and invalidate queries', async () => {
      const mockUpdated = {
        id: 1,
        name: 'Updated Name',
        created: '2024-01-01',
        lastUpdated: '2024-01-02',
      }

      vi.mocked(specimenTypesApi.update).mockResolvedValue(mockUpdated as Awaited<ReturnType<typeof specimenTypesApi.update>>)

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

      const { result } = renderHook(() => useUpdateSpecimenType(), {
        wrapper,
      })

      const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries')

      result.current.mutate({ id: 1, data: { name: 'Updated Name' } })

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true)
      })

      expect(specimenTypesApi.update).toHaveBeenCalledWith(1, { name: 'Updated Name' })
      expect(result.current.data).toEqual(mockUpdated)
      expect(invalidateSpy).toHaveBeenCalled()
    })
  })

  describe('useDeleteSpecimenType', () => {
    it('should delete a specimen type and invalidate queries', async () => {
      vi.mocked(specimenTypesApi.delete).mockResolvedValue({
        data: { message: 'Deleted' },
        status: 200,
        statusText: 'OK',
        headers: {},
        config: {} as AxiosResponse['config'],
      })

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

      const { result } = renderHook(() => useDeleteSpecimenType(), {
        wrapper,
      })

      const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries')

      result.current.mutate(1)

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true)
      })

      expect(specimenTypesApi.delete).toHaveBeenCalledWith(1)
      expect(invalidateSpy).toHaveBeenCalled()
    })
  })

  // Note: useStates hook has been removed - states are deprecated
  // The test for useStates has been removed as the hook no longer exists

  describe('useStorageTypes', () => {
    it('should fetch and return storage types', async () => {
      const mockData = {
        data: [
          { id: 1, name: 'Freezer', description: 'Cold storage' },
          { id: 2, name: 'Room Temp', description: 'Room temperature' },
        ],
      }

      vi.mocked(storageTypesApi.list).mockResolvedValue(mockData as Awaited<ReturnType<typeof storageTypesApi.list>>)

      const { result } = renderHook(() => useStorageTypes(), {
        wrapper: createWrapper(),
      })

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true)
      })

      expect(result.current.data).toEqual(mockData.data)
    })
  })
})



