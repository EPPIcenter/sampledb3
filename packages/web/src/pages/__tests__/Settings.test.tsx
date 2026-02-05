import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '../../__tests__/helpers/render'
import Settings from '../Settings'

vi.mock('../../lib/api', () => ({
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
}))

vi.mock('../../contexts/UserContext', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../contexts/UserContext')>()
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

describe('Settings page', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders main settings sections', async () => {
    await render(<Settings />)
    const appSettings = await screen.findAllByText(/Application Settings/i)
    expect(appSettings.length).toBeGreaterThan(0)
    expect(screen.getByText(/Security Settings/i)).toBeInTheDocument()
  })

  it('renders container defaults and pagination labels', async () => {
    await render(<Settings />)
    await screen.findByText(/Configure application/i, {}, { timeout: 3000 })
    const containerDefaults = screen.getAllByText(/Container Defaults/i)
    expect(containerDefaults.length).toBeGreaterThan(0)
    expect(screen.getByText(/Pagination/i)).toBeInTheDocument()
  })
})
