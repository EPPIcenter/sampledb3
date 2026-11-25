import { describe, it, expect, vi, beforeEach } from 'vitest'
import userEvent from '@testing-library/user-event'
import { render, screen, waitFor, within } from '../../__tests__/helpers/render'
import DerivationsBulkImport from '../DerivationsBulkImport'
import { specimenTypesApi, unitsApi } from '../../lib/api/reference-data'
import { collectionsApi } from '../../lib/api/collections'
import { derivationsApi } from '../../lib/api/derivations'
import { locationsApi } from '../../lib/api/locations'

vi.mock('../../lib/api/locations', async () => {
  const { createMockedDomainModule } = await import('../../__tests__/helpers/mock-api')
  return createMockedDomainModule('locations', {
    locationsApi: {
      list: vi.fn().mockResolvedValue({
        locations: [
          {
            id: 7,
            name: 'Freezer 1',
            path: 'Freezer 1',
            parentId: null,
            canContainCollections: true,
            storageTypeId: '1',
            created: '',
            lastUpdated: '',
          },
        ],
      }),
    },
  })
})

vi.mock('../../lib/api/reference-data', async () => {
  const { createMockedDomainModule } = await import('../../__tests__/helpers/mock-api')
  const { derivationsBulkImportPageMock } = await import('../../__tests__/helpers/mock-api-templates')
  const { specimenTypesApi, unitsApi } = derivationsBulkImportPageMock()
  return createMockedDomainModule('reference-data', { specimenTypesApi, unitsApi })
})

vi.mock('../../lib/api/collections', async () => {
  const { createMockedDomainModule } = await import('../../__tests__/helpers/mock-api')
  const { derivationsBulkImportPageMock } = await import('../../__tests__/helpers/mock-api-templates')
  const { collectionsApi } = derivationsBulkImportPageMock()
  return createMockedDomainModule('collections', { collectionsApi })
})

