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
} from '../useSubjects'
import * as api from '../../lib/api'

// Mock the API module
vi.mock('../../lib/api', () => ({
  subjectsApi: {
    get: vi.fn(),
    getSummary: vi.fn(),
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

      vi.mocked(api.subjectsApi.get).mockResolvedValue(mockData)

      const { result } = renderHook(() => useSubject(1), {
        wrapper: createWrapper(),
      })

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true)
      })

      expect(result.current.data).toEqual(mockData.subject)
      expect(api.subjectsApi.get).toHaveBeenCalledWith(1)
    })
  })

  describe('useSubjectSummary', () => {
    it('should fetch subject summary', async () => {
      const mockData = {
        subject: { id: 1, studyId: 1, name: 'Subject 1', created: '2024-01-01', lastUpdated: '2024-01-01' },
        specimens: [],
        summary: { specimenCount: 5, totalSpecimens: 5, totalContainers: 10, specimenTypes: [], timeline: [], collectionDateRange: null },
      }

      vi.mocked(api.subjectsApi.getSummary).mockResolvedValue(mockData)

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

      vi.mocked(api.subjectsApi.create).mockResolvedValue(mockCreated)

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

      expect(api.subjectsApi.create).toHaveBeenCalled()
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

      vi.mocked(api.subjectsApi.update).mockResolvedValue(mockUpdated)

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

      expect(api.subjectsApi.update).toHaveBeenCalledWith(1, { name: 'Updated Subject' })
      expect(result.current.data).toEqual(mockUpdated.subject)
      expect(invalidateSpy).toHaveBeenCalled()
    })
  })
})



