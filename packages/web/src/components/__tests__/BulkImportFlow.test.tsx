import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor, act } from '../../__tests__/helpers/render'
import userEvent from '@testing-library/user-event'
import BulkImportFlow from '../BulkImportFlow'
import { importsApi, specimenTypesApi } from '../../lib/api'

vi.mock('../../lib/api', async () => {
  const { createMockedApi } = await import('../../__tests__/helpers/mock-api')
  return createMockedApi({
  specimenTypesApi: {
    list: vi.fn().mockResolvedValue({ data: [{ id: 1, name: 'Serum' }, { id: 2, name: 'Plasma' }] }),
    getByContainerType: vi.fn().mockResolvedValue({
      data: { specimenTypes: [{ id: 1, name: 'Whole Blood', created: '', lastUpdated: '' }] },
    }),
  },
  subjectsApi: {
    createBulk: vi.fn().mockResolvedValue({ data: { created: 2, subjects: [] } }),
    validateBulk: vi.fn().mockResolvedValue({ data: { valid: true, errors: [] } }),
  },
  specimensApi: {
    createBulk: vi.fn().mockResolvedValue({ data: { created: 0, specimens: [] } }),
    validateBulk: vi.fn().mockResolvedValue({ valid: true, errors: [] }),
  },
  importsApi: {
    bulkCombined: vi.fn().mockResolvedValue({
      data: {
        summary: { subjectsCreated: 1, specimensCreated: 1, containersCreated: 0, subjectsUpdated: 0 },
        results: [],
        errors: [],
      },
    }),
    bulkCombinedValidate: vi.fn().mockResolvedValue({ data: { valid: true, errors: [] } }),
  },
  collectionsApi: {
    check: vi.fn().mockResolvedValue({ data: { results: [] } }),
    listMicronixPlates: vi.fn().mockResolvedValue({ data: [] }),
    listCryovialBoxes: vi.fn().mockResolvedValue({ data: [] }),
    listBoxes: vi.fn().mockResolvedValue({ data: [] }),
    listBags: vi.fn().mockResolvedValue({ data: [] }),
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
    vi.mocked(importsApi.bulkCombinedValidate).mockResolvedValue(
      {
        data: {
          valid: false,
          errors: [{ subjectIndex: 0, message: "Barcode 'B1' is already in use on the server.", rowIndex: 1 }],
        },
      } as Awaited<ReturnType<typeof importsApi.bulkCombinedValidate>>
    )
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

})
