import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '../../__tests__/helpers/render'
import BloodControls from '../BloodControls'

vi.mock('../../lib/api', () => ({
  controlsApi: {
    list: vi.fn().mockResolvedValue({ data: { controls: [] } }),
    listAllBatches: vi.fn().mockResolvedValue({ data: { batches: [] } }),
  },
  strainsApi: {
    list: vi.fn().mockResolvedValue({ data: [] }),
  },
}))

vi.mock('../../contexts/UserContext', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../contexts/UserContext')>()
  return { ...actual, useUser: () => ({ canWrite: true }) }
})

describe('BloodControls', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders without crashing', async () => {
    const { container } = await render(<BloodControls />)
    expect(container).toBeInTheDocument()
  })

  it('shows Definitions or Batches tab content', async () => {
    await render(<BloodControls />)
    await waitFor(
      () => {
        const tabs = screen.getAllByText(/definitions|batches/i)
        expect(tabs.length).toBeGreaterThan(0)
      },
      { timeout: 3000 }
    )
  })
})
