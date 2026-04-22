import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '../../__tests__/helpers/render'
import userEvent from '@testing-library/user-event'
import ExportModal from '../ExportModal'

vi.mock('../../lib/api', () => ({
  exportApi: {
    validate: vi.fn(),
    export: vi.fn(),
    availableTypes: vi.fn().mockResolvedValue({ data: { specimen_types: [], container_types: [] } }),
    getCount: vi.fn().mockResolvedValue({ data: { count: 0 } }),
    containersCount: vi.fn().mockResolvedValue({ data: { count: 0 } }),
    containersCountByNames: vi.fn().mockResolvedValue({ data: { count: 0 } }),
  },
  exportConfigurationsApi: {
    getShared: vi.fn().mockResolvedValue({ data: { configurations: [] } }),
    getPersonal: vi.fn().mockResolvedValue({ data: { configurations: [] } }),
  },
  specimenTypesApi: { list: vi.fn().mockResolvedValue({ data: [] }) },
  tagsApi: { list: vi.fn().mockResolvedValue({ data: [] }) },
}))

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
    const { exportApi } = await import('../../lib/api')
    vi.mocked(exportApi.containersCount).mockResolvedValue({ data: { count: 0 } } as never)
    vi.mocked(exportApi.availableTypes).mockResolvedValue({
      data: { specimen_types: [], container_types: [] },
    } as never)

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
})
