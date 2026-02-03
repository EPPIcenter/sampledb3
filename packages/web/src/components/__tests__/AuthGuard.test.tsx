import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '../../__tests__/helpers/render'
import AuthGuard from '../AuthGuard'

const mockNavigate = vi.fn()
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom')
  return {
    ...actual,
    useNavigate: () => mockNavigate,
    useLocation: () => ({ pathname: '/dashboard', state: null }),
  }
})

const mockUseUser = vi.fn()
vi.mock('../../contexts/UserContext', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../contexts/UserContext')>()
  return { ...actual, useUser: () => mockUseUser() }
})

describe('AuthGuard', () => {
  beforeEach(() => {
    mockNavigate.mockClear()
  })

  it('renders children when user is present', () => {
    mockUseUser.mockReturnValue({
      user: { id: 1, name: 'Test', email: 'test@test.com', role: 'member' },
      loading: false,
    })
    render(
      <AuthGuard>
        <span>Protected content</span>
      </AuthGuard>
    )
    expect(screen.getByText('Protected content')).toBeInTheDocument()
  })

  it('shows loading state when loading is true', () => {
    mockUseUser.mockReturnValue({ user: null, loading: true })
    render(
      <AuthGuard>
        <span>Protected content</span>
      </AuthGuard>
    )
    expect(screen.getByText('Loading...')).toBeInTheDocument()
    expect(screen.queryByText('Protected content')).not.toBeInTheDocument()
  })

  it('renders nothing when user is null and not loading', () => {
    mockUseUser.mockReturnValue({ user: null, loading: false })
    const { container } = render(
      <AuthGuard>
        <span>Protected content</span>
      </AuthGuard>
    )
    expect(screen.queryByText('Protected content')).not.toBeInTheDocument()
    expect(container.firstChild).toBeNull()
  })
})