vi.mock('../../lib/api/derivations', async () => {
  const { createMockedDomainModule } = await import('../../__tests__/helpers/mock-api')
  const { derivationsBulkImportPageMock } = await import('../../__tests__/helpers/mock-api-templates')
  const { derivationsApi } = derivationsBulkImportPageMock()
  return createMockedDomainModule('derivations', { derivationsApi })
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
    vi.mocked(locationsApi.list).mockResolvedValue({
      locations: [
        {
          id: 7,
          name: 'Freezer 1',
          path: 'Freezer 1',
          parentId: null,
          canContainCollections: true,
          storageTypeId: '1',
          created: '',
          lastUpdated: '',
        },
      ],
    })
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

    // The file's row 3, counting the header as row 1.
    expect(await screen.findByRole('alert')).toHaveTextContent(`Row 3: ${message}`)
  })

  describe('a file with blank rows', () => {
    // Row 1 header, row 2 data, rows 3 and 4 blank, row 5 data, row 6 blank.
    const csv =
      'parent_container_id,plate_name,position,container_barcode\n' +
      '1,P,A01,C1\n' +
      '\n' +
      ',,,\n' +
      '2,P,A02,C2\n' +
      ',  ,,\n'

    async function uploadAndValidate() {
      const user = userEvent.setup()
      const { container } = await render(<DerivationsBulkImport />)
      const fileInput = container.querySelector<HTMLInputElement>('#derivation-csv-file')!
      await waitFor(() => expect(fileInput).toBeEnabled())
      await user.upload(fileInput, new File([csv], 'derivations.csv', { type: 'text/csv' }))
      const validate = screen.getByRole('button', { name: /validate & continue/i })
      await waitFor(() => expect(validate).toBeEnabled())
      await user.click(validate)
      return user
    }

    it('leaves blank rows out of review and numbers the rest by their file row', async () => {
      vi.mocked(derivationsApi.validateCsv).mockResolvedValue({
        rows: [
          { index: 0, valid: true },
          { index: 1, valid: false, error: 'Parent container not found' },
        ],
        collections: [],
        summary: { total: 2, valid: 1, invalid: 1, warnings: 0 },
      })
      await uploadAndValidate()

      expect(await screen.findByRole('alert')).toHaveTextContent('Row 5: Parent container not found')
      const tables = screen.getAllByRole('table')
      const reviewTable = tables[tables.length - 1]!
      const bodyRows = within(reviewTable).getAllByRole('row').slice(1)
      expect(bodyRows.map((row) => within(row).getAllByRole('cell')[0]!.textContent)).toEqual(['2', '5'])
    })

    it('submits no blank rows and numbers import results by their file row', async () => {
      vi.mocked(derivationsApi.validateCsv).mockResolvedValue({
        rows: [
          { index: 0, valid: true },
          { index: 1, valid: true },
        ],
        collections: [],
        summary: { total: 2, valid: 2, invalid: 0, warnings: 0 },
      })
      vi.mocked(derivationsApi.importCsv).mockResolvedValue({
        rows: [
          { index: 0, success: true },
          { index: 1, success: false, error: 'Position A02 is taken' },
        ],
      })
      const user = await uploadAndValidate()
      await user.click(await screen.findByRole('button', { name: /create derivations/i }))

      await waitFor(() => expect(derivationsApi.importCsv).toHaveBeenCalled())
      const sent = vi.mocked(derivationsApi.importCsv).mock.calls[0]![0]
      expect(sent).toBe('parent_container_id,plate_name,position,container_barcode\n1,P,A01,C1\n2,P,A02,C2')

      const results = await screen.findByRole('heading', { name: 'Import results' })
      const resultsTable = within(results.parentElement!).getByRole('table')
      const resultRows = within(resultsTable).getAllByRole('row').slice(1)
      expect(resultRows.map((row) => within(row).getAllByRole('cell')[0]!.textContent)).toEqual(['2', '5'])
    })
  })

  it('does not pre-create missing Collections before import and attaches collection_location_id on submit', async () => {
    const user = userEvent.setup()
    vi.mocked(derivationsApi.validateCsv).mockResolvedValue({
      rows: [{ index: 0, valid: true, collectionStatus: 'will_be_created' }],
      collections: [{ name: 'NEW-PLATE', status: 'will_be_created', containerType: 'micronix_tube' }],
      summary: { total: 1, valid: 1, invalid: 0, warnings: 0 },
    })
    vi.mocked(derivationsApi.importCsv).mockRejectedValueOnce(new Error('Server rejected import'))

    const { container } = await render(<DerivationsBulkImport />)
    const fileInput = container.querySelector<HTMLInputElement>('#derivation-csv-file')!
    await waitFor(() => expect(fileInput).toBeEnabled())
    const csv = 'parent_container_id,plate_name,position,container_barcode\n1,NEW-PLATE,A01,C1\n'
    await user.upload(fileInput, new File([csv], 'derivations.csv', { type: 'text/csv' }))
    await user.click(screen.getByRole('button', { name: /validate & continue/i }))

    expect(await screen.findByRole('heading', { name: /assign locations for new collections/i })).toBeInTheDocument()
    const continueBtn = screen.getByRole('button', { name: /continue to review/i })
    expect(continueBtn).toBeDisabled()

    await user.click(screen.getByRole('button', { name: /select location/i }))
    await user.click(await screen.findByRole('button', { name: /^select$/i }))
    expect(continueBtn).toBeEnabled()
    await user.click(continueBtn)

    expect(collectionsApi.createMicronixPlate).not.toHaveBeenCalled()
    expect(collectionsApi.createCryovialBox).not.toHaveBeenCalled()

    const importBtn = await screen.findByRole('button', { name: /create derivations/i })
    await user.click(importBtn)

    await waitFor(() => expect(derivationsApi.importCsv).toHaveBeenCalledTimes(1))
    const sentCsv = vi.mocked(derivationsApi.importCsv).mock.calls[0]![0]
    expect(sentCsv).toBe(
      'parent_container_id,plate_name,position,container_barcode,collection_location_id\n1,NEW-PLATE,A01,C1,7',
    )
    expect(await screen.findByText('Server rejected import')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /create derivations/i })).toBeEnabled()
  })

  it('sends the wizard-chosen Location instead of a location_id column from the CSV', async () => {
    const user = userEvent.setup()
    vi.mocked(derivationsApi.validateCsv).mockResolvedValue({
      rows: [{ index: 0, valid: true, collectionStatus: 'will_be_created' }],
      collections: [{ name: 'NEW-P', status: 'will_be_created', containerType: 'micronix_tube' }],
      summary: { total: 1, valid: 1, invalid: 0, warnings: 0 },
    })
    vi.mocked(derivationsApi.importCsv).mockResolvedValue({
      rows: [{ index: 0, success: true }],
    })

    const { container } = await render(<DerivationsBulkImport />)
    const fileInput = container.querySelector<HTMLInputElement>('#derivation-csv-file')!
    await waitFor(() => expect(fileInput).toBeEnabled())
    const csv = 'parent_container_id,plate_name,position,container_barcode,location_id\n1,NEW-P,A01,C1,3\n'
    await user.upload(fileInput, new File([csv], 'derivations.csv', { type: 'text/csv' }))
    await user.click(screen.getByRole('button', { name: /validate & continue/i }))

    expect(await screen.findByRole('heading', { name: /assign locations for new collections/i })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /select location/i }))
    await user.click(await screen.findByRole('button', { name: /^select$/i }))
    await user.click(screen.getByRole('button', { name: /continue to review/i }))

    await user.click(await screen.findByRole('button', { name: /create derivations/i }))

    await waitFor(() => expect(derivationsApi.importCsv).toHaveBeenCalledTimes(1))
    expect(vi.mocked(derivationsApi.importCsv).mock.calls[0]![0]).toBe(
      'parent_container_id,plate_name,position,container_barcode,location_id\n1,NEW-P,A01,C1,7',
    )
  })
})
