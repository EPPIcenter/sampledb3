import { describe, it, expect, vi, beforeEach } from 'vitest'
import userEvent from '@testing-library/user-event'
import { render, screen, waitFor } from '../../__tests__/helpers/render'
import DerivationsBulkImport from '../DerivationsBulkImport'
import { specimenTypesApi, unitsApi } from '../../lib/api/reference-data'
import { derivationsApi } from '../../lib/api/derivations'

vi.mock('../../lib/api/reference-data', async () => {
  const { createMockedDomainModule } = await import('../../__tests__/helpers/mock-api')
  const { derivationsBulkImportPageMock } = await import('../../__tests__/helpers/mock-api-templates')
  return createMockedDomainModule('reference-data', derivationsBulkImportPageMock())
})

vi.mock('../../lib/api/collections', async () => {
  const { createMockedDomainModule } = await import('../../__tests__/helpers/mock-api')
  const { derivationsBulkImportPageMock } = await import('../../__tests__/helpers/mock-api-templates')
  return createMockedDomainModule('collections', derivationsBulkImportPageMock())
})

vi.mock('../../lib/api/derivations', async () => {
  const { createMockedDomainModule } = await import('../../__tests__/helpers/mock-api')
  const { derivationsBulkImportPageMock } = await import('../../__tests__/helpers/mock-api-templates')
  return createMockedDomainModule('derivations', derivationsBulkImportPageMock())
})

vi.mock('../../contexts/UserContext', async () => {
  const actual = await vi.importActual<typeof import('../../contexts/UserContext')>('../../contexts/UserContext')
  return {
    ...actual,
    useUser: () => ({ canWrite: true }),
  }
})

describe('DerivationsBulkImport', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(specimenTypesApi.list).mockResolvedValue({ data: [] })
    vi.mocked(unitsApi.listAll).mockResolvedValue([])
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

  it('shows upload step when step=review in URL but no CSV (resets on reload)', async () => {
    await render(<DerivationsBulkImport />, {
      initialEntries: ['/derivations/import?step=review'],
    })
    await waitFor(() => {
      expect(screen.getByText(/Source/)).toBeInTheDocument()
      expect(screen.getByRole('button', { name: /validate & continue/i })).toBeInTheDocument()
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

  it('shows a quantity bounds error on its row after validation', async () => {
    const user = userEvent.setup()
    const message = "Quantity used (1) exceeds the Parent container's remaining quantity (0). Earlier rows in this file draw from the same Parent container."
    vi.mocked(derivationsApi.validateCsv).mockResolvedValue({
      rows: [
        { index: 0, valid: true },
        { index: 1, valid: false, error: message },
      ],
      collections: [],
      summary: { total: 2, valid: 1, invalid: 1, warnings: 0 },
    })
    const { container } = await render(<DerivationsBulkImport />)

    const fileInput = container.querySelector<HTMLInputElement>('#derivation-csv-file')!
    await waitFor(() => expect(fileInput).toBeEnabled())
    const csv = 'parent_container_id,plate_name,position,container_barcode,quantity_used\n1,P,A01,C1,4\n1,P,A02,C2,1\n'
    await user.upload(fileInput, new File([csv], 'derivations.csv', { type: 'text/csv' }))
    const validate = screen.getByRole('button', { name: /validate & continue/i })
    await waitFor(() => expect(validate).toBeEnabled())
    await user.click(validate)

    expect(await screen.findByRole('alert')).toHaveTextContent(`Row 2: ${message}`)
  })
})
