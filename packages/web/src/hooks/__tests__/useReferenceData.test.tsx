import { describe, it, expect, beforeEach, vi } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ReactNode } from 'react'
import {
  useSpecimenTypes,
  useSpecimenType,
  useCreateSpecimenType,
  useUpdateSpecimenType,
  useDeleteSpecimenType,
  useStorageTypes,
} from '../useReferenceData'
import * as api from '../../lib/api'

// Mock the API module
vi.mock('../../lib/api', () => ({
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

describe('useReferenceData Hooks', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('useSpecimenTypes', () => {
    it('should fetch and return specimen types', async () => {
      const mockData = {
        specimenTypes: [
          { id: 1, name: 'Whole Blood', created: '2024-01-01', lastUpdated: '2024-01-01' },
          { id: 2, name: 'Plasma', created: '2024-01-01', lastUpdated: '2024-01-01' },
        ],
      }

      vi.mocked(api.specimenTypesApi.list).mockResolvedValue({
        data: mockData,
        status: 200,
        statusText: 'OK',
        headers: {},
        config: {} as any,
      })

      const { result } = renderHook(() => useSpecimenTypes(), {
        wrapper: createWrapper(),
      })

      expect(result.current.isLoading).toBe(true)

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true)
      })

      expect(result.current.data).toEqual(mockData.specimenTypes)
      expect(api.specimenTypesApi.list).toHaveBeenCalledOnce()
    })

    it('should handle errors', async () => {
      vi.mocked(api.specimenTypesApi.list).mockRejectedValue(new Error('API Error'))

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
        specimenType: {
          id: 1,
          name: 'Whole Blood',
          created: '2024-01-01',
          lastUpdated: '2024-01-01',
        },
      }

      vi.mocked(api.specimenTypesApi.get).mockResolvedValue({
        data: mockData,
        status: 200,
        statusText: 'OK',
        headers: {},
        config: {} as any,
      })

      const { result } = renderHook(() => useSpecimenType(1), {
        wrapper: createWrapper(),
      })

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true)
      })

      expect(result.current.data).toEqual(mockData.specimenType)
      expect(api.specimenTypesApi.get).toHaveBeenCalledWith(1)
    })

    it('should not fetch when ID is falsy', () => {
      const { result } = renderHook(() => useSpecimenType(0), {
        wrapper: createWrapper(),
      })

      expect(result.current.isFetching).toBe(false)
      expect(api.specimenTypesApi.get).not.toHaveBeenCalled()
    })
  })

  describe('useCreateSpecimenType', () => {
    it('should create a specimen type and invalidate queries', async () => {
      const mockCreated = {
        specimenType: {
          id: 3,
          name: 'New Type',
          created: '2024-01-01',
          lastUpdated: '2024-01-01',
        },
      }

      vi.mocked(api.specimenTypesApi.create).mockResolvedValue({
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

      const { result } = renderHook(() => useCreateSpecimenType(), {
        wrapper,
      })

      const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries')

      result.current.mutate({ name: 'New Type' })

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true)
      })

      expect(api.specimenTypesApi.create).toHaveBeenCalledWith({ name: 'New Type' })
      expect(result.current.data).toEqual(mockCreated.specimenType)
      expect(invalidateSpy).toHaveBeenCalled()
    })
  })

  describe('useUpdateSpecimenType', () => {
    it('should update a specimen type and invalidate queries', async () => {
      const mockUpdated = {
        specimenType: {
          id: 1,
          name: 'Updated Name',
          created: '2024-01-01',
          lastUpdated: '2024-01-02',
        },
      }

      vi.mocked(api.specimenTypesApi.update).mockResolvedValue({
        data: mockUpdated,
        status: 200,
        statusText: 'OK',
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

      const { result } = renderHook(() => useUpdateSpecimenType(), {
        wrapper,
      })

      const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries')

      result.current.mutate({ id: 1, data: { name: 'Updated Name' } })

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true)
      })

      expect(api.specimenTypesApi.update).toHaveBeenCalledWith(1, { name: 'Updated Name' })
      expect(result.current.data).toEqual(mockUpdated.specimenType)
      expect(invalidateSpy).toHaveBeenCalled()
    })
  })

  describe('useDeleteSpecimenType', () => {
    it('should delete a specimen type and invalidate queries', async () => {
      vi.mocked(api.specimenTypesApi.delete).mockResolvedValue({
        data: { message: 'Deleted' },
        status: 200,
        statusText: 'OK',
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

      const { result } = renderHook(() => useDeleteSpecimenType(), {
        wrapper,
      })

      const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries')

      result.current.mutate(1)

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true)
      })

      expect(api.specimenTypesApi.delete).toHaveBeenCalledWith(1)
      expect(invalidateSpy).toHaveBeenCalled()
    })
  })

  describe('useStates', () => {
    it('should fetch and return states', async () => {
      const mockData = {
        states: [
          { id: 1, name: 'Frozen' },
          { id: 2, name: 'Thawed' },
        ],
      }

      // Note: statesApi no longer exists - states are deprecated
      // This test should be removed or updated to test a different feature
      const mockStatesApi = { list: vi.fn() }
      vi.mocked(mockStatesApi.list).mockResolvedValue({
        data: mockData,
        status: 200,
        statusText: 'OK',
        headers: {},
        config: {} as any,
      })

      const { result } = renderHook(() => useStates(), {
        wrapper: createWrapper(),
      })

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true)
      })

      expect(result.current.data).toEqual(mockData.states)
    })
  })

  describe('useStorageTypes', () => {
    it('should fetch and return storage types', async () => {
      const mockData = {
        storageTypes: [
          { id: 1, name: 'Freezer', description: 'Cold storage' },
          { id: 2, name: 'Refrigerator', description: 'Cool storage' },
        ],
      }

      vi.mocked(api.storageTypesApi.list).mockResolvedValue({
        data: mockData,
        status: 200,
        statusText: 'OK',
        headers: {},
        config: {} as any,
      })

      const { result } = renderHook(() => useStorageTypes(), {
        wrapper: createWrapper(),
      })

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true)
      })

      expect(result.current.data).toEqual(mockData.storageTypes)
    })
  })
})



