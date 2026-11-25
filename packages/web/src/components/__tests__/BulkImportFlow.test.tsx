import { describe, it, expect, vi, beforeEach, beforeAll, afterAll } from 'vitest'
import { render, screen, fireEvent, waitFor, act } from '../../__tests__/helpers/render'
import userEvent from '@testing-library/user-event'
import BulkImportFlow from '../BulkImportFlow'
import SetupGuard from '../SetupGuard'
import { importsApi } from '../../lib/api/imports'
import { specimenTypesApi } from '../../lib/api/reference-data'
import { collectionsApi } from '../../lib/api/collections'
import { specimensApi } from '../../lib/api/specimens'
import { setupApi } from '../../lib/api/settings'

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
  const { specimenTypesApi } = bulkImportFlowMock()
  return createMockedDomainModule('reference-data', { specimenTypesApi })
})

vi.mock('../../lib/api/subjects', async () => {
  const { createMockedDomainModule } = await import('../../__tests__/helpers/mock-api')
  const { bulkImportFlowMock } = await import('../../__tests__/helpers/mock-api-templates')
  const { subjectsApi } = bulkImportFlowMock()
  return createMockedDomainModule('subjects', { subjectsApi })
})

vi.mock('../../lib/api/specimens', async () => {
  const { createMockedDomainModule } = await import('../../__tests__/helpers/mock-api')
  const { bulkImportFlowMock } = await import('../../__tests__/helpers/mock-api-templates')
  const { specimensApi } = bulkImportFlowMock()
  return createMockedDomainModule('specimens', { specimensApi })
})

vi.mock('../../lib/api/imports', async () => {
  const { createMockedDomainModule } = await import('../../__tests__/helpers/mock-api')
  const { bulkImportFlowMock } = await import('../../__tests__/helpers/mock-api-templates')
  const { importsApi } = bulkImportFlowMock()
  return createMockedDomainModule('imports', { importsApi })
})

vi.mock('../../lib/api/collections', async () => {
  const { createMockedDomainModule } = await import('../../__tests__/helpers/mock-api')
  const { bulkImportFlowMock } = await import('../../__tests__/helpers/mock-api-templates')
  const { collectionsApi } = bulkImportFlowMock()
  return createMockedDomainModule('collections', { collectionsApi })
})

