import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '../../__tests__/helpers/render'
import DerivationsBulkImport from '../DerivationsBulkImport'
import { specimenTypesApi, unitsApi } from '../../lib/api/reference-data'

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
})
