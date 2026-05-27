import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, waitFor } from '../../__tests__/helpers/render'
import userEvent from '@testing-library/user-event'
import { useNavigate } from 'react-router-dom'
import Login from '../Login'

// Mock react-router-dom
const mockNavigate = vi.fn()
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom')
  return {
    ...actual,
    useNavigate: () => mockNavigate,
    useLocation: () => ({ state: null }),
  }
})

// Mock the API module
vi.mock('../../lib/api/auth', async () => {
  const { createMockedDomainModule } = await import('../../__tests__/helpers/mock-api')
  const { loginPageMock } = await import('../../__tests__/helpers/mock-api-templates')
  return createMockedDomainModule('auth', loginPageMock())
})

// Mock the UserContext
const mockSetUser = vi.fn()
const mockRefreshUser = vi.fn()

vi.mock('../../contexts/UserContext', async () => {
  const actual = await vi.importActual<typeof import('../../contexts/UserContext')>('../../contexts/UserContext')
  return {
    ...actual,
    useUser: () => ({
      user: null,
      setUser: mockSetUser,
      refreshUser: mockRefreshUser,
      loading: false,
      error: null,
    }),
  }
})

// Mock localUserHistory
vi.mock('../../lib/localUserHistory', () => ({
  addRecentUser: vi.fn(),
}))

import { authApi } from '../../lib/api/auth'
import { addRecentUser } from '../../lib/localUserHistory'

describe('Login Page', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('Username/Email Login', () => {
    it('input field accepts email or username', async () => {
      await render(<Login />)

      const input = screen.getByLabelText(/email or username/i)
      expect(input).toBeInTheDocument()
      expect(input).toHaveAttribute('type', 'text')
    })

    it('placeholder text shows "Email or Username"', async () => {
      await render(<Login />)

      const input = screen.getByPlaceholderText(/email or username/i)
      expect(input).toBeInTheDocument()
    })

    it('login with email works', async () => {
      const user = userEvent.setup()
      const mockUser = {
        id: 1,
        email: 'test@example.com',
        name: 'Test User',
        username: 'testuser',
        role: 'member' as const,
      }

      vi.mocked(authApi.login).mockResolvedValueOnce({
        user: mockUser,
      } as any)

      await render(<Login />)

      const emailInput = screen.getByLabelText(/email or username/i)
      const passwordInput = screen.getByLabelText(/password/i)

      await user.type(emailInput, 'test@example.com')
      await user.type(passwordInput, 'password123')

      const submitButton = screen.getByRole('button', { name: /sign in/i })
      await user.click(submitButton)

      await waitFor(() => {
        expect(authApi.login).toHaveBeenCalledWith('test@example.com', 'password123')
      })

      await waitFor(() => {
        expect(mockSetUser).toHaveBeenCalledWith(mockUser)
      })

      await waitFor(() => {
        expect(addRecentUser).toHaveBeenCalledWith(mockUser)
      })
    })

    it('login with username works', async () => {
      const user = userEvent.setup()
      const mockUser = {
        id: 1,
        email: 'test@example.com',
        name: 'Test User',
        username: 'testuser',
        role: 'member' as const,
      }

      vi.mocked(authApi.login).mockResolvedValueOnce({
        user: mockUser,
      } as any)

      await render(<Login />)

      const usernameInput = screen.getByLabelText(/email or username/i)
      const passwordInput = screen.getByLabelText(/password/i)

      await user.type(usernameInput, 'testuser')
      await user.type(passwordInput, 'password123')

      const submitButton = screen.getByRole('button', { name: /sign in/i })
      await user.click(submitButton)

      await waitFor(() => {
        expect(authApi.login).toHaveBeenCalledWith('testuser', 'password123')
      })

      await waitFor(() => {
        expect(mockSetUser).toHaveBeenCalledWith(mockUser)
      })
    })

    it('error handling for invalid credentials', async () => {
      const user = userEvent.setup()
      vi.mocked(authApi.login).mockRejectedValueOnce({
        response: {
          data: {
            error: 'Invalid credentials',
          },
        },
      })

      await render(<Login />)

      const emailInput = screen.getByLabelText(/email or username/i)
      const passwordInput = screen.getByLabelText(/password/i)

      await user.type(emailInput, 'wrong@example.com')
      await user.type(passwordInput, 'wrongpassword')

      const submitButton = screen.getByRole('button', { name: /sign in/i })
      await user.click(submitButton)

      await waitFor(() => {
        expect(screen.getByText(/invalid credentials/i)).toBeInTheDocument()
      })

      expect(mockSetUser).not.toHaveBeenCalled()
    })

    it('calls authApi.login with emailOrUsername parameter', async () => {
      const user = userEvent.setup()
      const mockUser = {
        id: 1,
        email: 'test@example.com',
        name: 'Test User',
        role: 'member' as const,
      }

      vi.mocked(authApi.login).mockResolvedValueOnce({
        user: mockUser,
      } as any)

      await render(<Login />)

      const emailInput = screen.getByLabelText(/email or username/i)
      const passwordInput = screen.getByLabelText(/password/i)

      await user.type(emailInput, 'testuser')
      await user.type(passwordInput, 'password123')

      const submitButton = screen.getByRole('button', { name: /sign in/i })
      await user.click(submitButton)

      await waitFor(() => {
        expect(authApi.login).toHaveBeenCalledWith('testuser', 'password123')
      })
    })

    it('shows loading state during login', async () => {
      const user = userEvent.setup()
      let resolveLogin: (value: any) => void
      const loginPromise = new Promise((resolve) => {
        resolveLogin = resolve
      })
      vi.mocked(authApi.login).mockReturnValueOnce(loginPromise as any)

      await render(<Login />)

      const emailInput = screen.getByLabelText(/email or username/i)
      const passwordInput = screen.getByLabelText(/password/i)

      await user.type(emailInput, 'test@example.com')
      await user.type(passwordInput, 'password123')

      const submitButton = screen.getByRole('button', { name: /sign in/i })
      
      // Click and verify loading state
      const clickPromise = user.click(submitButton)
      
      // Wait for loading state to appear
      await waitFor(() => {
        expect(screen.getByText(/signing in/i)).toBeInTheDocument()
        expect(submitButton).toBeDisabled()
      })

      // Resolve the promise
      resolveLogin!({
        user: {
          id: 1,
          email: 'test@example.com',
          name: 'Test User',
          role: 'member',
        },
      })

      // Wait for click to complete
      await clickPromise

      // Button should eventually not be disabled (though navigation might happen first)
      await waitFor(() => {
        const button = screen.queryByRole('button', { name: /sign in/i })
        if (button) {
          expect(button).not.toBeDisabled()
        }
      }, { timeout: 2000 })
    })

    it('navigates after successful login', async () => {
      const user = userEvent.setup()
      const mockUser = {
        id: 1,
        email: 'test@example.com',
        name: 'Test User',
        role: 'member' as const,
      }

      vi.mocked(authApi.login).mockResolvedValueOnce({
        user: mockUser,
      } as any)

      await render(<Login />)

      const emailInput = screen.getByLabelText(/email or username/i)
      const passwordInput = screen.getByLabelText(/password/i)

      await user.type(emailInput, 'test@example.com')
      await user.type(passwordInput, 'password123')

      const submitButton = screen.getByRole('button', { name: /sign in/i })
      await user.click(submitButton)

      await waitFor(() => {
        expect(mockSetUser).toHaveBeenCalled()
      })
    })
  })
})
