import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '../../__tests__/helpers/render'

vi.mock('../../lib/api', () => ({
  authApi: {
    getCurrentUser: vi.fn().mockResolvedValue({
      data: { user: { id: 1, email: 'admin@test.com', name: 'Admin', role: 'admin' } },
    }),
  },
  controlsApi: {
    list: vi.fn().mockResolvedValue({ data: { controls: [] } }),
    listAllBatches: vi.fn().mockResolvedValue({ data: { batches: [] } }),
  },
  strainsApi: { list: vi.fn().mockResolvedValue({ data: { strains: [] } }) },
}))

vi.mock('../../contexts/UserContext', async (importOriginal) => {
  const actual = await (importOriginal as () => Promise<typeof import('../../contexts/UserContext')>)()
  return { ...actual, useUser: () => ({ canWrite: true }) }
})

vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-router-dom')>()
  return { ...actual, useSearchParams: () => [new URLSearchParams(), vi.fn()] }
})

describe('Controls', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders without crashing', async () => {
    const { default: Controls } = await import('../Controls')
    const { container } = render(<Controls />)
    expect(container).toBeInTheDocument()
  })

  it('shows blood controls content', async () => {
    const { default: Controls } = await import('../Controls')
    render(<Controls />)
    const heading = screen.getByRole('heading', { name: /blood controls management/i })
    expect(heading).toBeInTheDocument()
  })
})
