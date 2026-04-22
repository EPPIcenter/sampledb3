import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '../../__tests__/helpers/render'
import QpcrExperiments from '../QpcrExperiments'

vi.mock('../../lib/api', () => ({
  qpcrExperimentsApi: {
    list: vi.fn().mockResolvedValue({ data: { experiments: [] } }),
  },
}))

vi.mock('../../contexts/UserContext', async () => {
  const actual = await vi.importActual<typeof import('../../contexts/UserContext')>('../../contexts/UserContext')
  return { ...actual, useUser: () => ({ canWrite: true }) }
})

describe('QpcrExperiments', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('shows qPCR experiments content', async () => {
    await render(<QpcrExperiments />)
    await vi.waitFor(() => {
      const headings = screen.queryAllByRole('heading', { name: /qPCR|experiments|no qpcr/i })
      const links = screen.queryAllByRole('link', { name: /new experiment|create experiment/i })
      expect(headings.length > 0 || links.length > 0).toBe(true)
    }, { timeout: 3000 })
  })
})
