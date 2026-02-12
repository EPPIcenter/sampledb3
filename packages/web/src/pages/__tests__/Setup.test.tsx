import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '../../__tests__/helpers/render'
import userEvent from '@testing-library/user-event'
import Setup from '../Setup'
import * as api from '../../lib/api'

const mockNavigate = vi.fn()
vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-router-dom')>()
  return { ...actual, useNavigate: () => mockNavigate }
})

vi.mock('../../lib/api', () => ({
  setupApi: {
    status: vi.fn().mockResolvedValue({ data: { initialized: false } }),
    initialize: vi.fn().mockResolvedValue(undefined),
  },
}))

vi.mock('../../contexts/UserContext', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../contexts/UserContext')>()
  return { ...actual, useUser: () => ({ canWrite: true }) }
})

describe('Setup', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(api.setupApi.status).mockResolvedValue({ data: { initialized: false } } as never)
  })

  it('shows setup-related content', async () => {
    await render(<Setup />)
    const welcome = screen.getByRole('heading', { name: /welcome to sampledb/i })
    expect(welcome).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /next/i })).toBeInTheDocument()
  })

  it('navigates to / when already initialized', async () => {
    vi.mocked(api.setupApi.status).mockResolvedValue({ data: { initialized: true } } as never)
    await render(<Setup />)
    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith('/')
    })
  })

  it('shows error when status check fails', async () => {
    vi.mocked(api.setupApi.status).mockRejectedValue(new Error('Network error'))
    await render(<Setup />)
    await waitFor(() => {
      expect(screen.getByText(/network error|failed to check/i)).toBeInTheDocument()
    }, { timeout: 3000 })
  })

  it('disables Next on step 1 until admin fields are valid', async () => {
    const user = userEvent.setup()
    await render(<Setup />)
    const nextButton = screen.getByRole('button', { name: /next/i })
    expect(nextButton).toBeDisabled()

    await user.type(screen.getByLabelText(/full name/i), 'Admin User')
    expect(nextButton).toBeDisabled()
    await user.type(screen.getByLabelText(/email address/i), 'admin@example.com')
    await user.type(screen.getByLabelText(/^password/i), 'password1')
    await user.type(screen.getByLabelText(/confirm password/i), 'password1')
    await waitFor(() => {
      expect(nextButton).not.toBeDisabled()
    })
  })

  it('advances to step 2 when Next is clicked with valid step 1', async () => {
    const user = userEvent.setup()
    await render(<Setup />)
    await user.type(screen.getByLabelText(/full name/i), 'Admin User')
    await user.type(screen.getByLabelText(/email address/i), 'admin@example.com')
    await user.type(screen.getByLabelText(/^password/i), 'password123')
    await user.type(screen.getByLabelText(/confirm password/i), 'password123')
    const nextButton = screen.getByRole('button', { name: /next/i })
    await waitFor(() => expect(nextButton).not.toBeDisabled())
    await user.click(nextButton)
    await waitFor(() => {
      expect(screen.getByText(/step 2 of 4/i)).toBeInTheDocument()
      expect(screen.getByText(/core definitions/i)).toBeInTheDocument()
    })
  })

  it('Back from step 2 returns to step 1', async () => {
    const user = userEvent.setup()
    await render(<Setup />)
    await user.type(screen.getByLabelText(/full name/i), 'Admin User')
    await user.type(screen.getByLabelText(/email address/i), 'admin@example.com')
    await user.type(screen.getByLabelText(/^password/i), 'password123')
    await user.type(screen.getByLabelText(/confirm password/i), 'password123')
    await user.click(screen.getByRole('button', { name: /next/i }))
    await waitFor(() => expect(screen.getByText(/core definitions/i)).toBeInTheDocument())
    await user.click(screen.getByRole('button', { name: /back/i }))
    await waitFor(() => {
      expect(screen.getByText(/step 1 of 4/i)).toBeInTheDocument()
      expect(screen.getByText(/create administrator/i)).toBeInTheDocument()
    })
  })

  it('calls initialize and navigates when Finish Setup succeeds', async () => {
    const user = userEvent.setup()
    vi.mocked(api.setupApi.initialize).mockResolvedValue(undefined as never)
    await render(<Setup />)
    // Go to step 1 and fill
    await user.type(screen.getByLabelText(/full name/i), 'Admin User')
    await user.type(screen.getByLabelText(/email address/i), 'admin@example.com')
    await user.type(screen.getByLabelText(/^password/i), 'password123')
    await user.type(screen.getByLabelText(/confirm password/i), 'password123')
    await user.click(screen.getByRole('button', { name: /next/i }))
    await waitFor(() => expect(screen.getByText(/core definitions/i)).toBeInTheDocument())
    await user.click(screen.getByRole('button', { name: /next/i }))
    await waitFor(() => expect(screen.getByText(/lab infrastructure/i)).toBeInTheDocument())
    await user.click(screen.getByRole('button', { name: /next/i }))
    await waitFor(() => expect(screen.getByText(/biology/i)).toBeInTheDocument())
    const finishButton = screen.getByRole('button', { name: /finish setup/i })
    await user.click(finishButton)
    await waitFor(() => {
      expect(api.setupApi.initialize).toHaveBeenCalled()
      expect(mockNavigate).toHaveBeenCalledWith('/login', { state: { fromSetup: true } })
    })
  })

  it('shows error and stops loading when initialize fails', async () => {
    const user = userEvent.setup()
    vi.mocked(api.setupApi.initialize).mockRejectedValue(new Error('Setup failed'))
    await render(<Setup />)
    await user.type(screen.getByLabelText(/full name/i), 'Admin User')
    await user.type(screen.getByLabelText(/email address/i), 'admin@example.com')
    await user.type(screen.getByLabelText(/^password/i), 'password123')
    await user.type(screen.getByLabelText(/confirm password/i), 'password123')
    await user.click(screen.getByRole('button', { name: /next/i }))
    await waitFor(() => expect(screen.getByText(/core definitions/i)).toBeInTheDocument())
    await user.click(screen.getByRole('button', { name: /next/i }))
    await waitFor(() => expect(screen.getByText(/lab infrastructure/i)).toBeInTheDocument())
    await user.click(screen.getByRole('button', { name: /next/i }))
    await waitFor(() => expect(screen.getByRole('button', { name: /finish setup/i })).toBeInTheDocument())
    await user.click(screen.getByRole('button', { name: /finish setup/i }))
    await waitFor(() => {
      expect(screen.getByText(/setup failed/i)).toBeInTheDocument()
    }, { timeout: 3000 })
    expect(screen.getByRole('button', { name: /finish setup/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /finish setup/i })).not.toBeDisabled()
  })
})
