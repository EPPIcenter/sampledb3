import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '../../__tests__/helpers/render'

vi.mock('../../lib/api', () => ({
  authApi: {
    getCurrentUser: vi.fn().mockResolvedValue({
      data: { user: { id: 1, email: 'admin@test.com', name: 'Admin', role: 'admin' } },
    }),
  },
  studiesApi: {
    list: vi.fn().mockResolvedValue({ studies: [], pagination: { total: 0, totalPages: 0 } }),
  },
}))

vi.mock('../../contexts/UserContext', async (importOriginal) => {
  const actual = await (importOriginal as () => Promise<typeof import('../../contexts/UserContext')>)()
  return { ...actual, useUser: () => ({ canWrite: true }) }
})

vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-router-dom')>()
  return { ...actual, Navigate: () => null }
})

describe('StudyNew', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders without crashing', async () => {
    const { default: StudyNew } = await import('../StudyNew')
    const { container } = render(<StudyNew />)
    expect(container).toBeInTheDocument()
  })

  it('shows Create Study heading when user can write', async () => {
    const { default: StudyNew } = await import('../StudyNew')
    render(<StudyNew />)
    const heading = screen.getByRole('heading', { name: /create study/i })
    expect(heading).toBeInTheDocument()
  })
})
