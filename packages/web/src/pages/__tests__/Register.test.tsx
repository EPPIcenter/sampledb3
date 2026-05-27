import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, waitFor } from '../../__tests__/helpers/render'
import userEvent from '@testing-library/user-event'
import { useNavigate } from 'react-router-dom'
import Register from '../Register'

const mockNavigate = vi.fn()
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom')
  return {
    ...actual,
    useNavigate: () => mockNavigate,
    Link: ({ to, children }: { to: string; children: React.ReactNode }) => (
      <a href={to}>{children}</a>
    ),
  }
})

vi.mock('../../lib/api', async () => {
  const { createMockedApi } = await import('../../__tests__/helpers/mock-api')
  return createMockedApi({
  authApi: {
    selfRegister: vi.fn(),
  },
})
})

import { authApi } from '../../lib/api'

describe('Register Page', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders registration form with email, name, password, and confirm password fields', async () => {
    await render(<Register />)

    expect(screen.getByLabelText(/email/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/name/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/^password$/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/confirm password/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /create account|register/i })).toBeInTheDocument()
  })

  it('has link to login page', async () => {
    await render(<Register />)

    const loginLink = screen.getByRole('link', { name: /sign in|log in|already have an account/i })
    expect(loginLink).toBeInTheDocument()
    expect(loginLink).toHaveAttribute('href', '/login')
  })

  it('submits form with valid data and shows success message', async () => {
    const user = userEvent.setup()
    vi.mocked(authApi.selfRegister).mockResolvedValueOnce({
      data: {
        user: {
          id: 1,
          email: 'new@example.com',
          name: 'New User',
          role: 'member',
        },
      },
    } as never)

    await render(<Register />)

    await user.type(screen.getByLabelText(/email/i), 'new@example.com')
    await user.type(screen.getByLabelText(/name/i), 'New User')
    await user.type(screen.getByLabelText(/^password/i), 'password123')
    await user.type(screen.getByLabelText(/confirm password/i), 'password123')

    const submitBtn = screen.getByRole('button', { name: /create account|register/i })
    await user.click(submitBtn)

    await waitFor(() => {
      expect(authApi.selfRegister).toHaveBeenCalledWith({
        email: 'new@example.com',
        name: 'New User',
        password: 'password123',
      })
    })

    await waitFor(() => {
      expect(screen.getByText(/account created|admin will approve|pending approval/i)).toBeInTheDocument()
    })
  })

  it('shows error when passwords do not match', async () => {
    const user = userEvent.setup()
    await render(<Register />)

    await user.type(screen.getByLabelText(/email/i), 'test@example.com')
    await user.type(screen.getByLabelText(/name/i), 'Test User')
    await user.type(screen.getByLabelText(/^password/i), 'password123')
    await user.type(screen.getByLabelText(/confirm password/i), 'different')
    await user.click(screen.getByRole('button', { name: /create account|register/i }))

    await waitFor(() => {
      expect(screen.getByText(/passwords do not match/i)).toBeInTheDocument()
    })
    expect(authApi.selfRegister).not.toHaveBeenCalled()
  })

  it('shows error message when registration fails', async () => {
    const user = userEvent.setup()
    vi.mocked(authApi.selfRegister).mockRejectedValueOnce({
      response: { data: { error: 'Email already in use' } },
    })

    await render(<Register />)

    await user.type(screen.getByLabelText(/email/i), 'exists@example.com')
    await user.type(screen.getByLabelText(/name/i), 'Test User')
    await user.type(screen.getByLabelText(/^password/i), 'password123')
    await user.type(screen.getByLabelText(/confirm password/i), 'password123')
    await user.click(screen.getByRole('button', { name: /create account|register/i }))

    await waitFor(() => {
      expect(screen.getByText(/email already in use/i)).toBeInTheDocument()
    })
  })
})
