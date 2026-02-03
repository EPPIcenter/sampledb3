import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '../../__tests__/helpers/render'

vi.mock('../../lib/api', () => ({
  authApi: {
    getCurrentUser: vi.fn().mockResolvedValue({
      data: { user: { id: 1, email: 'admin@test.com', name: 'Admin', role: 'admin' } },
    }),
  },
  locationsApi: { list: vi.fn().mockResolvedValue({ data: { locations: [] } }) },
  collectionsApi: {
    listAllCollections: vi.fn().mockResolvedValue({ data: { plates: [], boxes: [], bags: [] } }),
    moveCollections: vi.fn().mockResolvedValue({ data: { moved: 0 } }),
  },
}))

vi.mock('../../contexts/UserContext', async (importOriginal) => {
  const actual = await (importOriginal as () => Promise<typeof import('../../contexts/UserContext')>)()
  return { ...actual, useUser: () => ({ canWrite: true }) }
})

vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-router-dom')>()
  return { ...actual, useNavigate: () => vi.fn() }
})

describe('CollectionMove', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders without crashing', async () => {
    const { default: CollectionMove } = await import('../CollectionMove')
    const { container } = render(<CollectionMove />)
    expect(container).toBeInTheDocument()
  })

  it('shows collection move content', async () => {
    const { default: CollectionMove } = await import('../CollectionMove')
    render(<CollectionMove />)
    const heading = screen.getByRole('heading', { name: /move collections/i })
    expect(heading).toBeInTheDocument()
  })
})
