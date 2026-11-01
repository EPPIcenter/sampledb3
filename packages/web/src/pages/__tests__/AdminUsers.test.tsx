import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, within } from '../../__tests__/helpers/render'
import AdminUsers from '../AdminUsers'
import { adminApi } from '../../lib/api/admin'
import userEvent from '@testing-library/user-event'

vi.mock('../../lib/api/admin', async () => {
  const { createMockedDomainModule } = await import('../../__tests__/helpers/mock-api')
  return createMockedDomainModule('admin', {
  adminApi: {
    getUsers: vi.fn().mockResolvedValue({ users: [] }),
    createUser: vi.fn().mockResolvedValue(undefined),
    updateUser: vi.fn().mockResolvedValue(undefined),
    deleteUser: vi.fn().mockResolvedValue(undefined),
    restoreUser: vi.fn().mockResolvedValue(undefined),
    resetPassword: vi.fn().mockResolvedValue(undefined),
    getUserSessions: vi.fn().mockResolvedValue({ sessions: [] }),
    revokeSession: vi.fn().mockResolvedValue({ message: 'Session revoked successfully' }),
  }
  })
})

describe('AdminUsers', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(adminApi.getUsers).mockResolvedValue({ users: [] })
  })

  it('shows User Management heading', async () => {
    await render(<AdminUsers />)
    await waitFor(() => {
      expect(screen.getByRole('heading', { name: /user management/i })).toBeInTheDocument()
    })
  })

  it('calls getUsers on mount', async () => {
    await render(<AdminUsers />)
    await waitFor(() => {
      expect(adminApi.getUsers).toHaveBeenCalled()
    })
  })

  it('shows user rows when getUsers returns users', async () => {
    vi.mocked(adminApi.getUsers).mockResolvedValue({
      users: [
        { id: 1, name: 'Admin User', email: 'admin@test.com', role: 'admin' },
      ],
    })
    await render(<AdminUsers />)
    await waitFor(() => {
      expect(screen.getByText('admin@test.com')).toBeInTheDocument()
      expect(screen.getByText('Admin User')).toBeInTheDocument()
    }, { timeout: 3000 })
  })

  it('lists a user\'s sessions by public id and revokes one by that id', async () => {
    const user = userEvent.setup()
    vi.mocked(adminApi.getUsers).mockResolvedValue({
      users: [{ id: 7, name: 'Member User', email: 'member@test.com', role: 'member', approvedAt: '2026-01-01' }],
    })
    vi.mocked(adminApi.getUserSessions)
      .mockResolvedValueOnce({ sessions: [{ id: 'pub_abc', expiresAt: 2_000_000_000 }] })
      .mockResolvedValueOnce({ sessions: [] })
    await render(<AdminUsers />)

    await user.click(await screen.findByRole('button', { name: /view sessions/i }))
    expect(await screen.findByText('pub_abc')).toBeInTheDocument()
    expect(adminApi.getUserSessions).toHaveBeenCalledWith(7)

    await user.click(screen.getByRole('button', { name: /revoke/i }))
    await waitFor(() => expect(adminApi.revokeSession).toHaveBeenCalledWith('pub_abc'))
    expect(await screen.findByText(/no active sessions/i)).toBeInTheDocument()
  })

  describe('modal mutations', () => {
    const member = { id: 7, name: 'Member User', email: 'member@test.com', role: 'member' as const, approvedAt: '2026-01-01' }

    function apiError(status: number, error: string) {
      return Object.assign(new Error(`Request failed with status code ${status}`), {
        response: { status, data: { error } },
      })
    }

    /** A promise the test settles by hand, to hold a request pending. */
    function deferred<T>() {
      let resolve!: (value: T) => void
      const promise = new Promise<T>((r) => { resolve = r })
      return { promise, resolve }
    }

    async function openCreateDialog(user: ReturnType<typeof userEvent.setup>) {
      await user.click(await screen.findByRole('button', { name: /add user/i }))
      const dialog = await screen.findByRole('dialog')
      await user.type(within(dialog).getByLabelText('Name'), 'New Person')
      await user.type(within(dialog).getByLabelText('Email'), 'new@test.com')
      await user.type(within(dialog).getByLabelText('Password'), 'longenough')
      return dialog
    }

    beforeEach(() => {
      vi.mocked(adminApi.getUsers).mockResolvedValue({ users: [member] })
    })

    it('shows a failed create inside the create dialog', async () => {
      const user = userEvent.setup()
      vi.mocked(adminApi.createUser).mockRejectedValueOnce(apiError(409, 'Email already registered'))
      await render(<AdminUsers />)

      const dialog = await openCreateDialog(user)
      await user.click(within(dialog).getByRole('button', { name: 'Create' }))

      expect(await within(dialog).findByRole('alert')).toHaveTextContent('Email already registered')
    })

    it('shows a create validation error inside the create dialog', async () => {
      const user = userEvent.setup()
      await render(<AdminUsers />)

      await user.click(await screen.findByRole('button', { name: /add user/i }))
      const dialog = await screen.findByRole('dialog')
      await user.click(within(dialog).getByRole('button', { name: 'Create' }))

      expect(await within(dialog).findByRole('alert')).toHaveTextContent('All fields are required')
      expect(adminApi.createUser).not.toHaveBeenCalled()
    })

    it('shows a failed edit inside the edit dialog', async () => {
      const user = userEvent.setup()
      vi.mocked(adminApi.updateUser).mockRejectedValueOnce(apiError(409, 'Email already in use'))
      await render(<AdminUsers />)

      await user.click(await screen.findByRole('button', { name: /edit user/i }))
      const dialog = await screen.findByRole('dialog')
      await user.click(within(dialog).getByRole('button', { name: 'Save' }))

      expect(await within(dialog).findByRole('alert')).toHaveTextContent('Email already in use')
    })

    it('shows a failed delete inside the delete dialog', async () => {
      const user = userEvent.setup()
      vi.mocked(adminApi.deleteUser).mockRejectedValueOnce(apiError(400, 'Cannot delete the last admin'))
      await render(<AdminUsers />)

      await user.click(await screen.findByRole('button', { name: /delete user/i }))
      const dialog = await screen.findByRole('dialog')
      await user.click(within(dialog).getByRole('button', { name: 'Delete' }))

      expect(await within(dialog).findByRole('alert')).toHaveTextContent('Cannot delete the last admin')
    })

    it('shows a failed password reset inside the reset dialog', async () => {
      const user = userEvent.setup()
      vi.mocked(adminApi.resetPassword).mockRejectedValueOnce(apiError(500, 'Could not reset password'))
      await render(<AdminUsers />)

      await user.click(await screen.findByRole('button', { name: /reset password/i }))
      const dialog = await screen.findByRole('dialog')
      await user.type(within(dialog).getByLabelText('New Password'), 'longenough')
      await user.type(within(dialog).getByLabelText('Confirm Password'), 'longenough')
      await user.click(within(dialog).getByRole('button', { name: 'Reset Password' }))

      expect(await within(dialog).findByRole('alert')).toHaveTextContent('Could not reset password')
    })

    it('clears a dialog error when the dialog is reopened', async () => {
      const user = userEvent.setup()
      vi.mocked(adminApi.updateUser).mockRejectedValueOnce(apiError(409, 'Email already in use'))
      await render(<AdminUsers />)

      await user.click(await screen.findByRole('button', { name: /edit user/i }))
      let dialog = await screen.findByRole('dialog')
      await user.click(within(dialog).getByRole('button', { name: 'Save' }))
      await within(dialog).findByRole('alert')
      await user.click(within(dialog).getByRole('button', { name: 'Cancel' }))
      await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())

      await user.click(screen.getByRole('button', { name: /edit user/i }))
      dialog = await screen.findByRole('dialog')
      expect(within(dialog).queryByRole('alert')).not.toBeInTheDocument()
    })

    it('disables Create while the request is pending and sends one request on a double click', async () => {
      const user = userEvent.setup()
      const pending = deferred<{ user: typeof member }>()
      vi.mocked(adminApi.createUser).mockReturnValueOnce(pending.promise)
      await render(<AdminUsers />)

      const dialog = await openCreateDialog(user)
      const create = within(dialog).getByRole('button', { name: 'Create' })
      await user.dblClick(create)

      expect(create).toBeDisabled()
      expect(adminApi.createUser).toHaveBeenCalledTimes(1)
      pending.resolve({ user: { ...member, id: 8, name: 'New Person', email: 'new@test.com' } })
      await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
      expect(adminApi.createUser).toHaveBeenCalledTimes(1)
    })

    it('disables Save while the edit is pending and sends one request on a double click', async () => {
      const user = userEvent.setup()
      const pending = deferred<{ user: typeof member }>()
      vi.mocked(adminApi.updateUser).mockReturnValueOnce(pending.promise)
      await render(<AdminUsers />)

      await user.click(await screen.findByRole('button', { name: /edit user/i }))
      const dialog = await screen.findByRole('dialog')
      const save = within(dialog).getByRole('button', { name: 'Save' })
      await user.dblClick(save)

      expect(save).toBeDisabled()
      expect(adminApi.updateUser).toHaveBeenCalledTimes(1)
      pending.resolve({ user: member })
      await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
      expect(adminApi.updateUser).toHaveBeenCalledTimes(1)
    })

    it('disables Delete while the request is pending and sends one request on a double click', async () => {
      const user = userEvent.setup()
      const pending = deferred<{ message: string }>()
      vi.mocked(adminApi.deleteUser).mockReturnValueOnce(pending.promise)
      await render(<AdminUsers />)

      await user.click(await screen.findByRole('button', { name: /delete user/i }))
      const dialog = await screen.findByRole('dialog')
      const del = within(dialog).getByRole('button', { name: 'Delete' })
      await user.dblClick(del)

      expect(del).toBeDisabled()
      expect(adminApi.deleteUser).toHaveBeenCalledTimes(1)
      pending.resolve({ message: 'User deleted' })
      await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    })

    it('disables Reset Password while the request is pending and sends one request on a double click', async () => {
      const user = userEvent.setup()
      const pending = deferred<{ message: string }>()
      vi.mocked(adminApi.resetPassword).mockReturnValueOnce(pending.promise)
      await render(<AdminUsers />)

      await user.click(await screen.findByRole('button', { name: /reset password/i }))
      const dialog = await screen.findByRole('dialog')
      await user.type(within(dialog).getByLabelText('New Password'), 'longenough')
      await user.type(within(dialog).getByLabelText('Confirm Password'), 'longenough')
      const reset = within(dialog).getByRole('button', { name: 'Reset Password' })
      await user.dblClick(reset)

      expect(reset).toBeDisabled()
      expect(adminApi.resetPassword).toHaveBeenCalledTimes(1)
      pending.resolve({ message: 'Password reset' })
      await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    })
  })
})
