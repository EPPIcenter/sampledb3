import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import { ToastProvider } from '../../contexts/ToastContext'
import { settingsApi } from '../../lib/api/settings'
import { collectionsApi } from '../../lib/api/collections'
import { tagsApi, specimenTypesApi } from '../../lib/api/reference-data'
import {
  exportConfigurationsValue,
  mockSettingsApiGetValue,
  scannerConfigurationsValue,
} from '../../__tests__/helpers/settings-mocks'
import {
  useExportConfigurations,
  useExportReferenceData,
  usePlateScanBootstrap,
} from '../useExportWorkflow'

vi.mock('../../lib/api/settings', () => ({
  settingsApi: {
    getValue: vi.fn(),
  },
}))

vi.mock('../../lib/api/collections', () => ({
  collectionsApi: {
    listCollectionsByType: vi.fn(),
  },
}))

vi.mock('../../lib/api/reference-data', () => ({
  specimenTypesApi: { list: vi.fn() },
  tagsApi: { list: vi.fn() },
}))

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  })
  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>
      <ToastProvider>{children}</ToastProvider>
    </QueryClientProvider>
  )
}

describe('useExportWorkflow', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(settingsApi.getValue).mockImplementation(
      mockSettingsApiGetValue({
        exportShared: exportConfigurationsValue([{ name: 'Shared', columns: ['id'], isDefault: true }]),
        exportPersonal: exportConfigurationsValue([]),
      }),
    )
    vi.mocked(specimenTypesApi.list).mockResolvedValue({
      data: [{ id: 1, name: 'Blood', created: '', lastUpdated: '' }],
    } as never)
    vi.mocked(tagsApi.list).mockResolvedValue({ data: [{ id: 1, name: 'QC' }] } as never)
    vi.mocked(collectionsApi.listCollectionsByType).mockResolvedValue({
      collections: [{ id: 1, name: 'PLATE1' }],
    } as never)
  })

  describe('useExportReferenceData', () => {
    it('loads specimen types and tags', async () => {
      const { result } = renderHook(() => useExportReferenceData(), {
        wrapper: createWrapper(),
      })
      await waitFor(() => expect(result.current.isLoading).toBe(false))
      expect(result.current.specimenTypes).toHaveLength(1)
      expect(result.current.tags).toHaveLength(1)
    })
  })

  describe('useExportConfigurations', () => {
    it('merges shared and personal export configurations', async () => {
      const { result } = renderHook(() => useExportConfigurations(), {
        wrapper: createWrapper(),
      })
      await waitFor(() => expect(result.current.loading).toBe(false))
      expect(result.current.configurations.length).toBeGreaterThan(0)
      expect(result.current.selectedConfigId).toMatch(/^(shared|personal):/)
    })
  })

  describe('usePlateScanBootstrap', () => {
    it('loads plates and scanner configurations', async () => {
      vi.mocked(settingsApi.getValue).mockResolvedValue(
        scannerConfigurationsValue([{ id: 'c1', name: 'Default', isDefault: true, barcodeColumn: 'b', positionType: 'single', skipRows: 0 }]),
      )
      const { result } = renderHook(() => usePlateScanBootstrap(), {
        wrapper: createWrapper(),
      })
      await waitFor(() => expect(result.current.isLoading).toBe(false))
      expect(result.current.plates[0]?.name).toBe('PLATE1')
      expect(result.current.scannerConfigurations[0]?.id).toBe('c1')
    })
  })
})
