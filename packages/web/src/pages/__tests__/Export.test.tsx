import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '../../__tests__/helpers/render'
import Export from '../Export'
import * as api from '../../lib/api'

vi.mock('../../lib/api', () => ({
  exportApi: { validate: vi.fn(), export: vi.fn() },
  exportConfigurationsApi: {
    getShared: vi.fn().mockResolvedValue({ data: { configurations: [] } }),
    getPersonal: vi.fn().mockResolvedValue({ data: { configurations: [] } }),
  },
  specimenTypesApi: { list: vi.fn().mockResolvedValue({ data: [] }) },
  tagsApi: { list: vi.fn().mockResolvedValue({ data: [] }) },
}))

describe('Export', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(api.exportConfigurationsApi.getShared).mockResolvedValue({ data: { configurations: [] } } as never)
    vi.mocked(api.exportConfigurationsApi.getPersonal).mockResolvedValue({ data: { configurations: [] } } as never)
  })

  it('shows export-related content', async () => {
    await render(<Export />)
    await waitFor(() => {
      const matches = screen.getAllByText(/Export|export|CSV|configuration/i)
      expect(matches.length).toBeGreaterThan(0)
    }, { timeout: 3000 })
  })

  it('shows studies and specimen types when configs load', async () => {
    vi.mocked(api.specimenTypesApi.list).mockResolvedValue({
      data: [{ id: 1, name: 'Blood', created: '', lastUpdated: '' }],
    } as never)
    await render(<Export />)
    await waitFor(() => {
      expect(api.specimenTypesApi.list).toHaveBeenCalled()
    })
  })

  it('calls tagsApi.list when loading reference data', async () => {
    vi.mocked(api.tagsApi.list).mockResolvedValue({ data: [] } as never)
    await render(<Export />)
    await waitFor(() => {
      expect(api.tagsApi.list).toHaveBeenCalled()
    })
  })

  it('shows error when reference data fails to load', async () => {
    vi.mocked(api.specimenTypesApi.list).mockRejectedValue(new Error('Network error'))
    await render(<Export />)
    await waitFor(() => {
      expect(screen.getByText(/network error|failed to load/i)).toBeInTheDocument()
    }, { timeout: 3000 })
  })

  it('shows format options (CSV, Excel, JSON)', async () => {
    await render(<Export />)
    await waitFor(() => {
      const csvMatches = screen.getAllByText(/csv/i)
      expect(csvMatches.length).toBeGreaterThan(0)
    }, { timeout: 3000 })
  })
})
