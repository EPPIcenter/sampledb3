import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor, act } from '@testing-library/react'
import { exportApi } from '../../lib/api/export'
import {
  buildSubjectDatesFromCsv,
  useSingleStudyExportWorkflow,
  type SingleStudyExportOutcome,
} from '../useSingleStudyExportWorkflow'

vi.mock('../../lib/export-filter-csv', () => ({
  parseExportModalCsv: vi.fn(),
}))

vi.mock('../../lib/api/export', async () => {
  const { createMockedDomainModule } = await import('../../__tests__/helpers/mock-api')
  return createMockedDomainModule('export', {
    exportApi: {
      containersCount: vi.fn(),
      containersCountByNames: vi.fn(),
      containers: vi.fn(),
      containersByNames: vi.fn(),
      downloadEnvelope: vi.fn(),
      downloadGetResponse: vi.fn(),
    },
  })
})

type CountResponse = Awaited<ReturnType<typeof exportApi.containersCount>>

/** A promise the test settles by hand, to order overlapping count responses. */
function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason: unknown) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

const emptySummary = {
  total_containers: 0,
  subjects_with_results: [],
  subjects_no_results: [],
  subjects_not_found: [],
}

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

    let outcome: SingleStudyExportOutcome = 'summary'
    await act(async () => {
      outcome = await result.current.submitExport({ columns: ['container_id'] })
    })

    expect(outcome).toBe('close')
    expect(exportApi.containers).toHaveBeenCalled()
    expect(exportApi.downloadGetResponse).toHaveBeenCalled()
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

    let outcome: SingleStudyExportOutcome = 'close'
    await act(async () => {
      outcome = await result.current.submitExport({ columns: ['container_id'] })
    })

    expect(outcome).toBe('summary')
    expect(exportApi.containersByNames).toHaveBeenCalled()
    expect(result.current.exportSummary?.total_containers).toBe(1)
    expect(exportApi.downloadEnvelope).toHaveBeenCalled()
  })
})

describe('useSingleStudyExportWorkflow in CSV mode with Tags selected', () => {
  beforeEach(async () => {
    vi.clearAllMocks()
    vi.mocked(exportApi.containersCount).mockResolvedValue({ count: 5 })
    const { parseExportModalCsv } = await import('../../lib/export-filter-csv')
    vi.mocked(parseExportModalCsv).mockResolvedValue([{ subject_name: 'SUBJ-1' }])
  })

  it('counts and exports only Containers with the selected Tags', async () => {
    vi.mocked(exportApi.containersCountByNames).mockResolvedValue({ count: 1, summary: emptySummary })
    vi.mocked(exportApi.containersByNames).mockResolvedValue({
      summary: emptySummary,
      data: btoa('csv-data'),
      format: 'csv',
      filename: 'study_ST1_export.csv',
    })

    const { result } = renderHook(() => useSingleStudyExportWorkflow({ studyCode: 'ST1', isOpen: true }))

    await act(async () => {
      result.current.switchUploadMode('csv')
      await result.current.handleCSVUpload(new File(['x'], 'subjects.csv', { type: 'text/csv' }))
      result.current.toggleArrayFilter('tag_ids', 7)
      result.current.toggleArrayFilter('tag_ids', 9)
    })

    await waitFor(
      () => {
        expect(exportApi.containersCountByNames).toHaveBeenLastCalledWith(
          expect.objectContaining({ subject_names: ['SUBJ-1'], tag_ids: [7, 9] }),
        )
      },
      { timeout: 2000 },
    )

    await act(async () => {
      await result.current.submitExport({ columns: ['container_id'] })
    })

    expect(exportApi.containersByNames).toHaveBeenCalledWith(
      expect.objectContaining({ subject_names: ['SUBJ-1'], tag_ids: [7, 9] }),
    )
  })
})

describe('useSingleStudyExportWorkflow count requests', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('ignores a count response that arrives after a newer one', async () => {
    const older = deferred<CountResponse>()
    vi.mocked(exportApi.containersCount)
      .mockReturnValueOnce(older.promise as never)
      .mockResolvedValueOnce({ count: 4 })

    const { result } = renderHook(() => useSingleStudyExportWorkflow({ studyCode: 'ST1', isOpen: true }))
    await waitFor(() => expect(exportApi.containersCount).toHaveBeenCalledTimes(1))

    await act(async () => {
      await result.current.refreshCount()
    })
    expect(result.current.count).toBe(4)

    await act(async () => {
      older.resolve({ count: 99 })
      await older.promise
    })

    expect(result.current.count).toBe(4)
    expect(result.current.loadingCount).toBe(false)
  })

  it('ignores an error from a count request a newer one replaced', async () => {
    const older = deferred<CountResponse>()
    vi.mocked(exportApi.containersCount)
      .mockReturnValueOnce(older.promise as never)
      .mockResolvedValueOnce({ count: 4 })

    const { result } = renderHook(() => useSingleStudyExportWorkflow({ studyCode: 'ST1', isOpen: true }))
    await waitFor(() => expect(exportApi.containersCount).toHaveBeenCalledTimes(1))

    await act(async () => {
      await result.current.refreshCount()
    })

    await act(async () => {
      older.reject({ response: { data: { error: 'Database busy' } } })
      await older.promise.catch(() => undefined)
    })

    expect(result.current.count).toBe(4)
    expect(result.current.error).toBeNull()
  })

  it('keeps loading while the latest count request is pending', async () => {
    const older = deferred<CountResponse>()
    const newer = deferred<CountResponse>()
    vi.mocked(exportApi.containersCount)
      .mockReturnValueOnce(older.promise as never)
      .mockReturnValueOnce(newer.promise as never)

    const { result } = renderHook(() => useSingleStudyExportWorkflow({ studyCode: 'ST1', isOpen: true }))
    await waitFor(() => expect(exportApi.containersCount).toHaveBeenCalledTimes(1))

    let latest: Promise<void> = Promise.resolve()
    act(() => {
      latest = result.current.refreshCount()
    })
    await act(async () => {
      older.resolve({ count: 99 })
      await older.promise
    })

    expect(result.current.loadingCount).toBe(true)
    expect(result.current.count).toBeNull()

    await act(async () => {
      newer.resolve({ count: 4 })
      await latest
    })
    expect(result.current.count).toBe(4)
    expect(result.current.loadingCount).toBe(false)
  })
})

describe('buildSubjectDatesFromCsv', () => {
  it('keeps every visit per subject and drops subjects that have an undated row', () => {
    expect(
      buildSubjectDatesFromCsv([
        { subject_name: 'S01', collection_date: '2024-01-01' },
        { subject_name: 'S01', collection_date: '2024-02-01' },
        { subject_name: 'S02', collection_date: '2024-03-01' },
        { subject_name: 'S02' },
      ]),
    ).toEqual({ S01: [{ exact: '2024-01-01' }, { exact: '2024-02-01' }] })
  })
})
