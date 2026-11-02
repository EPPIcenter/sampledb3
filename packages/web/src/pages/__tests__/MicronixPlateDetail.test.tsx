import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, within } from '../../__tests__/helpers/render'
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
      tags: [{ id: 1, name: 'QC' }, { id: 2, name: 'Hold' }],
      source: { type: 'subject', name: 'Subject-1' },
    },
  },
}

vi.mock('../../lib/api/collections', async () => {
  const { createMockedDomainModule } = await import('../../__tests__/helpers/mock-api')
  return createMockedDomainModule('collections', {
  collectionsApi: {
    getMicronixPlate: vi.fn(),
  }
  })
})

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

import { collectionsApi } from '../../lib/api/collections'

describe('MicronixPlateDetail', () => {
  beforeEach(() => {
    vi.mocked(collectionsApi.getMicronixPlate).mockResolvedValue({
      plate: mockPlate,
      wells: mockWells,
      unplaced: [],
    })
  })

  it('shows a loading state before the plate arrives', async () => {
    vi.mocked(collectionsApi.getMicronixPlate).mockReturnValue(new Promise(() => {}))
    await render(<MicronixPlateDetail />)
    expect(screen.queryByText('Plate Layout')).not.toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: /Unplaced/ })).not.toBeInTheDocument()
  })

  it('shows plate layout and loads grid by default', async () => {
    await render(<MicronixPlateDetail />)
    await waitFor(() => {
      expect(screen.getByText('Plate Layout')).toBeInTheDocument()
    })
    expect(screen.getByRole('button', { name: /Grid/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Table/i })).toBeInTheDocument()
  })

  it('shows tag names in grid legend when wells have tags', async () => {
    await render(<MicronixPlateDetail />)
    await waitFor(() => {
      expect(screen.getByText('Legend:')).toBeInTheDocument()
    })
    expect(screen.getByText('QC')).toBeInTheDocument()
    expect(screen.getByText('Hold')).toBeInTheDocument()
    expect(screen.getByText('In Use')).toBeInTheDocument()
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

  describe('with unplaced Containers', () => {
    const unplacedTube = (id: number, barcode: string, position: string | null) => ({
      type: 'micronix_tube' as const,
      id,
      barcode,
      ...(position != null && { position }),
      container: { specimenId: id, remainingQuantity: 1, tags: [], source: { type: 'subject', name: `Sub-${id}` } },
    })

    beforeEach(() => {
      vi.mocked(collectionsApi.getMicronixPlate).mockResolvedValue({
        plate: mockPlate,
        wells: mockWells,
        unplaced: [
          unplacedTube(301, 'MTX-BAD', 'A1145868849'),
          unplacedTube(302, 'MTX-NOPOS-1', null),
          unplacedTube(303, 'MTX-NOPOS-2', null),
        ],
      })
    })

    it('lists unplaced Containers in an Unplaced section labelled with their stored position', async () => {
      await render(<MicronixPlateDetail />)

      const heading = await screen.findByRole('heading', { name: 'Unplaced (3)' })
      const section = heading.closest('section')!
      const rows = within(section).getAllByRole('row').slice(1)
      expect(rows.map((row) => within(row).getAllByRole('cell')[0]!.textContent)).toEqual([
        'A1145868849',
        'None',
        'None',
      ])
      expect(within(section).getByRole('link', { name: 'MTX-NOPOS-1' })).toHaveAttribute('href', '/containers/302')
      expect(within(section).getByText('Sub-303')).toBeInTheDocument()
    })

    it('includes unplaced Containers after the 96 wells in the table view', async () => {
      await render(<MicronixPlateDetail />)
      await screen.findByText('Plate Layout')
      await userEvent.click(screen.getByRole('button', { name: /Table/i }))

      const table = await screen.findByRole('table')
      const rows = within(table).getAllByRole('row').slice(1)
      expect(rows).toHaveLength(99)
      expect(rows.slice(96).map((row) => within(row).getAllByRole('cell').map((c) => c.textContent))).toEqual([
        ['In Use', 'A1145868849', 'MTX-BAD'],
        ['In Use', '', 'MTX-NOPOS-1'],
        ['In Use', '', 'MTX-NOPOS-2'],
      ])
      expect(screen.queryByRole('heading', { name: /Unplaced/ })).not.toBeInTheDocument()
    })

    it('exports unplaced Containers with the table', async () => {
      const downloadSpy = vi.spyOn(csv, 'downloadCsv').mockImplementation(() => {})
      await render(<MicronixPlateDetail />)
      await screen.findByText('Plate Layout')
      await userEvent.click(screen.getByRole('button', { name: /Table/i }))
      await userEvent.click(await screen.findByRole('button', { name: /Export CSV/i }))

      const [csvContent] = downloadSpy.mock.calls[0]!
      expect(csvContent).toContain('A1145868849')
      expect(csvContent).toContain('MTX-BAD')
      expect(csvContent).toContain('MTX-NOPOS-1')
      expect(csvContent).toContain('MTX-NOPOS-2')
      downloadSpy.mockRestore()
    })
  })
})
