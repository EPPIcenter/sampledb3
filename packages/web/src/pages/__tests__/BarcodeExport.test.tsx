import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '../../__tests__/helpers/render'
import BarcodeExport from '../BarcodeExport'
import * as api from '../../lib/api'

vi.mock('../../lib/api', () => ({
  exportApi: { exportBarcodes: vi.fn() },
  exportConfigurationsApi: {
    getShared: vi.fn().mockResolvedValue({ data: { configurations: [] } }),
    getPersonal: vi.fn().mockResolvedValue({ data: { configurations: [] } }),
  },
}))

describe('BarcodeExport', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(api.exportConfigurationsApi.getShared).mockResolvedValue({ data: { configurations: [] } } as never)
    vi.mocked(api.exportConfigurationsApi.getPersonal).mockResolvedValue({ data: { configurations: [] } } as never)
  })

  it('renders without crashing', async () => {
    const { container } = await render(<BarcodeExport />)
    expect(container).toBeInTheDocument()
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
      expect(api.exportConfigurationsApi.getShared).toHaveBeenCalled()
      expect(api.exportConfigurationsApi.getPersonal).toHaveBeenCalled()
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
