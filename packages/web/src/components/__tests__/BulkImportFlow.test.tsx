import { describe, it, expect, vi, beforeEach, beforeAll, afterAll } from 'vitest'
import { render, screen, fireEvent, waitFor, act } from '../../__tests__/helpers/render'
import userEvent from '@testing-library/user-event'
import BulkImportFlow from '../BulkImportFlow'
import { importsApi } from '../../lib/api/imports'
import { specimenTypesApi } from '../../lib/api/reference-data'
import { collectionsApi } from '../../lib/api/collections'

vi.mock('../LocationPicker', () => ({
  default: ({ onChange }: { onChange: (id: number | null) => void }) => (
    <button type="button" onClick={() => onChange(10)}>
      Select location 10
    </button>
  ),
}))

vi.mock('../../lib/api/reference-data', async () => {
  const { createMockedDomainModule } = await import('../../__tests__/helpers/mock-api')
  const { bulkImportFlowMock } = await import('../../__tests__/helpers/mock-api-templates')
  return createMockedDomainModule('reference-data', bulkImportFlowMock())
})

vi.mock('../../lib/api/subjects', async () => {
  const { createMockedDomainModule } = await import('../../__tests__/helpers/mock-api')
  const { bulkImportFlowMock } = await import('../../__tests__/helpers/mock-api-templates')
  return createMockedDomainModule('subjects', bulkImportFlowMock())
})

vi.mock('../../lib/api/specimens', async () => {
  const { createMockedDomainModule } = await import('../../__tests__/helpers/mock-api')
  const { bulkImportFlowMock } = await import('../../__tests__/helpers/mock-api-templates')
  return createMockedDomainModule('specimens', bulkImportFlowMock())
})

vi.mock('../../lib/api/imports', async () => {
  const { createMockedDomainModule } = await import('../../__tests__/helpers/mock-api')
  const { bulkImportFlowMock } = await import('../../__tests__/helpers/mock-api-templates')
  return createMockedDomainModule('imports', bulkImportFlowMock())
})

vi.mock('../../lib/api/collections', async () => {
  const { createMockedDomainModule } = await import('../../__tests__/helpers/mock-api')
  const { bulkImportFlowMock } = await import('../../__tests__/helpers/mock-api-templates')
  return createMockedDomainModule('collections', bulkImportFlowMock())
})

