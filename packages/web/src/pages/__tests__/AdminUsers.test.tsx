import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '../../__tests__/helpers/render'
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
})
