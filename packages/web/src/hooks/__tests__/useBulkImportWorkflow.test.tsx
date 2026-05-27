import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import { specimenTypesApi } from '../../lib/api/reference-data'
import { collectionsApi } from '../../lib/api/collections'
import {
  fetchBulkImportMissingCollections,
  useBulkImportTemplateSpecimenTypes,
} from '../useBulkImportWorkflow'

vi.mock('../../lib/api/reference-data', () => ({
  specimenTypesApi: {
    list: vi.fn(),
    getByContainerType: vi.fn(),
  },
}))

vi.mock('../../lib/api/collections', () => ({
  collectionsApi: {
    check: vi.fn(),
  },
}))

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  })
  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  )
}

describe('useBulkImportWorkflow', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(specimenTypesApi.getByContainerType).mockResolvedValue({
      specimenTypes: [{ id: 1, name: 'Serum', created: '', lastUpdated: '' }],
    })
    vi.mocked(specimenTypesApi.list).mockResolvedValue({
      data: [{ id: 1, name: 'Plasma', created: '', lastUpdated: '' }],
    })
    vi.mocked(collectionsApi.check).mockResolvedValue({
      results: [{ identifier: 'My Plate', type: 'micronix_plate', exists: false, id: null }],
    })
  })

  describe('useBulkImportTemplateSpecimenTypes', () => {
    it('loads types by container when container type is set', async () => {
      const { result } = renderHook(
        () =>
          useBulkImportTemplateSpecimenTypes({
            importType: 'combined',
            containerType: 'micronix_tube',
          }),
        { wrapper: createWrapper() },
      )
      await waitFor(() => expect(result.current.specimenTypeNames).toContain('Serum'))
      expect(specimenTypesApi.getByContainerType).toHaveBeenCalledWith('micronix_tube')
    })

    it('loads all types when container type is none', async () => {
      const { result } = renderHook(
        () =>
          useBulkImportTemplateSpecimenTypes({
            importType: 'specimens',
            containerType: 'none',
          }),
        { wrapper: createWrapper() },
      )
      await waitFor(() => expect(result.current.specimenTypeNames).toContain('Plasma'))
      expect(specimenTypesApi.list).toHaveBeenCalled()
    })
  })

  describe('fetchBulkImportMissingCollections', () => {
    it('returns missing collections from check API', async () => {
      const missing = await fetchBulkImportMissingCollections({
        rows: [{ plate_name: 'My Plate' }],
        collectionType: 'micronix_plate',
        getRowCollectionName: (row) => row.plate_name,
      })
      expect(missing).toHaveLength(1)
      expect(missing[0]?.name).toBe('My Plate')
    })

    it('throws when check API fails', async () => {
      vi.mocked(collectionsApi.check).mockRejectedValue(new Error('Network error'))
      await expect(
        fetchBulkImportMissingCollections({
          rows: [{ plate_name: 'PLATE1' }],
          collectionType: 'micronix_plate',
          getRowCollectionName: (row) => row.plate_name,
        }),
      ).rejects.toThrow()
    })
  })
})