vi.mock('../../lib/api/settings', async () => {
  const { createMockedDomainModule } = await import('../../__tests__/helpers/mock-api')
  return createMockedDomainModule('settings', {
    setupApi: {
      status: vi.fn().mockResolvedValue({ initialized: true }),
    },
  })
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

    it('passes a barcode-shaped plate_name and locationId to the import without pre-creating the plate', async () => {
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
      await user.click(screen.getByRole('button', { name: /continue to import/i }))

      await waitFor(() => expect(importsApi.bulkCombined).toHaveBeenCalled())
      expect(collectionsApi.createMicronixPlate).not.toHaveBeenCalled()
      const request = vi.mocked(importsApi.bulkCombined).mock.calls[0]![0]
      const collections = request.subjects.flatMap((s) => s.specimens.map((sp) => sp.container?.collection))
      expect(collections).toEqual([
        expect.objectContaining({ type: 'micronix_plate', name: 'PLATE-001', locationId: 10 }),
        expect.objectContaining({ type: 'micronix_plate', name: 'PLATE-001', locationId: 10 }),
      ])
      for (const collection of collections) expect(collection).not.toHaveProperty('barcode')
    })

    it('passes plate_name, collection_barcode, and locationId to the import without pre-creating the plate', async () => {
      const user = await validateCsv(
        'subject_name,specimen_type_name,plate_name,collection_barcode,barcode,position\n' +
          'S1,Serum,My Plate,PB-778899,MT1,A01\n' +
          'S2,Serum,My Plate,PB-778899,MT2,A02',
      )

      expect(await screen.findByRole('heading', { name: 'My Plate' })).toBeInTheDocument()
      expect(screen.getByText('Barcode: PB-778899')).toBeInTheDocument()

      await user.click(screen.getByRole('button', { name: 'Select location 10' }))
      await user.click(screen.getByRole('button', { name: /continue to import/i }))

      await waitFor(() => expect(importsApi.bulkCombined).toHaveBeenCalled())
      expect(collectionsApi.createMicronixPlate).not.toHaveBeenCalled()
      const request = vi.mocked(importsApi.bulkCombined).mock.calls[0]![0]
      const collections = request.subjects.flatMap((s) => s.specimens.map((sp) => sp.container?.collection))
      expect(collections).toEqual([
        expect.objectContaining({ type: 'micronix_plate', name: 'My Plate', barcode: 'PB-778899', locationId: 10 }),
        expect.objectContaining({ type: 'micronix_plate', name: 'My Plate', barcode: 'PB-778899', locationId: 10 }),
      ])
    })

    it('passes collection_barcode and locationId when the CSV gives no plate_name, without pre-creating the plate', async () => {
      const user = await validateCsv(
        'subject_name,specimen_type_name,collection_barcode,barcode,position\n' +
          'S1,Serum,plate 7,MT1,A01',
      )

      expect(await screen.findByText('Barcode: plate 7')).toBeInTheDocument()
      expect(screen.getByText(/named after its barcode/i)).toBeInTheDocument()

      await user.click(screen.getByRole('button', { name: 'Select location 10' }))
      await user.click(screen.getByRole('button', { name: /continue to import/i }))

      await waitFor(() => expect(importsApi.bulkCombined).toHaveBeenCalled())
      expect(collectionsApi.createMicronixPlate).not.toHaveBeenCalled()
      const request = vi.mocked(importsApi.bulkCombined).mock.calls[0]![0]
      const collections = request.subjects.flatMap((s) => s.specimens.map((sp) => sp.container?.collection))
      expect(collections).toEqual([
        expect.objectContaining({ type: 'micronix_plate', barcode: 'plate 7', locationId: 10 }),
      ])
      expect(collections[0]).not.toHaveProperty('name')
    })

    it('sends a file collection_barcode on every row of a new plate even when an earlier row leaves it blank', async () => {
      const user = await validateCsv(
        'subject_name,specimen_type_name,plate_name,collection_barcode,barcode,position\n' +
          'S1,Serum,Plate-New,,MT1,A01\n' +
          'S2,Serum,Plate-New,PB-999,MT2,A02',
      )

      expect(await screen.findByRole('heading', { name: 'Plate-New' })).toBeInTheDocument()
      expect(screen.getByText('Barcode: PB-999')).toBeInTheDocument()

      await user.click(screen.getByRole('button', { name: 'Select location 10' }))
      await user.click(screen.getByRole('button', { name: /continue to import/i }))

      await waitFor(() => expect(importsApi.bulkCombined).toHaveBeenCalled())
      const request = vi.mocked(importsApi.bulkCombined).mock.calls[0]![0]
      const collections = request.subjects.flatMap((s) => s.specimens.map((sp) => sp.container?.collection))
      expect(collections).toEqual([
        expect.objectContaining({ type: 'micronix_plate', name: 'Plate-New', barcode: 'PB-999', locationId: 10 }),
        expect.objectContaining({ type: 'micronix_plate', name: 'Plate-New', barcode: 'PB-999', locationId: 10 }),
      ])
    })

    it('reports a row error before import when two rows give different non-blank barcodes for one plate name', async () => {
      await validateCsv(
        'subject_name,specimen_type_name,plate_name,collection_barcode,barcode,position\n' +
          'S1,Serum,Plate-New,PB-111,MT1,A01\n' +
          'S2,Serum,Plate-New,PB-222,MT2,A02',
      )

      expect(
        await screen.findByText(/Row 3:.*Plate-New.*PB-222.*PB-111/i),
      ).toBeInTheDocument()
      expect(collectionsApi.check).not.toHaveBeenCalled()
      expect(importsApi.bulkCombinedValidate).not.toHaveBeenCalled()
      expect(importsApi.bulkCombined).not.toHaveBeenCalled()
    })
  })

  describe('errors name the file row', () => {
    /** Upload `text` and validate it; header is row 1, so the file's rows are numbered as a spreadsheet shows them. */
    async function validateCsv(
      text: string,
      opts: { importType: 'specimens' | 'combined'; containerType: string; perSubject?: boolean },
    ) {
      const user = userEvent.setup()
      await render(<BulkImportFlow fixedStudyShortCode="ST" />, { initialEntries: ['/import?step=upload'] })
      await user.selectOptions(screen.getByLabelText(/import type/i), opts.importType)
      await user.selectOptions(screen.getByLabelText(/container type/i), opts.containerType)
      if (opts.perSubject) await user.click(screen.getByRole('radio', { name: /per subject/i }))
      const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement
      await user.upload(fileInput, new File([text], 'i.csv', { type: 'text/csv' }))
      await act(async () => {
        fireEvent.submit(fileInput.closest('form')!)
      })
    }

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
      // Every plate exists, so validation goes straight to import.
      vi.mocked(collectionsApi.check).mockImplementation(({ collections }) =>
        Promise.resolve({ results: collections.map((c) => ({ ...c, exists: true, id: 1 })) }),
      )
    })

    // Row 1 header; S1 on rows 2 and 5, S2 on row 3, row 4 blank.
    const combinedCsv =
      'subject_name,specimen_type_name,plate_name,barcode,position\n' +
      'S1,Serum,P1,MT1,A01\n' +
      'S2,Serum,P1,MT2,A02\n' +
      ',,,,\n' +
      'S1,Plasma,P1,MT3,A03\n'

    it('numbers a specimens validation error by its file row when a blank row precedes it', async () => {
      vi.mocked(specimensApi.validateBulk).mockResolvedValue({
        valid: false,
        errors: [{ index: 1, message: "Subject 'S2' not found" }],
      })
      await validateCsv('subject_name,specimen_type_name\nS1,Serum\n\nS2,Plasma\n', {
        importType: 'specimens',
        containerType: 'none',
      })

      expect(await screen.findByText("Row 4: Subject 'S2' not found")).toBeInTheDocument()
    })

    it('numbers a combined validation error on a specimen grouped under an earlier subject by its file row', async () => {
      vi.mocked(importsApi.bulkCombinedValidate).mockImplementation((payload) =>
        Promise.resolve({
          valid: false,
          errors: [
            {
              subjectIndex: 0,
              specimenIndex: 1,
              rowIndex: payload.subjects[0]!.specimens[1]!.rowIndex,
              message: 'Position A03 is taken',
            },
          ],
        }),
      )
      await validateCsv(combinedCsv, { importType: 'combined', containerType: 'micronix_tube' })

      expect(await screen.findByText('Row 5: Position A03 is taken')).toBeInTheDocument()
    })

    it('numbers a combined subject error without a row index by the subject’s first file row', async () => {
      vi.mocked(importsApi.bulkCombinedValidate).mockResolvedValue({
        valid: false,
        errors: [{ subjectIndex: 1, message: 'Invalid subject name' }],
      })
      await validateCsv(combinedCsv, { importType: 'combined', containerType: 'micronix_tube' })

      expect(await screen.findByText('Row 3: Invalid subject name')).toBeInTheDocument()
    })

    it('names every file row of a subject that failed in a per-subject import', async () => {
      vi.mocked(importsApi.bulkCombinedValidate).mockResolvedValue({ valid: true, errors: [] })
      vi.mocked(importsApi.bulkCombined).mockResolvedValue({
        summary: { subjectsCreated: 1, subjectsUpdated: 0, specimensCreated: 1, containersCreated: 1 },
        results: [],
        errors: [{ index: 0, error: "Subject 'S1': Position A03 is taken" }],
      })
      await validateCsv(combinedCsv, { importType: 'combined', containerType: 'micronix_tube', perSubject: true })

      expect(await screen.findByText("Rows 2, 5: Subject 'S1': Position A03 is taken")).toBeInTheDocument()
    })
  })

  describe('issue #93: validation failures never hang or leave empty Collections', () => {
    async function uploadAndSubmit(
      text: string,
      opts: { importType: 'specimens' | 'combined'; containerType: string; perSubject?: boolean }
    ) {
      const user = userEvent.setup()
      await render(<BulkImportFlow fixedStudyShortCode="ST" />, { initialEntries: ['/import?step=upload'] })
      await user.selectOptions(screen.getByLabelText(/import type/i), opts.importType)
      await user.selectOptions(screen.getByLabelText(/container type/i), opts.containerType)
      if (opts.perSubject) await user.click(screen.getByRole('radio', { name: /per subject/i }))
      const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement
      await user.upload(fileInput, new File([text], 'i.csv', { type: 'text/csv' }))
      await act(async () => {
        fireEvent.submit(fileInput.closest('form')!)
      })
      return user
    }

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
      vi.mocked(collectionsApi.check).mockImplementation(({ collections }) =>
        Promise.resolve({ results: collections.map((c) => ({ ...c, exists: false, id: null })) })
      )
      vi.mocked(specimensApi.validateBulk).mockResolvedValue({ valid: true, errors: [] })
      vi.mocked(specimensApi.createBulk).mockResolvedValue({ created: 1, containersCreated: 1, specimens: [] })
      vi.mocked(importsApi.bulkCombinedValidate).mockResolvedValue({ valid: true, errors: [] })
    })

    it('reports an empty required barcode naming the file row before checking or creating Collections', async () => {
      const csv =
        'subject_name,specimen_type_name,plate_name,barcode,position\n' +
        'S1,Serum,NEW-PLATE,MT1,A01\n' +
        ',,,,\n' +
        'S2,Serum,NEW-PLATE,,A02\n'

      await uploadAndSubmit(csv, { importType: 'specimens', containerType: 'micronix_tube' })

      expect(await screen.findByText('Row 4: Missing required value: barcode')).toBeInTheDocument()
      expect(collectionsApi.check).not.toHaveBeenCalled()
      expect(collectionsApi.createMicronixPlate).not.toHaveBeenCalled()
      expect(specimensApi.validateBulk).not.toHaveBeenCalled()
      expect(specimensApi.createBulk).not.toHaveBeenCalled()
      expect(screen.getByRole('button', { name: /validate & continue/i })).toBeEnabled()
    })

    it('does not hang or create a plate when specimens server validation rejects with a 400 on the collections step', async () => {
      vi.mocked(specimensApi.validateBulk).mockRejectedValueOnce(
        Object.assign(new Error('Request failed with status code 400'), {
          response: {
            status: 400,
            data: {
              error: 'Validation error',
              details: [{ path: ['specimens', 0, 'container', 'barcode'], message: 'Too small: expected >=1 chars' }],
            },
          },
        })
      )

      const user = await uploadAndSubmit(
        'subject_name,specimen_type_name,plate_name,barcode,position\nS1,Serum,NEW-PLATE,MT1,A01',
        { importType: 'specimens', containerType: 'micronix_tube' }
      )

      expect(await screen.findByRole('heading', { name: 'NEW-PLATE' })).toBeInTheDocument()
      await user.click(screen.getByRole('button', { name: 'Select location 10' }))
      const continueBtn = screen.getByRole('button', { name: /continue to import/i })
      await user.click(continueBtn)

      expect(await screen.findByText(/Row 2: container\.barcode: Too small: expected >=1 chars/i)).toBeInTheDocument()
      expect(collectionsApi.createMicronixPlate).not.toHaveBeenCalled()
      expect(specimensApi.createBulk).not.toHaveBeenCalled()
      expect(screen.getByRole('button', { name: /continue to import/i })).toBeEnabled()
    })

    it('does not hang or create a plate when combined full_file server validation rejects on the collections step', async () => {
      vi.mocked(importsApi.bulkCombinedValidate).mockRejectedValueOnce(
        Object.assign(new Error('Request failed with status code 500'), {
          response: { status: 500, data: { error: 'Server validation unavailable' } },
        })
      )

      const user = await uploadAndSubmit(
        'subject_name,specimen_type_name,plate_name,barcode,position\nS1,Serum,NEW-PLATE,MT1,A01',
        { importType: 'combined', containerType: 'micronix_tube' }
      )

      expect(await screen.findByRole('heading', { name: 'NEW-PLATE' })).toBeInTheDocument()
      await user.click(screen.getByRole('button', { name: 'Select location 10' }))
      await user.click(screen.getByRole('button', { name: /continue to import/i }))

      expect(await screen.findByText('Server validation unavailable')).toBeInTheDocument()
      expect(collectionsApi.createMicronixPlate).not.toHaveBeenCalled()
      expect(importsApi.bulkCombined).not.toHaveBeenCalled()
      expect(screen.getByRole('button', { name: /continue to import/i })).toBeEnabled()
    })

    it('sends missing Collection locationId in specimens import without pre-creating the plate', async () => {
      const user = await uploadAndSubmit(
        'subject_name,specimen_type_name,plate_name,barcode,position\nS1,Serum,NEW-PLATE,MT1,A01',
        { importType: 'specimens', containerType: 'micronix_tube' }
      )

      expect(await screen.findByRole('heading', { name: 'NEW-PLATE' })).toBeInTheDocument()
      await user.click(screen.getByRole('button', { name: 'Select location 10' }))
      await user.click(screen.getByRole('button', { name: /continue to import/i }))

      await waitFor(() => expect(specimensApi.createBulk).toHaveBeenCalled())
      expect(collectionsApi.createMicronixPlate).not.toHaveBeenCalled()
      expect(specimensApi.createBulk).toHaveBeenCalledWith({
        specimens: [
          expect.objectContaining({
            container: expect.objectContaining({
              containerType: 'micronix_tube',
              barcode: 'MT1',
              collection: expect.objectContaining({
                type: 'micronix_plate',
                name: 'NEW-PLATE',
                position: 'A01',
                locationId: 10,
              }),
            }),
          }),
        ],
      })
    })

    it('shows the import result under SetupGuard after a successful import invalidates every query', async () => {
      let resolveRefetch!: (value: { initialized: boolean }) => void
      vi.mocked(setupApi.status)
        .mockResolvedValueOnce({ initialized: true })
        .mockImplementationOnce(
          () =>
            new Promise<{ initialized: boolean }>((resolve) => {
              resolveRefetch = resolve
            }),
        )
      vi.mocked(collectionsApi.check).mockImplementation(({ collections }) =>
        Promise.resolve({ results: collections.map((c) => ({ ...c, exists: true, id: 1 })) }),
      )
      vi.mocked(specimensApi.createBulk).mockResolvedValue({ created: 1, containersCreated: 1, specimens: [] })

      const user = userEvent.setup()
      await render(
        <SetupGuard>
          <BulkImportFlow fixedStudyShortCode="ST" />
        </SetupGuard>,
        { initialEntries: ['/import?step=upload'] },
      )

      const importTypeSelect = await screen.findByLabelText(/import type/i)
      await user.selectOptions(importTypeSelect, 'specimens')
      await user.selectOptions(screen.getByLabelText(/container type/i), 'micronix_tube')

      const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement
      await user.upload(
        fileInput,
        new File(
          ['subject_name,specimen_type_name,plate_name,barcode,position\nS1,Serum,P1,MT1,A01'],
          'i.csv',
          { type: 'text/csv' },
        ),
      )
      await act(async () => {
        fireEvent.submit(fileInput.closest('form')!)
      })

      await waitFor(() => {
        expect(setupApi.status).toHaveBeenCalledTimes(2)
      })
      await act(async () => {
        resolveRefetch({ initialized: true })
        await Promise.resolve()
      })

      expect(await screen.findByText(/import successful/i)).toBeInTheDocument()
      expect(screen.getByText(/created: 1 specimen and 1 container/i)).toBeInTheDocument()
      expect(screen.queryByRole('button', { name: /validate & continue/i })).not.toBeInTheDocument()
    })
  })
})
