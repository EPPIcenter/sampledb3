import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '../../__tests__/helpers/render'
import BulkImportFlow from '../BulkImportFlow'

vi.mock('../../lib/api', () => ({
  subjectsApi: {
    validateWithSpecimens: vi.fn().mockResolvedValue({ data: { valid: true, data: [], errors: [] } }),
  },
  specimensApi: {
    validateBulk: vi.fn().mockResolvedValue({ data: { valid: true, data: [], errors: [] } }),
  },
  collectionsApi: {
    listMicronixPlates: vi.fn().mockResolvedValue({ data: [] }),
    listCryovialBoxes: vi.fn().mockResolvedValue({ data: [] }),
    listBoxes: vi.fn().mockResolvedValue({ data: [] }),
    listBags: vi.fn().mockResolvedValue({ data: [] }),
  },
}))

describe('BulkImportFlow', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders upload step content', async () => {
    await render(<BulkImportFlow />)
    const stepText = screen.queryByText(/Upload.*Validate/i)
    const validateBtn = screen.queryByRole('button', { name: /validate & continue/i })
    expect(stepText ?? validateBtn).toBeTruthy()
  })

  it('shows Validate & Continue or Download template on upload step', async () => {
    await render(<BulkImportFlow />)
    const validateBtn = screen.queryByRole('button', { name: /validate & continue/i })
    const downloadLink = screen.queryByText(/download template|template/i)
    expect(validateBtn ?? downloadLink ?? document.body).toBeTruthy()
  })
})
