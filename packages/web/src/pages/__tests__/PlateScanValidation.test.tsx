import { screen, fireEvent, waitFor } from '@testing-library/react'
import { vi, describe, it, expect, beforeEach } from 'vitest'
import { renderWithProviders, render, within } from '../../__tests__/helpers/render'
import userEvent from '@testing-library/user-event'
import PlateScanValidation from '../PlateScanValidation'
import { collectionsApi } from '../../lib/api/collections'
import { settingsApi } from '../../lib/api/settings'
import { mockSettingsApiGetValue, scannerConfigurationsValue } from '../../__tests__/helpers/settings-mocks'

vi.mock('../../lib/api/collections', async () => {
  const { createMockedDomainModule } = await import('../../__tests__/helpers/mock-api')
  return createMockedDomainModule('collections', {
  collectionsApi: {
    listCollectionsByType: vi.fn(),
    validatePlateScan: vi.fn(),
  },
  settingsApi: {
    getValue: vi.fn(),
  },
})
})

vi.mock('../../lib/api/settings', async () => {
  const { createMockedDomainModule } = await import('../../__tests__/helpers/mock-api')
  return createMockedDomainModule('settings', {
  collectionsApi: {
    listCollectionsByType: vi.fn(),
    validatePlateScan: vi.fn(),
  },
  settingsApi: {
    getValue: vi.fn(),
  },
  })
})

const mockPlateList = [
  { id: 1, name: 'PLATE1' },
  { id: 2, name: 'PLATE2' },
]

const mockConfigs = [
  { id: 'config-1', name: 'Config 1', isDefault: true, barcodeColumn: 'barcode', positionType: 'single' as const, positionColumn: 'pos', skipRows: 0 },
  { id: 'config-2', name: 'Config 2', isDefault: false, barcodeColumn: 'Barcode', positionType: 'single' as const, positionColumn: 'Pos', skipRows: 0 },
]

const mockValidateResult = {
  plate: { id: 1, name: 'PLATE1' },
  summary: {
    totalExpected: 96,
    matched: 96,
    missingInScan: 0,
    extraInScan: 0,
    unplacedInScan: 0,
    mismatch: 0,
    exhaustedCount: 0,
    taggedCount: 0,
  },
  wells: [],
  unplaced: [],
}

