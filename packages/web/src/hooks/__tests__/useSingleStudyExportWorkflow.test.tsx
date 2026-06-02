import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor, act } from '@testing-library/react'
import { exportApi } from '../../lib/api/export'
import { downloadGetExportResponse, downloadPostExportEnvelope } from '../../lib/export-download'
import { useSingleStudyExportWorkflow } from '../useSingleStudyExportWorkflow'

vi.mock('../../lib/export-filter-csv', () => ({
  parseExportModalCsv: vi.fn(),
}))

vi.mock('../../lib/export-download', () => ({
  downloadGetExportResponse: vi.fn(),
  downloadPostExportEnvelope: vi.fn(),
}))

vi.mock('../../lib/api/export', () => ({
  exportApi: {
    containersCount: vi.fn(),
    containersCountByNames: vi.fn(),
    containers: vi.fn(),
    containersByNames: vi.fn(),
  },
}))

describe('useSingleStudyExportWorkflow', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(exportApi.containersCount).mockResolvedValue({ count: 5 })
  })

  it('loads manual-mode container count when modal opens', async () => {
    const { result } = renderHook(() =>
      useSingleStudyExportWorkflow({ studyCode: 'ST1', isOpen: true })
    )

    await waitFor(() => {
      expect(exportApi.containersCount).toHaveBeenCalled()
      expect(result.current.count).toBe(5)
    })
  })

  it('resets workflow state when modal reopens', async () => {
    const { result, rerender } = renderHook(
      ({ isOpen }) => useSingleStudyExportWorkflow({ studyCode: 'ST1', isOpen }),
      { initialProps: { isOpen: true } }
    )

    await waitFor(() => expect(result.current.count).toBe(5))

    await act(async () => {
      result.current.switchUploadMode('csv')
    })
    expect(result.current.uploadMode).toBe('csv')

    rerender({ isOpen: false })
    rerender({ isOpen: true })

    await waitFor(() => {
      expect(result.current.uploadMode).toBe('manual')
    })
  })

  it('parses CSV upload and refreshes count via containersCountByNames', async () => {
    const { parseExportModalCsv } = await import('../../lib/export-filter-csv')
    vi.mocked(parseExportModalCsv).mockResolvedValue([
      { subject_name: 'SUBJ-1', collection_date: '2024-01-15' },
    ])
    vi.mocked(exportApi.containersCountByNames).mockResolvedValue({
      count: 2,
      summary: {
        total_containers: 2,
        subjects_with_results: [],
        subjects_no_results: [],
        subjects_not_found: [],
      },
    })

    const { result } = renderHook(() =>
      useSingleStudyExportWorkflow({ studyCode: 'ST1', isOpen: true })
    )

    await act(async () => {
      result.current.switchUploadMode('csv')
      await result.current.handleCSVUpload(new File(['x'], 'subjects.csv', { type: 'text/csv' }))
    })

    await waitFor(
      () => {
        expect(exportApi.containersCountByNames).toHaveBeenCalledWith(
          expect.objectContaining({
            study: 'ST1',
            subject_names: ['SUBJ-1'],
          })
        )
        expect(result.current.count).toBe(2)
      },
      { timeout: 2000 }
    )
  })

  it('submits manual export and triggers blob download', async () => {
    vi.mocked(exportApi.containers).mockResolvedValue(new Blob(['csv'], { type: 'text/csv' }))

    const { result } = renderHook(() =>
      useSingleStudyExportWorkflow({ studyCode: 'ST1', isOpen: true })
    )

    await waitFor(() => expect(result.current.count).toBe(5))

    let outcome: 'summary' | 'close' = 'summary'
    await act(async () => {
      outcome = await result.current.submitExport({ columns: ['container_id'] })
    })

    expect(outcome).toBe('close')
    expect(exportApi.containers).toHaveBeenCalled()
    expect(downloadGetExportResponse).toHaveBeenCalled()
  })

  it('submits csv-upload export via POST envelope and stores summary', async () => {
    const { parseExportModalCsv } = await import('../../lib/export-filter-csv')
    vi.mocked(parseExportModalCsv).mockResolvedValue([{ subject_name: 'SUBJ-1' }])
    vi.mocked(exportApi.containersByNames).mockResolvedValue({
      summary: {
        total_containers: 1,
        subjects_with_results: [{ name: 'SUBJ-1', count: 1 }],
        subjects_no_results: [],
        subjects_not_found: [],
      },
      data: btoa('csv-data'),
      format: 'csv',
      filename: 'study_ST1_export.csv',
    })

    const { result } = renderHook(() =>
      useSingleStudyExportWorkflow({ studyCode: 'ST1', isOpen: true })
    )

    await act(async () => {
      result.current.switchUploadMode('csv')
      await result.current.handleCSVUpload(new File(['x'], 'subjects.csv', { type: 'text/csv' }))
    })

    let outcome: 'summary' | 'close' = 'close'
    await act(async () => {
      outcome = await result.current.submitExport({ columns: ['container_id'] })
    })

    expect(outcome).toBe('summary')
    expect(exportApi.containersByNames).toHaveBeenCalled()
    expect(result.current.exportSummary?.total_containers).toBe(1)
    expect(downloadPostExportEnvelope).toHaveBeenCalled()
  })
})
