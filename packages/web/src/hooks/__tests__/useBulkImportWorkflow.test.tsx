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
import { getBulkImportRowCollectionRef, type CSVRow } from '../../lib/bulk-import-validation'
import type { ContainerType } from '../../lib/container-types'

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
    /** The check API reports every Collection missing except those identified by `existing`. */
    function checkReports(existing: string[] = []) {
      vi.mocked(collectionsApi.check).mockImplementation(({ collections }) =>
        Promise.resolve({
          results: collections.map((c) => ({
            ...c,
            exists: existing.includes(c.identifier),
            id: existing.includes(c.identifier) ? 1 : null,
          })),
        }),
      )
    }

    const missingFor = (rows: CSVRow[], containerType: ContainerType) =>
      fetchBulkImportMissingCollections({
        rows,
        getRowCollectionRef: (row) => getBulkImportRowCollectionRef(row, containerType),
      })

    // Name-shaped and barcode-shaped values; the column decides which a value is.
    const values = ['My Plate', 'PLATE-001', 'REVIEWPLATE-01', 'ABC123456']

    it.each([
      ['plate_name', 'micronix_tube', 'micronix_plate'],
      ['plate_name', 'static_well', 'micronix_plate'],
      ['box_name', 'cryovial_tube', 'cryovial_box'],
      ['box_name', 'paper', 'box'],
      ['bag_name', 'paper', 'bag'],
    ] as const)('treats every value in %s (%s) as a name', async (column, containerType, type) => {
      checkReports()
      for (const value of values) {
        const missing = await missingFor([{ [column]: value }, { [column]: value }], containerType)
        expect(missing).toEqual([{ name: value, collectionType: type, locationId: null, status: 'pending' }])
      }
    })

    it.each([
      ['micronix_tube', 'micronix_plate'],
      ['static_well', 'micronix_plate'],
      ['cryovial_tube', 'cryovial_box'],
    ] as const)('treats every value in collection_barcode (%s) as a barcode', async (containerType, type) => {
      checkReports()
      for (const value of values) {
        const missing = await missingFor([{ collection_barcode: value }], containerType)
        expect(missing).toEqual([
          { name: '', collectionType: type, barcode: value, locationId: null, status: 'pending' },
        ])
      }
    })

    it('makes one Collection of a name and barcode given together', async () => {
      checkReports()
      const missing = await missingFor(
        [
          { plate_name: 'PLATE-001', collection_barcode: 'Barcode 7' },
          { plate_name: 'PLATE-001', collection_barcode: 'Barcode 7' },
        ],
        'micronix_tube',
      )
      expect(missing).toEqual([
        { name: 'PLATE-001', collectionType: 'micronix_plate', barcode: 'Barcode 7', locationId: null, status: 'pending' },
      ])
      expect(collectionsApi.check).toHaveBeenCalledWith({
        collections: [
          { identifier: 'PLATE-001', type: 'micronix_plate' },
          { identifier: 'Barcode 7', type: 'micronix_plate' },
        ],
      })
    })

    it('leaves out a Collection found by its name or its barcode', async () => {
      checkReports(['PLATE-001', 'PB-2'])
      const missing = await missingFor(
        [
          { plate_name: 'PLATE-001' },
          { plate_name: 'Plate Two', collection_barcode: 'PB-2' },
          { plate_name: 'PLATE-003' },
        ],
        'micronix_tube',
      )
      expect(missing.map((m) => m.name)).toEqual(['PLATE-003'])
    })

    it('ignores collection_barcode on paper rows', async () => {
      checkReports()
      const missing = await missingFor([{ box_name: 'BOX-003', collection_barcode: 'X-1' }], 'paper')
      expect(missing).toEqual([{ name: 'BOX-003', collectionType: 'box', locationId: null, status: 'pending' }])
    })

    it('does not call the check API when no row names a Collection', async () => {
      const missing = await missingFor([{ plate_name: '' }], 'micronix_tube')
      expect(missing).toEqual([])
      expect(collectionsApi.check).not.toHaveBeenCalled()
    })

    it('throws when check API fails', async () => {
      vi.mocked(collectionsApi.check).mockRejectedValue(new Error('Network error'))
      await expect(missingFor([{ plate_name: 'PLATE1' }], 'micronix_tube')).rejects.toThrow()
    })
  })
})
