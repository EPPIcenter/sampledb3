import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, waitFor } from '../../__tests__/helpers/render'
import userEvent from '@testing-library/user-event'
import Profile from '../Profile'

// Mock the API module
vi.mock('../../lib/api', () => ({
  authApi: {
    updateProfile: vi.fn(),
    changePassword: vi.fn(),
    getCurrentUser: vi.fn(),
  },
}))

// Mock the UserContext
const mockRefreshUser = vi.fn()
const mockUser = {
  id: 1,
  email: 'test@example.com',
  name: 'Test User',
  username: 'testuser',
  role: 'member' as const,
}

let mockUserValue = mockUser
let mockLoadingValue = false

vi.mock('../../contexts/UserContext', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../contexts/UserContext')>()
  return {
    ...actual,
    useUser: () => ({
      user: mockUserValue,
      refreshUser: mockRefreshUser,
      loading: mockLoadingValue,
      error: null,
    }),
  }
})

import { authApi } from '../../lib/api'

describe('Profile Page', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('Profile Page Rendering', () => {
    it('renders profile form with user data', async () => {
      await render(<Profile />)

      // Use getElementById for exact matching
      expect(screen.getByLabelText('Name')).toHaveValue('Test User')
      expect(screen.getByLabelText('Email')).toHaveValue('test@example.com')
      expect(screen.getByLabelText(/username/i)).toHaveValue('testuser')
    })

    it('renders password change form', async () => {
      await render(<Profile />)

      expect(screen.getByLabelText(/^current password$/i)).toBeInTheDocument()
      expect(screen.getByLabelText(/^new password$/i)).toBeInTheDocument()
      expect(screen.getByLabelText(/^confirm new password$/i)).toBeInTheDocument()
    })

    it('shows loading state when user is not loaded', async () => {
      const originalUser = mockUserValue
      const originalLoading = mockLoadingValue
      mockUserValue = null as any
      mockLoadingValue = true

      await render(<Profile />)
      expect(screen.getByText(/loading profile/i)).toBeInTheDocument()

      // Restore
      mockUserValue = originalUser
      mockLoadingValue = originalLoading
    })

    it('displays current user information', async () => {
      await render(<Profile />)

      expect(screen.getByText('My Profile')).toBeInTheDocument()
      expect(screen.getByText(/manage your account information/i)).toBeInTheDocument()
    })
  })

  describe('Profile Update Form', () => {
    it('updates name field', async () => {
      const user = userEvent.setup()
      await render(<Profile />)

      const nameInput = screen.getByLabelText('Name')
      await user.clear(nameInput)
      await user.type(nameInput, 'Updated Name')

      expect(nameInput).toHaveValue('Updated Name')
    })

    it('updates email field', async () => {
      const user = userEvent.setup()
      await render(<Profile />)

      const emailInput = screen.getByLabelText('Email')
      await user.clear(emailInput)
      await user.type(emailInput, 'newemail@example.com')

      expect(emailInput).toHaveValue('newemail@example.com')
    })

    it('updates username field', async () => {
      const user = userEvent.setup()
      await render(<Profile />)

      const usernameInput = screen.getByLabelText(/username/i)
      await user.clear(usernameInput)
      await user.type(usernameInput, 'newusername')

      expect(usernameInput).toHaveValue('newusername')
    })

    it('shows error on validation failure', async () => {
      const user = userEvent.setup()
      vi.mocked(authApi.updateProfile).mockRejectedValueOnce({
        response: {
          data: {
            error: 'Email already in use',
          },
        },
      })

      await render(<Profile />)

      const emailInput = screen.getByLabelText('Email')
      await user.clear(emailInput)
      await user.type(emailInput, 'duplicate@example.com')

      const submitButton = screen.getByRole('button', { name: /save changes/i })
      await user.click(submitButton)

      await waitFor(() => {
        expect(screen.getByText(/email already in use/i)).toBeInTheDocument()
      })
    })

    it('shows success message on successful update', async () => {
      const user = userEvent.setup()
      vi.mocked(authApi.updateProfile).mockResolvedValueOnce({
        data: {
          user: {
            ...mockUser,
            name: 'Updated Name',
          },
        },
      } as any)

      await render(<Profile />)

      const nameInput = screen.getByLabelText('Name')
      await user.clear(nameInput)
      await user.type(nameInput, 'Updated Name')

      const submitButton = screen.getByRole('button', { name: /save changes/i })
      await user.click(submitButton)

      await waitFor(() => {
        expect(screen.getByText(/profile updated successfully/i)).toBeInTheDocument()
      })
    })

    it('calls authApi.updateProfile with correct data', async () => {
      const user = userEvent.setup()
      vi.mocked(authApi.updateProfile).mockResolvedValueOnce({
        data: { user: mockUser },
      } as any)

      await render(<Profile />)

      const nameInput = screen.getByLabelText('Name')
      await user.clear(nameInput)
      await user.type(nameInput, 'New Name')

      const submitButton = screen.getByRole('button', { name: /save changes/i })
      await user.click(submitButton)

      await waitFor(() => {
        expect(authApi.updateProfile).toHaveBeenCalledWith({
          name: 'New Name',
        })
      })
    })

    it('refreshes user context after update', async () => {
      const user = userEvent.setup()
      vi.mocked(authApi.updateProfile).mockResolvedValueOnce({
        data: { user: mockUser },
      } as any)

      await render(<Profile />)

      const nameInput = screen.getByLabelText('Name')
      await user.clear(nameInput)
      await user.type(nameInput, 'New Name')

      const submitButton = screen.getByRole('button', { name: /save changes/i })
      await user.click(submitButton)

      await waitFor(() => {
        expect(mockRefreshUser).toHaveBeenCalled()
      })
    })

    it('handles empty username (clearing username)', async () => {
      const user = userEvent.setup()
      vi.mocked(authApi.updateProfile).mockResolvedValueOnce({
        data: { user: { ...mockUser, username: undefined } },
      } as any)

      await render(<Profile />)

      const usernameInput = screen.getByLabelText(/username/i)
      await user.clear(usernameInput)

      const submitButton = screen.getByRole('button', { name: /save changes/i })
      await user.click(submitButton)

      await waitFor(() => {
        expect(authApi.updateProfile).toHaveBeenCalledWith({
          username: null,
        })
      })
    })

    it('disables submit button while loading', async () => {
      const user = userEvent.setup()
      let resolveUpdate: (value: any) => void
      const updatePromise = new Promise((resolve) => {
        resolveUpdate = resolve
      })
      vi.mocked(authApi.updateProfile).mockReturnValueOnce(updatePromise as any)

      await render(<Profile />)

      const nameInput = screen.getByLabelText('Name')
      await user.clear(nameInput)
      await user.type(nameInput, 'New Name')

      const submitButton = screen.getByRole('button', { name: /save changes/i })
      await user.click(submitButton)

      // Button should be disabled while loading
      expect(submitButton).toBeDisabled()
      expect(screen.getByText(/saving/i)).toBeInTheDocument()

      // Resolve the promise
      resolveUpdate!({ data: { user: mockUser } })
      await waitFor(() => {
        expect(submitButton).not.toBeDisabled()
      })
    })

    it('shows error when no changes to save', async () => {
      const user = userEvent.setup()
      await render(<Profile />)

      const submitButton = screen.getByRole('button', { name: /save changes/i })
      await user.click(submitButton)

      await waitFor(() => {
        expect(screen.getByText(/no changes to save/i)).toBeInTheDocument()
      })
    })
  })

  describe('Password Change Form', () => {
    it('updates current password field', async () => {
      const user = userEvent.setup()
      await render(<Profile />)

      const currentPasswordInput = screen.getByLabelText(/^current password$/i)
      await user.type(currentPasswordInput, 'currentpass123')

      expect(currentPasswordInput).toHaveValue('currentpass123')
    })

    it('updates new password field', async () => {
      const user = userEvent.setup()
      await render(<Profile />)

      const newPasswordInput = screen.getByLabelText(/^new password$/i)
      await user.type(newPasswordInput, 'newpass123')

      expect(newPasswordInput).toHaveValue('newpass123')
    })

    it('updates confirm password field', async () => {
      const user = userEvent.setup()
      await render(<Profile />)

      const confirmPasswordInput = screen.getByLabelText(/^confirm new password$/i)
      await user.type(confirmPasswordInput, 'newpass123')

      expect(confirmPasswordInput).toHaveValue('newpass123')
    })

    it('shows/hides password visibility toggle', async () => {
      const user = userEvent.setup()
      await render(<Profile />)

      const currentPasswordInput = screen.getByLabelText(/current password/i) as HTMLInputElement
      expect(currentPasswordInput.type).toBe('password')

      // Find the visibility toggle button (it's a button next to the password input)
      const toggleButton = currentPasswordInput.parentElement?.querySelector('button')
      if (toggleButton) {
        expect(toggleButton).toBeInTheDocument()
        await user.click(toggleButton)
      }

      await waitFor(() => {
        expect(currentPasswordInput.type).toBe('text')
      })
    })

    it('validates password match before submit', async () => {
      const user = userEvent.setup()
      await render(<Profile />)

      const currentPasswordInput = screen.getByLabelText(/^current password$/i)
      const newPasswordInput = screen.getByLabelText(/^new password$/i)
      const confirmPasswordInput = screen.getByLabelText(/^confirm new password$/i)

      await user.type(currentPasswordInput, 'currentpass123')
      await user.type(newPasswordInput, 'newpass123')
      await user.type(confirmPasswordInput, 'differentpass123')

      const submitButton = screen.getByRole('button', { name: /change password/i })
      await user.click(submitButton)

      await waitFor(() => {
        expect(screen.getByText(/new passwords do not match/i)).toBeInTheDocument()
      })

      expect(authApi.changePassword).not.toHaveBeenCalled()
    })

    it('shows error on mismatch', async () => {
      const user = userEvent.setup()
      await render(<Profile />)

      const currentPasswordInput = screen.getByLabelText(/^current password$/i)
      const newPasswordInput = screen.getByLabelText(/^new password$/i)
      const confirmPasswordInput = screen.getByLabelText(/^confirm new password$/i)

      await user.type(currentPasswordInput, 'currentpass123')
      await user.type(newPasswordInput, 'newpass123')
      await user.type(confirmPasswordInput, 'differentpass123')

      const submitButton = screen.getByRole('button', { name: /change password/i })
      await user.click(submitButton)

      await waitFor(() => {
        expect(screen.getByText(/new passwords do not match/i)).toBeInTheDocument()
      })
    })

    it('shows error on API failure', async () => {
      const user = userEvent.setup()
      vi.mocked(authApi.changePassword).mockRejectedValueOnce({
        response: {
          data: {
            error: 'Current password is incorrect',
          },
        },
      })

      await render(<Profile />)

      const currentPasswordInput = screen.getByLabelText(/^current password$/i)
      const newPasswordInput = screen.getByLabelText(/^new password$/i)
      const confirmPasswordInput = screen.getByLabelText(/^confirm new password$/i)

      await user.type(currentPasswordInput, 'wrongpassword')
      await user.type(newPasswordInput, 'newpass123')
      await user.type(confirmPasswordInput, 'newpass123')

      const submitButton = screen.getByRole('button', { name: /change password/i })
      await user.click(submitButton)

      await waitFor(() => {
        expect(screen.getByText(/current password is incorrect/i)).toBeInTheDocument()
      })
    })

    it('shows success message on success', async () => {
      const user = userEvent.setup()
      vi.mocked(authApi.changePassword).mockResolvedValueOnce({
        data: { message: 'Password changed successfully' },
      } as any)

      await render(<Profile />)

      const currentPasswordInput = screen.getByLabelText(/^current password$/i)
      const newPasswordInput = screen.getByLabelText(/^new password$/i)
      const confirmPasswordInput = screen.getByLabelText(/^confirm new password$/i)

      await user.type(currentPasswordInput, 'currentpass123')
      await user.type(newPasswordInput, 'newpass123')
      await user.type(confirmPasswordInput, 'newpass123')

      const submitButton = screen.getByRole('button', { name: /change password/i })
      await user.click(submitButton)

      await waitFor(() => {
        expect(screen.getByText(/password changed successfully/i)).toBeInTheDocument()
      })
    })

    it('clears form after successful change', async () => {
      const user = userEvent.setup()
      vi.mocked(authApi.changePassword).mockResolvedValueOnce({
        data: { message: 'Password changed successfully' },
      } as any)

      await render(<Profile />)

      const currentPasswordInput = screen.getByLabelText(/^current password$/i)
      const newPasswordInput = screen.getByLabelText(/^new password$/i)
      const confirmPasswordInput = screen.getByLabelText(/^confirm new password$/i)

      await user.type(currentPasswordInput, 'currentpass123')
      await user.type(newPasswordInput, 'newpass123')
      await user.type(confirmPasswordInput, 'newpass123')

      const submitButton = screen.getByRole('button', { name: /change password/i })
      await user.click(submitButton)

      await waitFor(() => {
        expect(currentPasswordInput).toHaveValue('')
        expect(newPasswordInput).toHaveValue('')
        expect(confirmPasswordInput).toHaveValue('')
      })
    })

    it('calls authApi.changePassword with correct data', async () => {
      const user = userEvent.setup()
      vi.mocked(authApi.changePassword).mockResolvedValueOnce({
        data: { message: 'Password changed successfully' },
      } as any)

      await render(<Profile />)

      const currentPasswordInput = screen.getByLabelText(/^current password$/i)
      const newPasswordInput = screen.getByLabelText(/^new password$/i)
      const confirmPasswordInput = screen.getByLabelText(/^confirm new password$/i)

      await user.type(currentPasswordInput, 'currentpass123')
      await user.type(newPasswordInput, 'newpass123')
      await user.type(confirmPasswordInput, 'newpass123')

      const submitButton = screen.getByRole('button', { name: /change password/i })
      await user.click(submitButton)

      await waitFor(() => {
        expect(authApi.changePassword).toHaveBeenCalledWith({
          currentPassword: 'currentpass123',
          newPassword: 'newpass123',
        })
      })
    })
  })
})
