import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '../../__tests__/helpers/render'
import AdminSettings from '../AdminSettings'

vi.mock('../../lib/api', async () => {
  const { createMockedApi } = await import('../../__tests__/helpers/mock-api')
  return createMockedApi({
  settingsApi: {
    getAll: vi.fn().mockResolvedValue({
      data: {
        container_defaults: {},
        pagination_settings: { defaultPageSize: 10, maxPageSize: 100 },
        password_requirements: { minLength: 8 },
        session_settings: { maxAgeSeconds: 604800 },
        export_configurations: { configurations: [] },
        scanner_configurations: { configurations: [] },
      },
    }),
    getUnits: vi.fn().mockResolvedValue({ data: [] }),
    getContainerTypeUnits: vi.fn().mockResolvedValue({ data: { units: [] } }),
  },
})
})

vi.mock('../../contexts/UserContext', async () => {
  const actual = await vi.importActual<typeof import('../../contexts/UserContext')>('../../contexts/UserContext')
  return {
    ...actual,
    useUser: () => ({
      user: { id: 1, name: 'Test', email: 'test@test.com', role: 'admin' },
      loading: false,
      canWrite: true,
      isAdmin: true,
    }),
  }
})

describe('AdminSettings', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders Settings content', async () => {
    await render(<AdminSettings />)
    await waitFor(() => {
      const headings = screen.getAllByText(/Application Settings/i)
      expect(headings.length).toBeGreaterThan(0)
    }, { timeout: 3000 })
  })
})
