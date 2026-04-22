import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '../../__tests__/helpers/render'
import userEvent from '@testing-library/user-event'
import CryovialBoxDetail from '../CryovialBoxDetail'
import * as csv from '../../lib/csv'

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom')
  return {
    ...actual,
    useParams: () => ({ id: '1' }),
    useNavigate: () => vi.fn(),
    useSearchParams: () => [new URLSearchParams()],
  }
})

const mockBox = { id: 1, name: 'CRYO1', barcode: 'CRY-001', locationId: 1, created: '', lastUpdated: '' }
const mockPositions: Record<string, Array<{ kind: 'cryovial_tube'; id: number; barcode?: string | null; position?: string | null; container?: unknown }>> = {
  A01: [
    {
      kind: 'cryovial_tube',
      id: 201,
      barcode: 'CV-001',
      position: 'A01',
      container: {
        specimenId: 10,
        remainingQuantity: 1,
        state: { name: 'Active' },
        source: { type: 'subject', name: 'Sub-1' },
      },
    },
  ],
}

vi.mock('../../lib/api', () => ({
  collectionsApi: {
    getCryovialBox: vi.fn(),
  },
}))

vi.mock('../../hooks/useTableViewConfigurations', () => ({
  useTableViewConfigurations: () => ({
    configurations: [
      { name: 'Default', columns: ['position', 'barcode', 'status', 'subject_name'], isDefault: true },
    ],
    selectedConfigId: 'Default',
    setSelectedConfigId: vi.fn(),
    loading: false,
    error: null,
    loadConfigurations: vi.fn(),
  }),
}))

import { collectionsApi } from '../../lib/api'

describe('CryovialBoxDetail', () => {
  beforeEach(() => {
    vi.mocked(collectionsApi.getCryovialBox).mockResolvedValue({
      data: { box: mockBox, positions: mockPositions },
      status: 200,
      statusText: 'OK',
      headers: {},
      config: {} as import('axios').AxiosResponse['config'],
    })
  })

  it('shows box layout and Grid/Table toggle', async () => {
    await render(<CryovialBoxDetail />)
    await waitFor(() => {
      expect(screen.getByText('Box Layout')).toBeInTheDocument()
    })
    expect(screen.getByRole('button', { name: /Grid/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Table/i })).toBeInTheDocument()
  })

  it('table view shows expected columns and Export CSV', async () => {
    await render(<CryovialBoxDetail />)
    await waitFor(() => {
      expect(screen.getByText('Box Layout')).toBeInTheDocument()
    })
    await userEvent.click(screen.getByRole('button', { name: /Table/i }))
    await waitFor(() => {
      expect(screen.getByRole('columnheader', { name: /Position/i })).toBeInTheDocument()
    })
    expect(screen.getByRole('button', { name: /Export CSV/i })).toBeInTheDocument()
  })

  it('Export CSV triggers download with expected filename', async () => {
    const downloadSpy = vi.spyOn(csv, 'downloadCsv').mockImplementation(() => {})
    await render(<CryovialBoxDetail />)
    await waitFor(() => {
      expect(screen.getByText('Box Layout')).toBeInTheDocument()
    })
    await userEvent.click(screen.getByRole('button', { name: /Table/i }))
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Export CSV/i })).toBeInTheDocument()
    })
    await userEvent.click(screen.getByRole('button', { name: /Export CSV/i }))
    expect(downloadSpy).toHaveBeenCalled()
    const [, filename] = downloadSpy.mock.calls[0]
    expect(filename).toMatch(/cryovial-box.*\.csv$/)
    downloadSpy.mockRestore()
  })
})
