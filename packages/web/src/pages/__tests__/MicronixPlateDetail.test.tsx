import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '../../__tests__/helpers/render'
import userEvent from '@testing-library/user-event'
import MicronixPlateDetail from '../MicronixPlateDetail'
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

const mockPlate = { id: 1, name: 'PLATE1', barcode: 'PLT-001', locationId: 1, created: '', lastUpdated: '' }
const mockWells: Record<string, { type: 'micronix_tube'; id: number; barcode?: string | null; position?: string | null; container?: unknown }> = {
  A01: {
    type: 'micronix_tube',
    id: 101,
    barcode: 'MTX-001',
    position: 'A01',
    container: {
      specimenId: 42,
      remainingQuantity: 1,
      state: { name: 'Active' },
      source: { type: 'subject', name: 'Subject-1' },
    },
  },
}

vi.mock('../../lib/api', () => ({
  collectionsApi: {
    getMicronixPlate: vi.fn(),
  },
}))

vi.mock('../../hooks/useTableViewConfigurations', () => ({
  useTableViewConfigurations: () => ({
    configurations: [
      { name: 'Minimal', columns: ['status', 'position', 'barcode'], isDefault: true },
      { name: 'Full', columns: ['position', 'barcode', 'subject_name', 'study_code', 'status'], isDefault: false },
    ],
    selectedConfigId: 'Minimal',
    setSelectedConfigId: vi.fn(),
    loading: false,
    error: null,
    loadConfigurations: vi.fn(),
  }),
}))

import { collectionsApi } from '../../lib/api'

describe('MicronixPlateDetail', () => {
  beforeEach(() => {
    vi.mocked(collectionsApi.getMicronixPlate).mockResolvedValue({
      data: { plate: mockPlate, wells: mockWells },
      status: 200,
      statusText: 'OK',
      headers: {},
      config: {} as import('axios').AxiosResponse['config'],
    })
  })

  it('shows plate layout and loads grid by default', async () => {
    await render(<MicronixPlateDetail />)
    await waitFor(() => {
      expect(screen.getByText('Plate Layout')).toBeInTheDocument()
    })
    expect(screen.getByRole('button', { name: /Grid/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Table/i })).toBeInTheDocument()
  })

  it('table view shows expected columns and row count', async () => {
    await render(<MicronixPlateDetail />)
    await waitFor(() => {
      expect(screen.getByText('Plate Layout')).toBeInTheDocument()
    })
    await userEvent.click(screen.getByRole('button', { name: /Table/i }))
    await waitFor(() => {
      expect(screen.getByRole('columnheader', { name: /Position/i })).toBeInTheDocument()
    })
    // Mocked default config "Minimal" has columns status, position, barcode
    expect(screen.getByRole('columnheader', { name: /Status/i })).toBeInTheDocument()
    expect(screen.getByRole('columnheader', { name: /Barcode/i })).toBeInTheDocument()
    // No internal IDs in table
    expect(screen.queryByRole('columnheader', { name: /Container ID/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('columnheader', { name: /Specimen ID/i })).not.toBeInTheDocument()
    // 96 positions; one filled (A01)
    const tbody = document.querySelector('tbody')
    expect(tbody?.querySelectorAll('tr').length).toBe(96)
  })

  it('Export CSV triggers download with expected header and data', async () => {
    const downloadSpy = vi.spyOn(csv, 'downloadCsv').mockImplementation(() => {})
    await render(<MicronixPlateDetail />)
    await waitFor(() => {
      expect(screen.getByText('Plate Layout')).toBeInTheDocument()
    })
    await userEvent.click(screen.getByRole('button', { name: /Table/i }))
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Export CSV/i })).toBeInTheDocument()
    })
    await userEvent.click(screen.getByRole('button', { name: /Export CSV/i }))
    expect(downloadSpy).toHaveBeenCalled()
    const [csvContent, filename] = downloadSpy.mock.calls[0]
    expect(filename).toMatch(/micronix-plate.*\.csv$/)
    expect(csvContent).toContain('Position')
    expect(csvContent).toContain('Barcode')
    expect(csvContent).toContain('A01')
    expect(csvContent).toContain('MTX-001')
    // Mocked config "Minimal" has columns status, position, barcode only (no subject_name)
    expect(csvContent).toContain('Status')
    expect(csvContent).toContain('Position')
    expect(csvContent).toContain('Barcode')
    // No internal IDs in export
    expect(csvContent).not.toMatch(/\bContainer ID\b/)
    expect(csvContent).not.toMatch(/\bSpecimen ID\b/)
    downloadSpy.mockRestore()
  })

  it('table view uses selected view config for columns when configs are available', async () => {
    await render(<MicronixPlateDetail />)
    await waitFor(() => {
      expect(screen.getByText('Plate Layout')).toBeInTheDocument()
    })
    await userEvent.click(screen.getByRole('button', { name: /Table/i }))
    await waitFor(() => {
      expect(screen.getByRole('columnheader', { name: /Status/i })).toBeInTheDocument()
    })
    // Mocked config "Minimal" has columns ['status', 'position', 'barcode']
    expect(screen.getByRole('columnheader', { name: /Status/i })).toBeInTheDocument()
    expect(screen.getByRole('columnheader', { name: /Position/i })).toBeInTheDocument()
    expect(screen.getByRole('columnheader', { name: /Barcode/i })).toBeInTheDocument()
    // Columns not in Minimal config should not appear
    expect(screen.queryByRole('columnheader', { name: /Subject Name/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('columnheader', { name: /Study Code/i })).not.toBeInTheDocument()
  })
})
