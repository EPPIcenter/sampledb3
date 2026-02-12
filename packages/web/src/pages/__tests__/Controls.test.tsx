import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '../../__tests__/helpers/render'
import BloodControls from '../BloodControls'

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
  strainsApi: { list: vi.fn().mockResolvedValue({ data: [] }) },
}))

vi.mock('../../contexts/UserContext', async (importOriginal) => {
  const actual = await (importOriginal as () => Promise<typeof import('../../contexts/UserContext')>)()
  return { ...actual, useUser: () => ({ canWrite: true }) }
})

vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-router-dom')>()
  return { ...actual, useSearchParams: () => [new URLSearchParams(), vi.fn()] }
})

describe('BloodControls', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('shows blood controls content', async () => {
    await render(<BloodControls />)
    const heading = await screen.findByRole('heading', { name: /blood controls management/i })
    expect(heading).toBeInTheDocument()
    await waitFor(() => {
      expect(screen.getByText('Total Definitions')).toBeInTheDocument()
    })
  })
})