describe('BulkImportFlow', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders upload step content', async () => {
    await render(<BulkImportFlow />)
    expect(screen.getByRole('button', { name: /validate.*continue/i })).toBeInTheDocument()
  })

  it('shows Validate & Continue or Download template on upload step', async () => {
    await render(<BulkImportFlow />)
    const validateBtn = screen.queryByRole('button', { name: /validate.*continue/i })
    const downloadLink = screen.queryByText(/download template|template/i)
    expect(validateBtn ?? downloadLink).toBeTruthy()
  })

  it('shows upload step when step=import in URL but no file (resets on reload)', async () => {
    await render(<BulkImportFlow fixedStudyShortCode="ST" />, {
      initialEntries: ['/import?step=import'],
    })
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /validate.*continue/i })).toBeInTheDocument()
    })
  })

  it('calls specimenTypesApi.getByContainerType when downloading template with container type', async () => {
    const user = userEvent.setup()
    await render(<BulkImportFlow />, { initialEntries: ['/import?step=upload'] })
    await user.selectOptions(screen.getByLabelText(/import type/i), 'combined')
    await user.selectOptions(screen.getByRole('combobox', { name: /container type/i }), 'micronix_tube')

    await user.click(screen.getByRole('button', { name: /download template/i }))

    await waitFor(() => {
      expect(specimenTypesApi.getByContainerType).toHaveBeenCalledWith('micronix_tube')
    })
    expect(specimenTypesApi.list).not.toHaveBeenCalled()
  })

  it('calls specimenTypesApi.list when downloading template with container type none', async () => {
    const user = userEvent.setup()
    await render(<BulkImportFlow />, { initialEntries: ['/import?step=upload'] })
    await user.selectOptions(screen.getByLabelText(/import type/i), 'specimens')
    await user.selectOptions(screen.getByRole('combobox', { name: /container type/i }), 'none')

    const downloadBtn = screen.getByRole('button', { name: /download template/i })
    await user.click(downloadBtn)

    await waitFor(() => {
      expect(specimenTypesApi.list).toHaveBeenCalled()
    })
    expect(specimenTypesApi.getByContainerType).not.toHaveBeenCalled()
  })

  it('after Validate & Continue, server validation failure keeps user on upload and shows errors (combined with containers)', async () => {
    const text =
      'subject_name,specimen_type_name,plate_name,barcode,position\nS1,Serum,PL1,B1,A01'
    const blobProto = Blob.prototype as { text?: () => Promise<string> } & object
    const fileProto = File.prototype as { text?: () => Promise<string> } & object
    const prevBlobText = blobProto.text
    const prevFileText = fileProto.text
    const reader = function (this: Blob) {
      return Promise.resolve(text)
    }
    fileProto.text = reader
    if (!prevBlobText) {
      blobProto.text = reader
    }
    vi.mocked(importsApi.bulkCombinedValidate).mockResolvedValue({
      valid: false,
      errors: [{ subjectIndex: 0, message: "Barcode 'B1' is already in use on the server.", rowIndex: 1 }],
    })
    const user = userEvent.setup()
    const file = new File([text], 'i.csv', { type: 'text/csv' })
    await render(<BulkImportFlow fixedStudyShortCode="ST" />, { initialEntries: ['/import?step=upload'] })
    await user.selectOptions(screen.getByLabelText(/import type/i), 'combined')
    await user.selectOptions(screen.getByLabelText(/container type/i), 'micronix_tube')
    await waitFor(() => {
      const importType = screen.getByLabelText(/import type/i) as HTMLSelectElement
      const container = screen.getByLabelText(/container type/i) as HTMLSelectElement
      expect(importType.value).toBe('combined')
      expect(container.value).toBe('micronix_tube')
    })
    const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement
    fireEvent.change(fileInput, { target: { files: [file] } })
    await waitFor(() => {
      expect(screen.getByText('S1')).toBeInTheDocument()
    })
    const form = fileInput.closest('form')!
    await act(async () => {
      fireEvent.submit(form)
    })
    await waitFor(
      () => {
        expect(importsApi.bulkCombinedValidate).toHaveBeenCalled()
      },
      { timeout: 5000 }
    )
    expect(screen.getByText(/already in use on the server/i)).toBeInTheDocument()
    if (prevFileText) fileProto.text = prevFileText; else delete fileProto.text
    if (prevBlobText) blobProto.text = prevBlobText; else delete blobProto.text
  })

  it('download template with micronix_tube produces conformant CSV with specimen type and A01 position', async () => {
    const user = userEvent.setup()
    await render(<BulkImportFlow />, { initialEntries: ['/import?step=upload'] })
    await user.selectOptions(screen.getByLabelText(/import type/i), 'combined')
    await user.selectOptions(screen.getByRole('combobox', { name: /container type/i }), 'micronix_tube')

    let capturedContent = ''
    const createObjectURL = vi.spyOn(URL, 'createObjectURL').mockImplementation((obj: Blob | MediaSource) => {
      const blob = obj as Blob
      const reader = new FileReader()
      reader.onload = () => { capturedContent = reader.result as string }
      reader.readAsText(blob)
      return 'blob:mock'
    })

    await user.click(screen.getByRole('button', { name: /download template/i }))

    await waitFor(() => {
      expect(createObjectURL).toHaveBeenCalled()
    })
    await waitFor(() => {
      expect(capturedContent).toContain('Whole Blood')
      expect(capturedContent).toMatch(/,A01,/)
    })
  })

  describe('creating missing Collections (combined, per subject)', () => {
    /** Upload `text` as a combined micronix import with per-subject atomicity and validate it. */
    async function validateCsv(text: string) {
      const user = userEvent.setup()
      await render(<BulkImportFlow fixedStudyShortCode="ST" />, { initialEntries: ['/import?step=upload'] })
      await user.selectOptions(screen.getByLabelText(/import type/i), 'combined')
      await user.selectOptions(screen.getByLabelText(/container type/i), 'micronix_tube')
      await user.click(screen.getByRole('radio', { name: /per subject/i }))
      const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement
      await user.upload(fileInput, new File([text], 'i.csv', { type: 'text/csv' }))
      // jsdom's constraint validation does not see user-event's file on the required input,
      // so clicking Validate & Continue would not submit; submit the form directly.
      await act(async () => {
        fireEvent.submit(fileInput.closest('form')!)
      })
      return user
    }

    // jsdom's File has no text(); read the uploaded file with FileReader instead.
    const fileProto = File.prototype as { text?: () => Promise<string> }
    const originalText = fileProto.text
    beforeAll(() => {
      fileProto.text = function (this: File) {
        return new Promise<string>((resolve) => {
          const reader = new FileReader()
          reader.onload = () => resolve(reader.result as string)
          reader.readAsText(this)
        })
      }
    })
    afterAll(() => {
      if (originalText) fileProto.text = originalText
      else delete fileProto.text
    })

    beforeEach(() => {
      vi.mocked(importsApi.bulkCombinedValidate).mockResolvedValue({ valid: true, errors: [] })
      vi.mocked(collectionsApi.check).mockImplementation(({ collections }) =>
        Promise.resolve({
          results: collections.map((c) => ({ ...c, exists: false, id: null })),
        }),
      )
      vi.mocked(collectionsApi.createMicronixPlate).mockResolvedValue({
        plate: {} as Awaited<ReturnType<typeof collectionsApi.createMicronixPlate>>['plate'],
      })
    })

    it('creates one plate named after a barcode-shaped plate_name', async () => {
      const user = await validateCsv(
        'subject_name,specimen_type_name,plate_name,barcode,position\n' +
          'S1,Serum,PLATE-001,MT1,A01\n' +
          'S2,Serum,PLATE-001,MT2,A02',
      )

      expect(await screen.findByRole('heading', { name: 'PLATE-001' })).toBeInTheDocument()
      expect(collectionsApi.check).toHaveBeenCalledWith({
        collections: [{ identifier: 'PLATE-001', type: 'micronix_plate' }],
      })
      expect(screen.queryByText(/named after its barcode/i)).not.toBeInTheDocument()

      await user.click(screen.getByRole('button', { name: 'Select location 10' }))
      await user.click(screen.getByRole('button', { name: /create collections & continue/i }))

      await waitFor(() => expect(importsApi.bulkCombined).toHaveBeenCalled())
      expect(collectionsApi.createMicronixPlate).toHaveBeenCalledTimes(1)
      expect(collectionsApi.createMicronixPlate).toHaveBeenCalledWith({
        name: 'PLATE-001',
        locationId: 10,
        barcode: undefined,
      })
      const request = vi.mocked(importsApi.bulkCombined).mock.calls[0]![0]
      const collections = request.subjects.flatMap((s) => s.specimens.map((sp) => sp.container?.collection))
      expect(collections).toEqual([
        expect.objectContaining({ type: 'micronix_plate', name: 'PLATE-001' }),
        expect.objectContaining({ type: 'micronix_plate', name: 'PLATE-001' }),
      ])
      for (const collection of collections) expect(collection).not.toHaveProperty('barcode')
    })

    it('creates one plate with the name from plate_name and the barcode from collection_barcode', async () => {
      const user = await validateCsv(
        'subject_name,specimen_type_name,plate_name,collection_barcode,barcode,position\n' +
          'S1,Serum,My Plate,PB-778899,MT1,A01\n' +
          'S2,Serum,My Plate,PB-778899,MT2,A02',
      )

      expect(await screen.findByRole('heading', { name: 'My Plate' })).toBeInTheDocument()
      expect(screen.getByText('Barcode: PB-778899')).toBeInTheDocument()

      await user.click(screen.getByRole('button', { name: 'Select location 10' }))
      await user.click(screen.getByRole('button', { name: /create collections & continue/i }))

      await waitFor(() => expect(importsApi.bulkCombined).toHaveBeenCalled())
      expect(collectionsApi.createMicronixPlate).toHaveBeenCalledTimes(1)
      expect(collectionsApi.createMicronixPlate).toHaveBeenCalledWith({
        name: 'My Plate',
        locationId: 10,
        barcode: 'PB-778899',
      })
    })

    it('names a plate given only by collection_barcode after its barcode', async () => {
      const user = await validateCsv(
        'subject_name,specimen_type_name,collection_barcode,barcode,position\n' +
          'S1,Serum,plate 7,MT1,A01',
      )

      expect(await screen.findByText('Barcode: plate 7')).toBeInTheDocument()
      expect(screen.getByText(/named after its barcode/i)).toBeInTheDocument()

      await user.click(screen.getByRole('button', { name: 'Select location 10' }))
      await user.click(screen.getByRole('button', { name: /create collections & continue/i }))

      await waitFor(() => expect(importsApi.bulkCombined).toHaveBeenCalled())
      expect(collectionsApi.createMicronixPlate).toHaveBeenCalledTimes(1)
      expect(collectionsApi.createMicronixPlate).toHaveBeenCalledWith({
        name: 'plate 7',
        locationId: 10,
        barcode: 'plate 7',
      })
    })
  })
})
