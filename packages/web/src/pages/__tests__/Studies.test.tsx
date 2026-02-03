import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '../../__tests__/helpers/render'

vi.mock('../../lib/api', () => ({
  studiesApi: {
    list: vi.fn().mockResolvedValue({
      studies: [],
      pagination: { page: 1, limit: 50, total: 0, totalPages: 0 },
    }),
  },
}))

vi.mock('../../contexts/UserContext', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../contexts/UserContext')>()
  return { ...actual, useUser: () => ({ canWrite: true }) }
})

function installIntersectionObserver() {
  class MockIntersectionObserver {
    observe = vi.fn()
    disconnect = vi.fn()
    unobserve = vi.fn()
    root = null
    rootMargin = ''
    thresholds: number[] = []
  }
  const C = MockIntersectionObserver as unknown as typeof IntersectionObserver
  if (typeof globalThis !== 'undefined') (globalThis as { IntersectionObserver: typeof C }).IntersectionObserver = C
  if (typeof window !== 'undefined') (window as { IntersectionObserver: typeof C }).IntersectionObserver = C
}

describe('Studies', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    installIntersectionObserver()
    Object.defineProperty(window, 'localStorage', {
      value: { getItem: vi.fn().mockReturnValue(null), setItem: vi.fn(), removeItem: vi.fn() },
      configurable: true,
    })
  })

  it('renders without crashing', async () => {
    const { default: Studies } = await import('../Studies')
    const { container } = render(<Studies />)
    expect(container).toBeInTheDocument()
  })

  it('shows studies page content', async () => {
    const { default: Studies } = await import('../Studies')
    render(<Studies />)
    const heading = screen.getByRole('heading', { name: /^studies$/i })
    expect(heading).toBeInTheDocument()
  })
})
