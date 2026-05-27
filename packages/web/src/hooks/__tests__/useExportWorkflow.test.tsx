import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor, act } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import { ToastProvider } from '../../contexts/ToastContext'
import { settingsApi } from '../../lib/api/settings'
import { collectionsApi } from '../../lib/api/collections'
import { exportApi } from '../../lib/api/export'
import { tagsApi, specimenTypesApi } from '../../lib/api/reference-data'
import {
  exportConfigurationsValue,
  mockSettingsApiGetValue,
  scannerConfigurationsValue,
} from '../../__tests__/helpers/settings-mocks'
import {
  parseExportCsv,
  useExportConfigurations,
  useExportMultiStudyWorkflow,
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

vi.mock('../../lib/api/export', () => ({
  exportApi: {
    validateStudyCodes: vi.fn(),
    containersCountByNamesMultiStudy: vi.fn(),
    containersByNamesMultiStudy: vi.fn(),
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

  describe('parseExportCsv', () => {
    it('parses study and subject columns from CSV text', async () => {
      const csv = 'study_short_code,subject_name\nST1,Alice\nST2,Bob'
      const file = new File([csv], 'export.csv', { type: 'text/csv' })
      const rows = await parseExportCsv(file)
      expect(rows).toHaveLength(2)
      expect(rows[0]).toEqual({ study_short_code: 'ST1', subject_name: 'Alice' })
    })

    it('rejects CSV missing study_short_code column', async () => {
      const file = new File(['subject_name\nAlice'], 'bad.csv', { type: 'text/csv' })
      await expect(parseExportCsv(file)).rejects.toThrow(/study_short_code/)
    })
  })

  describe('useExportMultiStudyWorkflow', () => {
    const csvData = [{ study_short_code: 'ST1', subject_name: 'Alice' }]

    beforeEach(() => {
      vi.mocked(exportApi.validateStudyCodes).mockResolvedValue({
        valid: [{ code: 'ST1', id: 1, title: 'Study 1', lead_person: 'Lead' }],
        invalid: [],
        total_unique: 1,
        valid_count: 1,
        invalid_count: 0,
      })
      vi.mocked(exportApi.containersCountByNamesMultiStudy).mockResolvedValue({
        count: 3,
        summary: {
          total_containers: 3,
          studies: [],
          invalid_study_codes: [],
        },
      })
      vi.mocked(exportApi.containersByNamesMultiStudy).mockResolvedValue({
        summary: {
          total_containers: 3,
          studies: [],
          invalid_study_codes: [],
        },
        data: 'dGVzdA==',
        format: 'csv',
        filename: 'export.csv',
      })
    })

    it('validates study codes via mutation', async () => {
      const { result } = renderHook(
        () => useExportMultiStudyWorkflow({ csvData: [], dateTolerance: 0, filters: {} }),
        { wrapper: createWrapper() }
      )

      await act(async () => {
        result.current.validateStudyCodes(['ST1'])
      })

      await waitFor(() => expect(result.current.validating).toBe(false))
      expect(exportApi.validateStudyCodes).toHaveBeenCalledWith(['ST1'])
      expect(result.current.validationResult?.valid_count).toBe(1)
    })

    it('surfaces invalid study codes as workflow error', async () => {
      vi.mocked(exportApi.validateStudyCodes).mockResolvedValue({
        valid: [],
        invalid: ['BAD'],
        total_unique: 1,
        valid_count: 0,
        invalid_count: 1,
      })

      const { result } = renderHook(
        () => useExportMultiStudyWorkflow({ csvData: [], dateTolerance: 0, filters: {} }),
        { wrapper: createWrapper() }
      )

      await act(async () => {
        result.current.validateStudyCodes(['BAD'])
      })

      await waitFor(() => expect(result.current.error).toMatch(/invalid study code/i))
    })

    it('debounces container count when csv data is present', async () => {
      const { result } = renderHook(
        () => useExportMultiStudyWorkflow({ csvData, dateTolerance: 0, filters: {} }),
        { wrapper: createWrapper() }
      )

      await waitFor(
        () => {
          expect(exportApi.containersCountByNamesMultiStudy).toHaveBeenCalled()
          expect(result.current.count).toBe(3)
        },
        { timeout: 2000 }
      )
    })

    it('submits export via mutation and stores summary', async () => {
      const createObjectURL = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:mock')
      const revokeObjectURL = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {})

      const { result } = renderHook(
        () => useExportMultiStudyWorkflow({ csvData, dateTolerance: 0, filters: {} }),
        { wrapper: createWrapper() }
      )

      await act(async () => {
        result.current.exportContainers({
          columns: ['container_id'],
          exportFormat: 'csv',
          csvDelimiter: ',',
          csvBOM: true,
          csvLineEnding: 'CRLF',
        })
      })

      await waitFor(() => expect(result.current.exporting).toBe(false))
      expect(exportApi.containersByNamesMultiStudy).toHaveBeenCalled()
      expect(result.current.exportSummary?.total_containers).toBe(3)

      createObjectURL.mockRestore()
      revokeObjectURL.mockRestore()
    })
  })
})