describe('PlateScanValidation', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(collectionsApi.listCollectionsByType).mockResolvedValue({
      collections: mockPlateList,
    })
    vi.mocked(settingsApi.getValue).mockResolvedValue(
      scannerConfigurationsValue(mockConfigs),
    )
    vi.mocked(collectionsApi.validatePlateScan).mockResolvedValue(mockValidateResult)
  })

  it('clears validation result when scanner configuration is changed', async () => {
    const csvContent = 'barcode,pos\nT1,A01\nT2,A02'
    const file = new File([csvContent], 'PLATE1.csv', { type: 'text/csv' })
    Object.defineProperty(file, 'text', { value: async () => csvContent })

    const { container } = await renderWithProviders(<PlateScanValidation />)

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Validate Plate Scan' })).toBeInTheDocument()
    })

    const fileInput = container.querySelector('input[type="file"]') as HTMLInputElement
    fireEvent.change(fileInput, { target: { files: [file] } })

    await waitFor(() => {
      expect(screen.getByText('PLATE1.csv')).toBeInTheDocument()
    })

    await waitFor(() => {
      const validateBtn = screen.getByRole('button', { name: /Validate scan/i })
      expect(validateBtn).not.toBeDisabled()
    }, { timeout: 3000 })

    fireEvent.click(screen.getByRole('button', { name: /Validate scan/i }))

    await waitFor(() => {
      expect(screen.getByText('Download report')).toBeInTheDocument()
    }, { timeout: 5000 })

    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'config-2' } })

    await waitFor(() => {
      expect(screen.queryByText('Download report')).not.toBeInTheDocument()
    })
  })

  it('clears validation result when plate is changed', async () => {
    const csvContent = 'barcode,pos\nT1,A01\nT2,A02'
    const file = new File([csvContent], 'plate.csv', { type: 'text/csv' })
    Object.defineProperty(file, 'text', { value: async () => csvContent })

    const { container } = await renderWithProviders(<PlateScanValidation />)

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Validate Plate Scan' })).toBeInTheDocument()
    })

    const fileInput = container.querySelector('input[type="file"]') as HTMLInputElement
    fireEvent.change(fileInput, { target: { files: [file] } })

    await waitFor(() => {
      expect(screen.getByText('plate.csv')).toBeInTheDocument()
    })

    fireEvent.click(screen.getByRole('option', { name: /PLATE1/ }))

    await waitFor(() => {
      const validateBtn = screen.getByRole('button', { name: /Validate scan/i })
      expect(validateBtn).not.toBeDisabled()
    }, { timeout: 3000 })

    fireEvent.click(screen.getByRole('button', { name: /Validate scan/i }))

    await waitFor(() => {
      expect(screen.getByText('Download report')).toBeInTheDocument()
    }, { timeout: 5000 })

    fireEvent.click(screen.getByRole('option', { name: /PLATE2/ }))

    await waitFor(() => {
      expect(screen.queryByText('Download report')).not.toBeInTheDocument()
    })
  })

  it('when Infer plate mode and file selected, Validate sends request without plateId and shows inferred result', async () => {
    const csvContent = 'Well,Barcode\nA01,MT001'
    const file = new File([csvContent], 'scan.csv', { type: 'text/csv' })
    Object.defineProperty(file, 'text', { value: async () => csvContent })

    const inferredResult = {
      ...mockValidateResult,
      inferredPlate: true as const,
    }
    vi.mocked(collectionsApi.validatePlateScan).mockResolvedValue(inferredResult)

    const { container } = await renderWithProviders(<PlateScanValidation />)

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Validate Plate Scan' })).toBeInTheDocument()
    })

    const inferRadio = screen.getByRole('radio', { name: /infer plate from scan/i })
    fireEvent.click(inferRadio)

    const fileInput = container.querySelector('input[type="file"]') as HTMLInputElement
    fireEvent.change(fileInput, { target: { files: [file] } })

    await waitFor(() => {
      expect(screen.getByText('scan.csv')).toBeInTheDocument()
    })

    const validateBtn = screen.getByRole('button', { name: /Validate scan/i })
    await waitFor(() => {
      expect(validateBtn).not.toBeDisabled()
    }, { timeout: 3000 })
    fireEvent.click(validateBtn)

    await waitFor(() => {
      expect(collectionsApi.validatePlateScan).toHaveBeenCalledWith(
        expect.objectContaining({
          csvText: csvContent,
          scannerConfigurationId: expect.any(String),
        })
      )
      const call = vi.mocked(collectionsApi.validatePlateScan).mock.calls[0][0]
      expect(call).not.toHaveProperty('plateId')
    })
    await waitFor(() => {
      expect(screen.getByText(/Result:.*PLATE1.*inferred/i)).toBeInTheDocument()
    }, { timeout: 5000 })
  })

  it('when I know the plate and no plate selected, Validate button is disabled', async () => {
    await renderWithProviders(<PlateScanValidation />)

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Validate Plate Scan' })).toBeInTheDocument()
    })

    const knowPlateRadio = screen.getByRole('radio', { name: /I know the plate/i })
    fireEvent.click(knowPlateRadio)

    const validateBtn = screen.getByRole('button', { name: /Validate scan/i })
    expect(validateBtn).toBeDisabled()
  })

  it('when infer mode and API returns inferenceReport, shows inference report card not validation result', async () => {
    const csvContent = 'Well,Barcode\nA01,UNKNOWN1'
    const file = new File([csvContent], 'scan.csv', { type: 'text/csv' })
    Object.defineProperty(file, 'text', { value: async () => csvContent })

    vi.mocked(collectionsApi.validatePlateScan).mockResolvedValue({
      inferenceReport: {
        unknownBarcodes: ['UNKNOWN1'],
        plateBreakdown: [],
      },
    })

    const { container } = await renderWithProviders(<PlateScanValidation />)

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Validate Plate Scan' })).toBeInTheDocument()
    })

    const inferRadio = screen.getByRole('radio', { name: /infer plate from scan/i })
    fireEvent.click(inferRadio)

    const fileInput = container.querySelector('input[type="file"]') as HTMLInputElement
    fireEvent.change(fileInput, { target: { files: [file] } })

    await waitFor(() => {
      expect(screen.getByText('scan.csv')).toBeInTheDocument()
    })

    fireEvent.click(screen.getByRole('button', { name: /Validate scan/i }))

    await waitFor(() => {
      expect(screen.getByTestId('inference-report')).toBeInTheDocument()
      expect(screen.getByText(/Inference report – no single plate could be inferred/i)).toBeInTheDocument()
      expect(screen.getByText(/Unknown barcodes.*1/)).toBeInTheDocument()
      expect(screen.getByText('UNKNOWN1')).toBeInTheDocument()
    }, { timeout: 5000 })

    expect(screen.queryByTestId('result-heading')).not.toBeInTheDocument()
    expect(screen.queryByText('Well grid')).not.toBeInTheDocument()
  })

  it('when infer mode and API returns 400, error message is shown', async () => {
    const csvContent = 'Well,Barcode\nA01,\nA02,'
    const file = new File([csvContent], 'scan.csv', { type: 'text/csv' })
    Object.defineProperty(file, 'text', { value: async () => csvContent })

    vi.mocked(collectionsApi.validatePlateScan).mockRejectedValue({
      response: { data: { error: 'Cannot infer plate: scan has no barcodes' } },
    })

    const { container } = await renderWithProviders(<PlateScanValidation />)

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Validate Plate Scan' })).toBeInTheDocument()
    })

    const inferRadio = screen.getByRole('radio', { name: /infer plate from scan/i })
    fireEvent.click(inferRadio)

    const fileInput = container.querySelector('input[type="file"]') as HTMLInputElement
    fireEvent.change(fileInput, { target: { files: [file] } })

    await waitFor(() => {
      expect(screen.getByText('scan.csv')).toBeInTheDocument()
    })

    fireEvent.click(screen.getByRole('button', { name: /Validate scan/i }))

    await waitFor(() => {
      expect(screen.getByText(/Cannot infer plate/i)).toBeInTheDocument()
    }, { timeout: 5000 })
  })

  it('shows scanned unplaced tubes as belonging to the plate, not as extras', async () => {
    const user = userEvent.setup()
    const csvContent = 'Well,Barcode\nA01,MT-PLACED\nB01,MT-NULL-1\nC01,MT-NULL-2'
    const file = new File([csvContent], 'scan.csv', { type: 'text/csv' })
    Object.defineProperty(file, 'text', { value: async () => csvContent })
    vi.mocked(collectionsApi.validatePlateScan).mockResolvedValue({
      plate: { id: 1, name: 'PLATE1' },
      summary: {
        totalExpected: 4,
        matched: 1,
        missingInScan: 1,
        extraInScan: 0,
        unplacedInScan: 2,
        mismatch: 0,
        exhaustedCount: 0,
        taggedCount: 0,
      },
      wells: [
        { position: 'A01', scanBarcode: 'MT-PLACED', expectedBarcode: 'MT-PLACED', status: 'match', exhausted: false, tags: [], scanBarcodeOrigin: null },
        { position: 'B01', scanBarcode: 'MT-NULL-1', expectedBarcode: null, status: 'unplaced_in_scan', exhausted: false, tags: [], scanBarcodeOrigin: { plateId: 1, plateName: 'PLATE1', position: '' } },
        { position: 'C01', scanBarcode: 'MT-NULL-2', expectedBarcode: null, status: 'unplaced_in_scan', exhausted: false, tags: [], scanBarcodeOrigin: { plateId: 1, plateName: 'PLATE1', position: '' } },
      ],
      unplaced: [
        { barcode: 'MT-NULL-1', storedPosition: null, scannedPosition: 'B01' },
        { barcode: 'MT-NULL-2', storedPosition: null, scannedPosition: 'C01' },
        { barcode: 'MT-BAD-POS', storedPosition: 'A1145868849', scannedPosition: null },
      ],
    })

    const { container } = await render(<PlateScanValidation />)
    await screen.findByRole('heading', { name: 'Validate Plate Scan' })
    await user.click(screen.getByRole('radio', { name: /infer plate from scan/i }))
    await user.upload(container.querySelector('input[type="file"]') as HTMLInputElement, file)
    await screen.findByText('scan.csv')
    await user.click(screen.getByRole('button', { name: /Validate scan/i }))

    const unplacedHeading = await screen.findByRole('heading', { name: 'Unplaced tubes' })
    const wellGrid = screen.getByRole('heading', { name: 'Well grid' }).parentElement!
    const statuses = within(wellGrid).getAllByRole('row').slice(1).map((row) => within(row).getAllByRole('cell')[4]!.textContent)
    expect(statuses).toEqual(['Match', 'Unplaced in plate', 'Unplaced in plate'])
    expect(within(wellGrid).queryByText('Extra in scan')).not.toBeInTheDocument()

    const unplacedRows = within(unplacedHeading.parentElement!).getAllByRole('row').slice(1)
    expect(unplacedRows.map((row) => within(row).getAllByRole('cell').map((c) => c.textContent))).toEqual([
      ['MT-NULL-1', 'None', 'B01'],
      ['MT-NULL-2', 'None', 'C01'],
      ['MT-BAD-POS', 'A1145868849', 'Not in scan'],
    ])
    expect(screen.getByText(/3 tubes belong to this plate without a grid position; 2 found in the scan/)).toBeInTheDocument()
  })
})
