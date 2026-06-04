import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor, act } from '@testing-library/react'
import { exportApi } from '../../lib/api/export'
import { tagsApi } from '../../lib/api/reference-data'
import { useStudyExportModalController } from '../useStudyExportModalController'

vi.mock('../../lib/export-filter-csv', () => ({
  parseExportModalCsv: vi.fn(),
}))

vi.mock('../../lib/api/export', () => ({
  exportApi: {
    availableTypes: vi.fn(),
    containersCount: vi.fn(),
    containersCountByNames: vi.fn(),
    containers: vi.fn(),
    containersByNames: vi.fn(),
    downloadEnvelope: vi.fn(),
    downloadGetResponse: vi.fn(),
  },
}))

vi.mock('../../lib/api/reference-data', () => ({
  tagsApi: {
    list: vi.fn(),
  },
}))

vi.mock('../useExportConfigurations', () => ({
  useExportConfigurations: () => ({
    configurations: [{ id: 'default', name: 'Default', columns: ['barcode'], source: 'shared' }],
    selectedConfigId: 'default',
    setSelectedConfigId: vi.fn(),
    loading: false,
    loadConfigurations: vi.fn(),
  }),
}))

vi.mock('../useHotkey', () => ({
  useModifierHotkey: vi.fn(),
}))

describe('useStudyExportModalController', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(exportApi.availableTypes).mockResolvedValue({
      specimen_types: [{ id: 1, name: 'Blood' }],
      container_types: ['micronix_tube'],
    })
    vi.mocked(tagsApi.list).mockResolvedValue({ data: [{ id: 1, name: 'Hold' }], meta: {} })
    vi.mocked(exportApi.containersCount).mockResolvedValue({ count: 3 })
  })

  it('loads reference data and container count when modal opens', async () => {
    const { result } = renderHook(() =>
      useStudyExportModalController({
        studyCode: 'ST1',
        isOpen: true,
        onClose: vi.fn(),
      }),
    )

    await waitFor(() => {
      expect(exportApi.availableTypes).toHaveBeenCalledWith('ST1')
      expect(tagsApi.list).toHaveBeenCalled()
      expect(result.current.countPreview.count).toBe(3)
      expect(result.current.filters.specimenTypes).toHaveLength(1)
    })
  })

  it('exposes grouped panel props for the presentation shell', async () => {
    const { result } = renderHook(() =>
      useStudyExportModalController({
        studyCode: 'ST1',
        isOpen: true,
        onClose: vi.fn(),
      }),
    )

    await waitFor(() => expect(result.current.countPreview.count).toBe(3))

    expect(result.current.modeTabs.uploadMode).toBe('manual')
    expect(result.current.configPicker.exportConfigurations).toHaveLength(1)
    expect(typeof result.current.actionBar.onExport).toBe('function')
  })

  it('submits manual export through the action bar handler', async () => {
    vi.mocked(exportApi.containers).mockResolvedValue(new Blob(['csv']))
    vi.mocked(exportApi.downloadGetResponse).mockImplementation(() => undefined)
    const onClose = vi.fn()

    const { result } = renderHook(() =>
      useStudyExportModalController({
        studyCode: 'ST1',
        isOpen: true,
        onClose,
      }),
    )

    await waitFor(() => expect(result.current.countPreview.count).toBe(3))

    await act(async () => {
      await result.current.actionBar.onExport()
    })

    expect(exportApi.containers).toHaveBeenCalled()
  })
})
