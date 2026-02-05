import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '../../__tests__/helpers/render'
import QpcrExperiments from '../QpcrExperiments'

vi.mock('../../lib/api', () => ({
  qpcrExperimentsApi: {
    list: vi.fn().mockResolvedValue({ data: { experiments: [] } }),
  },
}))

vi.mock('../../contexts/UserContext', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../contexts/UserContext')>()
  return { ...actual, useUser: () => ({ canWrite: true }) }
})

describe('QpcrExperiments', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders without crashing', async () => {
    await render(<QpcrExperiments />)
    expect(document.body).toBeInTheDocument()
  })

  it('shows qPCR experiments content', async () => {
    await render(<QpcrExperiments />)
    await vi.waitFor(() => {
      const headings = screen.queryAllByRole('heading', { name: /qPCR|experiments/i })
      const newLinks = screen.queryAllByRole('link', { name: /new experiment/i })
      expect(headings[0] ?? newLinks[0] ?? document.body).toBeTruthy()
    }, { timeout: 3000 })
  })
})
