import { describe, it, expect, vi, beforeEach } from 'vitest'
import userEvent from '@testing-library/user-event'
import { QueryClient } from '@tanstack/react-query'
import { render, screen, waitFor } from '../../__tests__/helpers/render'
import Settings from '../Settings'
import { settingsApi } from '../../lib/api/settings'

function mockAllSettings() {
  return {
    container_defaults: {},
    pagination_settings: { defaultPageSize: 10, maxPageSize: 100 },
    password_requirements: { minLength: 8 },
    session_settings: { maxAgeSeconds: 604800 },
    export_configurations: { configurations: [] },
    scanner_configurations: { configurations: [] },
    table_view_configurations: null,
  }
}

vi.mock('../../lib/api/settings', async () => {
  const { createMockedDomainModule } = await import('../../__tests__/helpers/mock-api')
  return createMockedDomainModule('settings', {
  settingsApi: {
    getAll: vi.fn().mockResolvedValue(mockAllSettings()),
    getContainerTypeUnits: vi.fn().mockResolvedValue({ units: [] }),
    update: vi.fn().mockResolvedValue({}),
  }
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

describe('Settings page', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(settingsApi.getAll).mockResolvedValue(mockAllSettings() as never)
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

  it('marks every cached query stale after a settings save', async () => {
    const user = userEvent.setup()
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    // Another page's cached query that reads settings (e.g. export configurations).
    queryClient.setQueryData(['export', 'configurations'], { configurations: [] })
    await render(<Settings />, {
      queryClient,
      initialEntries: ['/settings?category=application&section=pagination'],
    })

    const [, maxPageSize] = await screen.findAllByRole('spinbutton')
    await user.type(maxPageSize, '0') // 100 -> 1000
    await user.click(screen.getByRole('button', { name: /save changes/i }))

    await waitFor(() => expect(settingsApi.update).toHaveBeenCalledWith('pagination_settings', expect.anything()))
    await waitFor(() =>
      expect(queryClient.getQueryState(['export', 'configurations'])?.isInvalidated).toBe(true),
    )
  })

  it('shows PageError with retry when settings load fails', async () => {
    vi.mocked(settingsApi.getAll).mockRejectedValue(new Error('fail'))
    await render(<Settings />)
    await waitFor(() => {
      expect(screen.getByRole('alert')).toBeInTheDocument()
      expect(screen.getByText(/Could not load settings/i)).toBeInTheDocument()
      expect(screen.getByRole('button', { name: /try again/i })).toBeInTheDocument()
    })
  })
})
