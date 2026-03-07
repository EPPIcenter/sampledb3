import { useState } from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '../../../__tests__/helpers/render'
import CSVUploadStep from '../CSVUploadStep'
import type { CSVFileData } from '../../../pages/ControlBatchWizard'

vi.mock('../../../lib/control-batch-csv', () => ({
  parseContainerCSV: vi.fn((_text: string, filename: string) => ({
    filename,
    rows: [{ specimen_type_name: 'Blood' }],
    errors: [],
    inferredContainerCategory: 'paper',
    inferredContainerType: 'paper',
  })),
  validateCSVRows: vi.fn(() => []),
  generateCSVTemplate: vi.fn(),
  inferSheetName: vi.fn(() => undefined),
}))

vi.mock('../../../lib/api', () => ({
  specimenTypesApi: {
    getByContainerType: vi.fn(),
  },
  settingsApi: {
    get: vi.fn().mockResolvedValue({ data: { value: null } }),
  },
}))

const defaultSpecimenTypes = [
  { id: 1, name: 'Blood', created: '2020-01-01T00:00:00Z', lastUpdated: '2020-01-01T00:00:00Z' },
]

function CSVUploadStepWrapper() {
  const [csvFiles, setCsvFiles] = useState<CSVFileData[]>([])
  return (
    <CSVUploadStep
      csvFiles={csvFiles}
      onChange={setCsvFiles}
      availableSpecimenTypes={defaultSpecimenTypes}
      onNext={vi.fn()}
      onBack={vi.fn()}
      onCancel={vi.fn()}
    />
  )
}

describe('CSVUploadStep', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('clears file input value when a file is removed', async () => {
    const { container } = await render(<CSVUploadStepWrapper />)

    const fileInput = container.querySelector('input[type="file"]') as HTMLInputElement
    expect(fileInput).toBeInTheDocument()

    const csvContent = 'position,barcode\nA01,BAR1'
    const file = new File([csvContent], 'test.csv', { type: 'text/csv' })
    Object.defineProperty(file, 'text', { value: () => Promise.resolve(csvContent) })
    fireEvent.change(fileInput, { target: { files: [file] } })

    await waitFor(() => {
      expect(screen.getByText('test.csv')).toBeInTheDocument()
    })

    fireEvent.click(screen.getByRole('button', { name: 'Remove' }))

    await waitFor(() => {
      expect(screen.queryByText('test.csv')).not.toBeInTheDocument()
    })

    expect(fileInput.value).toBe('')
  })

  it('enables Next when at least one CSV file has no errors (collection is configured in Containers step)', async () => {
    const onNext = vi.fn()
    function Wrapper() {
      const [csvFiles, setCsvFiles] = useState<CSVFileData[]>([])
      return (
        <CSVUploadStep
          csvFiles={csvFiles}
          onChange={setCsvFiles}
          availableSpecimenTypes={defaultSpecimenTypes}
          onNext={onNext}
          onBack={vi.fn()}
          onCancel={vi.fn()}
        />
      )
    }
    const { container } = await render(<Wrapper />)

    const fileInput = container.querySelector('input[type="file"]') as HTMLInputElement
    const csvContent = 'position,barcode\nA01,BAR1'
    const file = new File([csvContent], 'test.csv', { type: 'text/csv' })
    Object.defineProperty(file, 'text', { value: () => Promise.resolve(csvContent) })
    fireEvent.change(fileInput, { target: { files: [file] } })

    await waitFor(() => {
      expect(screen.getByText('test.csv')).toBeInTheDocument()
    })

    const nextButton = screen.getByRole('button', { name: /Next: Configure Containers/i })
    expect(nextButton).not.toBeDisabled()
    fireEvent.click(nextButton)
    expect(onNext).toHaveBeenCalled()
  })

  it('shows production date input when showProductionDate and batchInfo/onBatchInfoChange are provided', async () => {
    const onBatchInfoChange = vi.fn()
    await render(
      <CSVUploadStep
        csvFiles={[]}
        onChange={vi.fn()}
        availableSpecimenTypes={defaultSpecimenTypes}
        onNext={vi.fn()}
        onBack={vi.fn()}
        onCancel={vi.fn()}
        showProductionDate
        batchInfo={{ productionDate: '2026-03-01' }}
        onBatchInfoChange={onBatchInfoChange}
      />
    )

    const productionDateInput = screen.getByLabelText(/Production date/i)
    expect(productionDateInput).toBeInTheDocument()
    expect(productionDateInput).toHaveValue('2026-03-01')

    fireEvent.change(productionDateInput, { target: { value: '2026-03-15' } })
    expect(onBatchInfoChange).toHaveBeenCalledWith({ productionDate: '2026-03-15' })
  })

  it('does not show production date input when showProductionDate is false', async () => {
    await render(<CSVUploadStepWrapper />)
    expect(screen.queryByLabelText(/Production date/i)).not.toBeInTheDocument()
  })

  it('does not show production date input when showProductionDate and batchInfo are omitted', async () => {
    await render(
      <CSVUploadStep
        csvFiles={[]}
        onChange={vi.fn()}
        availableSpecimenTypes={defaultSpecimenTypes}
        onNext={vi.fn()}
        onBack={vi.fn()}
        onCancel={vi.fn()}
      />
    )
    expect(screen.queryByLabelText(/Production date/i)).not.toBeInTheDocument()
  })
})
