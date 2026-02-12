import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '../../__tests__/helpers/render'
import Dashboard from '../Dashboard'

vi.mock('../../lib/api', () => ({
  default: { get: vi.fn().mockResolvedValue({ data: {} }) },
  authApi: {
    getCurrentUser: vi.fn().mockResolvedValue({
      data: { user: { id: 1, email: 'admin@test.com', name: 'Admin', role: 'admin' } },
    }),
  },
  studiesApi: { list: vi.fn().mockResolvedValue({ studies: [], pagination: { total: 0, totalPages: 0 } }) },
  activityApi: { recent: vi.fn().mockResolvedValue({ data: { activity: [] } }) },
  statisticsApi: { get: vi.fn().mockResolvedValue({ data: null }) },
  controlsApi: { list: vi.fn().mockResolvedValue({ data: [] }) },
  qpcrExperimentsApi: { list: vi.fn().mockResolvedValue({ data: { experiments: [] } }) },
}))

vi.mock('../../contexts/UserContext', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../contexts/UserContext')>()
  return { ...actual, useUser: () => ({ canWrite: true }) }
})

describe('Dashboard', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('eventually shows dashboard content or metrics', async () => {
    await render(<Dashboard />)
    await vi.waitFor(() => {
      const el = screen.queryByRole('main') ?? document.querySelector('[class*="dashboard"]')
      expect(el).toBeTruthy()
    }, { timeout: 3000 })
  })
})
