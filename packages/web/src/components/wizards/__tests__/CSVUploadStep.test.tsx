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
  })),
  validateCSVRows: vi.fn(() => []),
  generateCSVTemplate: vi.fn(),
}))

vi.mock('../../../lib/api', () => ({
  specimenTypesApi: {
    getByContainerType: vi.fn(),
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
})
