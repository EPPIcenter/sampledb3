import { describe, it, expect, beforeEach, vi } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ReactNode } from 'react'
import {
  useStudies,
  useStudy,
  useStudySubjects,
  useCreateStudy,
  useUpdateStudy,
} from '../useStudies'
import * as api from '../../lib/api'

// Mock the API module
vi.mock('../../lib/api', () => ({
  studiesApi: {
    list: vi.fn(),
    get: vi.fn(),
    getSubjects: vi.fn(),
    getSummary: vi.fn(),
    getTimeline: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
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

describe('useStudies Hooks', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('useStudies', () => {
    it('should fetch and return studies', async () => {
      const mockData = {
        studies: [
          { id: 1, title: 'Study 1', shortCode: 'ST1', isLongitudinal: false, leadPerson: 'Lead 1', created: '2024-01-01', lastUpdated: '2024-01-01' },
          { id: 2, title: 'Study 2', shortCode: 'ST2', isLongitudinal: false, leadPerson: 'Lead 2', created: '2024-01-01', lastUpdated: '2024-01-01' },
        ],
        pagination: { total: 2, page: 1, limit: 10, totalPages: 1 },
      }

      vi.mocked(api.studiesApi.list).mockResolvedValue({
        data: mockData,
        status: 200,
        statusText: 'OK',
        headers: {},
        config: {} as any,
      })

      const { result } = renderHook(() => useStudies(), {
        wrapper: createWrapper(),
      })

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true)
      })

      expect(result.current.data).toEqual(mockData)
      expect(api.studiesApi.list).toHaveBeenCalledWith(undefined, undefined)
    })

    it('should pass search and pagination parameters', async () => {
      const mockData = { studies: [], pagination: { total: 0, page: 1, limit: 10, totalPages: 0 } }

      vi.mocked(api.studiesApi.list).mockResolvedValue({
        data: mockData,
        status: 200,
        statusText: 'OK',
        headers: {},
        config: {} as any,
      })

      const { result } = renderHook(() => useStudies('test', { page: 2, limit: 20 }), {
        wrapper: createWrapper(),
      })

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true)
      })

      expect(api.studiesApi.list).toHaveBeenCalledWith('test', { page: 2, limit: 20 })
    })
  })

  describe('useStudy', () => {
    it('should fetch a single study by ID', async () => {
      const mockData = {
        study: {
          id: 1,
          title: 'Test Study',
          shortCode: 'TEST',
          isLongitudinal: false,
          leadPerson: 'Dr. Test',
          created: '2024-01-01',
          lastUpdated: '2024-01-01',
        },
      }

      vi.mocked(api.studiesApi.get).mockResolvedValue({
        data: mockData,
        status: 200,
        statusText: 'OK',
        headers: {},
        config: {} as any,
      })

      const { result } = renderHook(() => useStudy(1), {
        wrapper: createWrapper(),
      })

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true)
      })

      expect(result.current.data).toEqual(mockData.study)
      expect(api.studiesApi.get).toHaveBeenCalledWith(1)
    })

    it('should not fetch when ID is falsy', () => {
      const { result } = renderHook(() => useStudy(0), {
        wrapper: createWrapper(),
      })

      expect(result.current.isFetching).toBe(false)
      expect(api.studiesApi.get).not.toHaveBeenCalled()
    })
  })

  describe('useStudySubjects', () => {
    it('should fetch study subjects', async () => {
      const mockData = {
        subjects: [
          { id: 1, name: 'Subject 1', studyId: 1, created: '2024-01-01', lastUpdated: '2024-01-01' },
        ],
        pagination: { total: 1, page: 1, limit: 10, totalPages: 1 },
      }

      vi.mocked(api.studiesApi.getSubjects).mockResolvedValue({
        data: mockData,
        status: 200,
        statusText: 'OK',
        headers: {},
        config: {} as any,
      })

      const { result } = renderHook(() => useStudySubjects(1), {
        wrapper: createWrapper(),
      })

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true)
      })

      expect(result.current.data).toEqual(mockData)
      expect(api.studiesApi.getSubjects).toHaveBeenCalledWith(1, undefined)
    })
  })

  describe('useCreateStudy', () => {
    it('should create a study and invalidate queries', async () => {
      const mockCreated = {
        study: {
          id: 3,
          title: 'New Study',
          shortCode: 'NEW',
          isLongitudinal: false,
          leadPerson: 'Dr. New',
          created: '2024-01-01',
          lastUpdated: '2024-01-01',
        },
      }

      vi.mocked(api.studiesApi.create).mockResolvedValue({
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

      const { result } = renderHook(() => useCreateStudy(), {
        wrapper,
      })

      const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries')

      result.current.mutate({
        title: 'New Study',
        shortCode: 'NEW',
        isLongitudinal: false,
        leadPerson: 'Dr. New',
      })

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true)
      })

      expect(api.studiesApi.create).toHaveBeenCalled()
      expect(result.current.data).toEqual(mockCreated.study)
      expect(invalidateSpy).toHaveBeenCalled()
    })
  })

  describe('useUpdateStudy', () => {
    it('should update a study and invalidate queries', async () => {
      const mockUpdated = {
        study: {
          id: 1,
          title: 'Updated Study',
          shortCode: 'UPD',
          isLongitudinal: true,
          leadPerson: 'Dr. Updated',
          created: '2024-01-01',
          lastUpdated: '2024-01-02',
        },
      }

      vi.mocked(api.studiesApi.update).mockResolvedValue({
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

      const { result } = renderHook(() => useUpdateStudy(), {
        wrapper,
      })

      const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries')

      result.current.mutate({
        id: 1,
        data: { title: 'Updated Study' },
      })

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true)
      })

      expect(api.studiesApi.update).toHaveBeenCalledWith(1, { title: 'Updated Study' })
      expect(result.current.data).toEqual(mockUpdated.study)
      expect(invalidateSpy).toHaveBeenCalled()
    })
  })
})



