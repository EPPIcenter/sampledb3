import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '../../__tests__/helpers/render'
import userEvent from '@testing-library/user-event'
import ExportModal from '../ExportModal'

vi.mock('../../lib/export-filter-csv', () => ({
  parseExportModalCsv: vi.fn(),
}))

vi.mock('../../lib/api/reference-data', async () => {
  const { createMockedDomainModule } = await import('../../__tests__/helpers/mock-api')
  return createMockedDomainModule('reference-data', {
    specimenTypesApi: { list: vi.fn().mockResolvedValue({ data: [] }) },
    tagsApi: { list: vi.fn().mockResolvedValue({ data: [] }) },
  })
})

vi.mock('../../lib/api/export', async () => {
  const { createMockedDomainModule } = await import('../../__tests__/helpers/mock-api')
  return createMockedDomainModule('export', {
    exportApi: {
      validate: vi.fn(),
      export: vi.fn(),
      availableTypes: vi.fn().mockResolvedValue({ specimen_types: [], container_types: [] }),
      getCount: vi.fn().mockResolvedValue({ count: 0 }),
      containersCount: vi.fn().mockResolvedValue({ count: 0 }),
      containersCountByNames: vi.fn().mockResolvedValue({ count: 0 }),
      containers: vi.fn().mockResolvedValue(new Blob(['csv'], { type: 'text/csv' })),
      containersByNames: vi.fn().mockResolvedValue({
        summary: {
          total_containers: 1,
          subjects_with_results: [{ name: 'SUBJ-1', count: 1 }],
          subjects_no_results: [],
          subjects_not_found: [],
        },
        data: btoa('csv'),
        format: 'csv',
        filename: 'study_ST1_export.csv',
      }),
    },
  })
})

vi.mock('../../lib/api/settings', async () => {
  const { createMockedDomainModule } = await import('../../__tests__/helpers/mock-api')
  const { exportPageMock } = await import('../../__tests__/helpers/mock-api-templates')
  return createMockedDomainModule('settings', exportPageMock())
})

describe('ExportModal', () => {
  const onClose = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders nothing when isOpen is false', async () => {
    await render(
      <ExportModal isOpen={false} onClose={onClose} studyCode="ST1" studyId={1} />
    )
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(screen.queryByText(/export|ST1/i)).not.toBeInTheDocument()
  })

  it('renders modal content when isOpen is true', async () => {
    await render(
      <ExportModal isOpen={true} onClose={onClose} studyCode="ST1" studyId={1} />
    )
    await waitFor(() => {
      expect(screen.getByRole('heading', { name: /Export Study Data/i })).toBeInTheDocument()
    }, { timeout: 3000 })
  })

  it('calls onClose when close button is clicked', async () => {
    const user = userEvent.setup()
    await render(
      <ExportModal isOpen={true} onClose={onClose} studyCode="ST1" studyId={1} />
    )
    await waitFor(() => {
      expect(screen.getByRole('heading', { name: /Export Study Data/i })).toBeInTheDocument()
    }, { timeout: 3000 })
    const closeButton = screen.getByRole('button', { name: 'Close' })
    await user.click(closeButton)
    expect(onClose).toHaveBeenCalled()
  })

  it('shows 0 matching containers and no error for empty study', async () => {
    const { exportApi } = await import('../../lib/api/export')
    vi.mocked(exportApi.containersCount).mockResolvedValue({ count: 0 })
    vi.mocked(exportApi.availableTypes).mockResolvedValue({
      specimen_types: [],
      container_types: [],
    })

    await render(
      <ExportModal isOpen={true} onClose={onClose} studyCode="TUT01" studyId={1} />
    )

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: /Export Study Data/i })).toBeInTheDocument()
    }, { timeout: 3000 })

    await waitFor(() => {
      expect(screen.getByText('0')).toBeInTheDocument()
    }, { timeout: 3000 })

    expect(screen.queryByText(/no subjects found/i)).not.toBeInTheDocument()
    expect(screen.getByText(/Matching Containers:/i)).toBeInTheDocument()
  })

  it('toggles container type filter without error when filter array is unset', async () => {
    const { exportApi } = await import('../../lib/api/export')
    vi.mocked(exportApi.availableTypes).mockResolvedValue({
      specimen_types: [],
      container_types: ['micronix_tube'],
    })

    await render(
      <ExportModal isOpen={true} onClose={onClose} studyCode="ST1" studyId={1} />
    )

    await waitFor(() => {
      expect(screen.getByText('Micronix Tube')).toBeInTheDocument()
    })

    const checkbox = screen.getByRole('checkbox', { name: /micronix tube/i })
    await userEvent.setup().click(checkbox)
    expect(checkbox).toBeChecked()
  })

  it('uploads a subject CSV and exports with summary', async () => {
    const user = userEvent.setup()

    const { parseExportModalCsv } = await import('../../lib/export-filter-csv')
    vi.mocked(parseExportModalCsv).mockResolvedValue([{ subject_name: 'SUBJ-1' }])

    const { exportApi } = await import('../../lib/api/export')
    vi.mocked(exportApi.containersCountByNames).mockResolvedValue({
      count: 1,
      summary: {
        total_containers: 1,
        subjects_with_results: [],
        subjects_no_results: [],
        subjects_not_found: [],
      },
    })

    await render(
      <ExportModal isOpen={true} onClose={onClose} studyCode="ST1" studyId={1} />
    )

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: /Export Study Data/i })).toBeInTheDocument()
    })

    await user.click(screen.getByRole('button', { name: /CSV Upload/i }))
    const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement
    await user.upload(fileInput, new File(['subject_name\nSUBJ-1'], 'subjects.csv', { type: 'text/csv' }))

    await waitFor(() => {
      expect(screen.getByText(/Successfully parsed 1 subject/i)).toBeInTheDocument()
    })

    await waitFor(() => {
      expect(exportApi.containersCountByNames).toHaveBeenCalled()
    }, { timeout: 2000 })

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /^Export$/i })).not.toBeDisabled()
    }, { timeout: 2000 })

    await user.click(screen.getByRole('button', { name: /^Export$/i }))

    await waitFor(() => {
      expect(exportApi.containersByNames).toHaveBeenCalled()
      expect(screen.getByText(/Export Summary/i)).toBeInTheDocument()
    })
  })
})
