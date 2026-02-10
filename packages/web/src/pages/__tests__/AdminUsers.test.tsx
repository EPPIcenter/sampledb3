import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '../../__tests__/helpers/render'
import AdminUsers from '../AdminUsers'
import * as api from '../../lib/api'

vi.mock('../../lib/api', () => ({
  adminApi: {
    getUsers: vi.fn().mockResolvedValue({ data: { users: [] } }),
    createUser: vi.fn().mockResolvedValue(undefined),
    updateUser: vi.fn().mockResolvedValue(undefined),
    deleteUser: vi.fn().mockResolvedValue(undefined),
    restoreUser: vi.fn().mockResolvedValue(undefined),
    resetPassword: vi.fn().mockResolvedValue(undefined),
    getUserSessions: vi.fn().mockResolvedValue({ data: { sessions: [] } }),
  },
}))

describe('AdminUsers', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(api.adminApi.getUsers).mockResolvedValue({ data: { users: [] } } as never)
  })

  it('renders without crashing', async () => {
    const { container } = await render(<AdminUsers />)
    expect(container).toBeInTheDocument()
  })

  it('shows User Management heading', async () => {
    await render(<AdminUsers />)
    const heading = await screen.findByRole('heading', { name: /user management/i })
    expect(heading).toBeInTheDocument()
  })

  it('calls getUsers on mount', async () => {
    await render(<AdminUsers />)
    await waitFor(() => {
      expect(api.adminApi.getUsers).toHaveBeenCalled()
    })
  })

  it('shows user rows when getUsers returns users', async () => {
    vi.mocked(api.adminApi.getUsers).mockResolvedValue({
      data: {
        users: [
          { id: 1, name: 'Admin User', email: 'admin@test.com', role: 'admin', active: true, createdAt: '', updatedAt: '' },
        ],
      },
    } as never)
    await render(<AdminUsers />)
    await waitFor(() => {
      expect(screen.getByText('admin@test.com')).toBeInTheDocument()
      expect(screen.getByText('Admin User')).toBeInTheDocument()
    }, { timeout: 3000 })
  })
})
