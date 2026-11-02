import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, within } from '../../__tests__/helpers/render'
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
        tags: [{ id: 1, name: 'QC' }],
        source: { type: 'subject', name: 'Sub-1' },
      },
    },
  ],
}

vi.mock('../../lib/api/collections', async () => {
  const { createMockedDomainModule } = await import('../../__tests__/helpers/mock-api')
  return createMockedDomainModule('collections', {
  collectionsApi: {
    getCryovialBox: vi.fn(),
  }
  })
})

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

import { collectionsApi } from '../../lib/api/collections'

describe('CryovialBoxDetail', () => {
  beforeEach(() => {
    vi.mocked(collectionsApi.getCryovialBox).mockResolvedValue({
      box: mockBox,
      positions: mockPositions,
      unplaced: [],
    })
  })

  it('shows an error when the box fails to load', async () => {
    vi.mocked(collectionsApi.getCryovialBox).mockRejectedValue(new Error('boom'))
    await render(<CryovialBoxDetail />)
    expect(await screen.findByText('Could not load cryovial box')).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: /Unplaced/ })).not.toBeInTheDocument()
  })

  it('draws every row and column of the box in natural order, even when only A01 is filled', async () => {
    await render(<CryovialBoxDetail />)
    await screen.findByText('Box Layout')

    const grid = screen.getAllByRole('table')[0]!
    const headerCells = within(within(grid).getAllByRole('row')[0]!).getAllByRole('columnheader')
    expect(headerCells.slice(1).map((c) => c.textContent)).toEqual(['1', '2', '3', '4', '5', '6', '7', '8', '9', '10'])
    const rowLabels = within(grid).getAllByRole('row').slice(1).map((row) => row.firstElementChild?.textContent)
    expect(rowLabels).toEqual(['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J'])
    expect(within(grid).getAllByText('Empty')).toHaveLength(99)
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

  describe('with unplaced Containers', () => {
    const unplacedTube = (id: number, barcode: string, position: string | null) => ({
      kind: 'cryovial_tube' as const,
      id,
      barcode,
      ...(position != null && { position }),
      container: { specimenId: id, remainingQuantity: 0, tags: [], source: { type: 'subject', name: `Sub-${id}` } },
    })

    beforeEach(() => {
      vi.mocked(collectionsApi.getCryovialBox).mockResolvedValue({
        box: mockBox,
        positions: mockPositions,
        unplaced: [
          unplacedTube(401, 'CV-DASH', '--A01'),
          unplacedTube(402, 'CV-NA', 'NA01'),
          unplacedTube(403, 'CV-NOPOS', null),
        ],
      })
    })

    it('lists unplaced Containers in an Unplaced section labelled with their stored position', async () => {
      await render(<CryovialBoxDetail />)

      const heading = await screen.findByRole('heading', { name: 'Unplaced (3)' })
      const section = heading.closest('section')!
      const rows = within(section).getAllByRole('row').slice(1)
      expect(rows.map((row) => within(row).getAllByRole('cell').map((c) => c.textContent))).toEqual([
        ['--A01', 'CV-DASH', 'Sub-401', '', 'Exhausted'],
        ['NA01', 'CV-NA', 'Sub-402', '', 'Exhausted'],
        ['None', 'CV-NOPOS', 'Sub-403', '', 'Exhausted'],
      ])
    })

    it('includes unplaced Containers in the table view and its export', async () => {
      const downloadSpy = vi.spyOn(csv, 'downloadCsv').mockImplementation(() => {})
      await render(<CryovialBoxDetail />)
      await screen.findByText('Box Layout')
      await userEvent.click(screen.getByRole('button', { name: /Table/i }))

      const table = await screen.findByRole('table')
      const rows = within(table).getAllByRole('row').slice(1)
      expect(rows.map((row) => within(row).getAllByRole('cell').slice(0, 2).map((c) => c.textContent))).toEqual([
        ['A01', 'CV-001'],
        ['--A01', 'CV-DASH'],
        ['NA01', 'CV-NA'],
        ['', 'CV-NOPOS'],
      ])

      await userEvent.click(screen.getByRole('button', { name: /Export CSV/i }))
      const [csvContent] = downloadSpy.mock.calls[0]!
      expect(csvContent).toContain('CV-DASH')
      expect(csvContent).toContain('NA01')
      expect(csvContent).toContain('CV-NOPOS')
      downloadSpy.mockRestore()
    })
  })
})
