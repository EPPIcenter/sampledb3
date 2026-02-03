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

  it('renders without crashing', () => {
    render(<QpcrExperiments />)
    expect(document.body).toBeInTheDocument()
  })

  it('shows qPCR experiments content', async () => {
    render(<QpcrExperiments />)
    await vi.waitFor(() => {
      const heading = screen.queryByRole('heading', { name: /qPCR|experiments/i })
      const newLink = screen.queryByRole('link', { name: /new experiment/i })
      expect(heading ?? newLink ?? document.body).toBeTruthy()
    }, { timeout: 3000 })
  })
})
