import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '../../__tests__/helpers/render'
import BarcodeExport from '../BarcodeExport'
import { settingsApi } from '../../lib/api/settings'
import { mockSettingsApiGetValue } from '../../__tests__/helpers/settings-mocks'

vi.mock('../../lib/api/export', async () => {
  const { createMockedDomainModule } = await import('../../__tests__/helpers/mock-api')
  return createMockedDomainModule('export', {
  exportApi: { exportBarcodes: vi.fn() },
  })
})

vi.mock('../../lib/api/settings', async () => {
  const { createMockedDomainModule } = await import('../../__tests__/helpers/mock-api')
  return createMockedDomainModule('settings', {
    settingsApi: {
      getValue: vi.fn(),
    },
  })
})

describe('BarcodeExport', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(settingsApi.getValue).mockImplementation(mockSettingsApiGetValue())
  })

  it('shows barcode export content', async () => {
    await render(<BarcodeExport />)
    await waitFor(() => {
      const matches = screen.getAllByText(/Barcode|barcode|Export|export/i)
      expect(matches.length).toBeGreaterThan(0)
    }, { timeout: 3000 })
  })

  it('loads export configurations on mount', async () => {
    await render(<BarcodeExport />)
    await waitFor(() => {
      expect(settingsApi.getValue).toHaveBeenCalledWith('export_configurations', { scope: 'shared' })
      expect(settingsApi.getValue).toHaveBeenCalledWith('export_configurations', { scope: 'personal' })
    })
  })

  it('shows file input for CSV upload', async () => {
    await render(<BarcodeExport />)
    await waitFor(() => {
      const fileInput = document.querySelector('input[type="file"][accept=".csv"]')
      expect(fileInput).toBeInTheDocument()
    }, { timeout: 3000 })
  })
})
