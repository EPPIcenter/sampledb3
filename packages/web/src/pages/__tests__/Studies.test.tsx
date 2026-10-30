import { describe, it, expect, vi, beforeEach } from 'vitest'
import { useNavigate } from 'react-router-dom'
import userEvent from '@testing-library/user-event'
import { render, screen, waitFor } from '../../__tests__/helpers/render'

vi.mock('../../lib/api/studies', async () => {
  const { createMockedDomainModule } = await import('../../__tests__/helpers/mock-api')
  const { studiesPageMock } = await import('../../__tests__/helpers/mock-api-templates')
  return createMockedDomainModule('studies', studiesPageMock())
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

function BackButton() {
  const navigate = useNavigate()
  return <button onClick={() => void navigate(-1)}>Back</button>
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

  it('reads search and filters from the URL and clears them', async () => {
    const user = userEvent.setup()
    const { default: Studies } = await import('../Studies')
    await render(<Studies />, { initialEntries: ['/studies?q=malaria&type=longitudinal'] })

    const searchBox = await screen.findByPlaceholderText(/Search by title/)
    expect(searchBox).toHaveValue('malaria')
    expect(screen.getByDisplayValue(/longitudinal/i)).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /clear filters/i }))

    await waitFor(() => expect(searchBox).toHaveValue(''))
  })

  it('undoes a filter change with Back', async () => {
    const user = userEvent.setup()
    const { default: Studies } = await import('../Studies')
    await render(
      <>
        <Studies />
        <BackButton />
      </>,
      { initialEntries: ['/studies'] },
    )
    const typeFilter = await screen.findByDisplayValue(/all types/i)

    await user.selectOptions(typeFilter, 'longitudinal')
    await waitFor(() => expect(typeFilter).toHaveValue('longitudinal'))

    await user.click(screen.getByRole('button', { name: 'Back' }))
    await waitFor(() => expect(typeFilter).toHaveValue('all'))
  })
})
