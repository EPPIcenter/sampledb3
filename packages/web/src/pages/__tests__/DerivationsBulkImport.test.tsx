import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '../../__tests__/helpers/render'
import userEvent from '@testing-library/user-event'
import DerivationsBulkImport from '../DerivationsBulkImport'
import * as api from '../../lib/api'

const mockSetSearchParams = vi.fn()
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom')
  return {
    ...actual,
    useSearchParams: () => [new URLSearchParams(), mockSetSearchParams],
  }
})

vi.mock('../../lib/api', () => ({
  derivationsApi: { validateCsv: vi.fn(), importCsv: vi.fn() },
  collectionsApi: { createMicronixPlate: vi.fn(), createCryovialBox: vi.fn() },
  specimenTypesApi: {
    list: vi.fn().mockResolvedValue({ data: [] }),
    getContainerTypes: vi.fn().mockResolvedValue({ data: { containerTypes: ['micronix_tube'] } }),
  },
  unitsApi: { list: vi.fn().mockResolvedValue({ data: [] }) },
}))

vi.mock('../../contexts/UserContext', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../contexts/UserContext')>()
  return {
    ...actual,
    useUser: () => ({ canWrite: true }),
  }
})

describe('DerivationsBulkImport', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(api.specimenTypesApi.list).mockResolvedValue({ data: [] } as never)
    vi.mocked(api.unitsApi.list).mockResolvedValue({ data: [] } as never)
  })

  it('renders without crashing', async () => {
    const { container } = await render(<DerivationsBulkImport />)
    expect(container).toBeInTheDocument()
  })

  it('shows derivation import content', async () => {
    await render(<DerivationsBulkImport />)
    await waitFor(() => {
      const matches = screen.getAllByText(/derivation|upload|CSV|Validate/i)
      expect(matches.length).toBeGreaterThan(0)
    }, { timeout: 3000 })
  })

  it('shows upload step with Source and Parent container type', async () => {
    await render(<DerivationsBulkImport />)
    await waitFor(() => {
      expect(screen.getByText(/Source/)).toBeInTheDocument()
      expect(screen.getByText(/Parent container type/)).toBeInTheDocument()
      const comboboxes = screen.getAllByRole('combobox')
      expect(comboboxes.length).toBeGreaterThanOrEqual(2)
    })
  })

  it('shows Download template button', async () => {
    await render(<DerivationsBulkImport />)
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /download template/i })).toBeInTheDocument()
    })
  })

  it('disables Validate & Continue when no file selected', async () => {
    await render(<DerivationsBulkImport />)
    await waitFor(() => {
      const btn = screen.getByRole('button', { name: /validate & continue/i })
      expect(btn).toBeDisabled()
    })
  })

  it('shows error when validation fails', async () => {
    vi.mocked(api.derivationsApi.validateCsv).mockRejectedValue(new Error('Invalid CSV'))
    const user = userEvent.setup()
    await render(<DerivationsBulkImport />)
    const file = new File(['col1,col2\na,b'], 'test.csv', { type: 'text/csv' })
    const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement
    expect(fileInput).toBeInTheDocument()
    await user.upload(fileInput, file)
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /validate & continue/i })).not.toBeDisabled()
    }, { timeout: 2000 })
    await user.click(screen.getByRole('button', { name: /validate & continue/i }))
    await waitFor(() => {
      expect(screen.getByText(/invalid csv|failed to validate/i)).toBeInTheDocument()
    }, { timeout: 3000 })
  })

  it('calls validateCsv and advances when validation succeeds with no missing collections', async () => {
    vi.mocked(api.derivationsApi.validateCsv).mockResolvedValue({
      data: {
        valid: true,
        invalidRows: [],
        collections: [],
        summary: { total: 1, valid: 1, invalid: 0 },
      },
    } as never)
    const user = userEvent.setup()
    await render(<DerivationsBulkImport />)
    const file = new File(['parent_container_barcode,collection_name,position\nBAR1,Plate1,A1'], 'test.csv', {
      type: 'text/csv',
    })
    const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement
    await user.upload(fileInput, file)
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /validate & continue/i })).not.toBeDisabled()
    }, { timeout: 2000 })
    await user.click(screen.getByRole('button', { name: /validate & continue/i }))
    await waitFor(() => {
      expect(api.derivationsApi.validateCsv).toHaveBeenCalled()
      expect(mockSetSearchParams).toHaveBeenCalled()
    }, { timeout: 3000 })
  })
})
