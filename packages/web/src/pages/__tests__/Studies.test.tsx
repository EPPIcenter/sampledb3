import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '../../__tests__/helpers/render'

vi.mock('../../lib/api', async () => {
  const { createMockedApi } = await import('../../__tests__/helpers/mock-api')
  const { studiesPageMock } = await import('../../__tests__/helpers/mock-api-templates')
  return createMockedApi(studiesPageMock())
})

vi.mock('../../contexts/UserContext', async () => {
  const actual = await vi.importActual<typeof import('../../contexts/UserContext')>('../../contexts/UserContext')
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

  it('shows studies page content', async () => {
    const { default: Studies } = await import('../Studies')
    await render(<Studies />)
    const heading = await screen.findByRole('heading', { name: /^studies$/i })
    expect(heading).toBeInTheDocument()
    await waitFor(() => {
      expect(screen.getByText('No studies found')).toBeInTheDocument()
    })
  })
})
