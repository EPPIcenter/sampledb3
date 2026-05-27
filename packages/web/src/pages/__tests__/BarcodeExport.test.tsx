import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '../../__tests__/helpers/render'
import BarcodeExport from '../BarcodeExport'
import { exportConfigurationsApi } from '../../lib/api/settings'

vi.mock('../../lib/api/export', async () => {
  const { createMockedDomainModule } = await import('../../__tests__/helpers/mock-api')
  return createMockedDomainModule('export', {
  exportApi: { exportBarcodes: vi.fn() },
  exportConfigurationsApi: {
    getShared: vi.fn().mockResolvedValue({ configurations: [] }),
    getPersonal: vi.fn().mockResolvedValue({ configurations: [] }),
  },
})
})

vi.mock('../../lib/api/settings', async () => {
  const { createMockedDomainModule } = await import('../../__tests__/helpers/mock-api')
  return createMockedDomainModule('settings', {
  exportApi: { exportBarcodes: vi.fn() },
  exportConfigurationsApi: {
    getShared: vi.fn().mockResolvedValue({ configurations: [] }),
    getPersonal: vi.fn().mockResolvedValue({ configurations: [] }),
  }
  })
})

describe('BarcodeExport', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(exportConfigurationsApi.getShared).mockResolvedValue({ configurations: [] })
    vi.mocked(exportConfigurationsApi.getPersonal).mockResolvedValue({ configurations: [] })
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
      expect(exportConfigurationsApi.getShared).toHaveBeenCalled()
      expect(exportConfigurationsApi.getPersonal).toHaveBeenCalled()
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
