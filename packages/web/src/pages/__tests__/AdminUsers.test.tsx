import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '../../__tests__/helpers/render'
import AdminUsers from '../AdminUsers'
import { adminApi } from '../../lib/api/admin'

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
})
