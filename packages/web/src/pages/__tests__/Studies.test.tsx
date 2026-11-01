import { describe, it, expect, vi, beforeEach } from 'vitest'
import { useNavigate } from 'react-router-dom'
import userEvent from '@testing-library/user-event'
import { QueryClient } from '@tanstack/react-query'
import { render, screen, waitFor } from '../../__tests__/helpers/render'
import { studiesApi, type Study, type StudySummaryBasic } from '../../lib/api/studies'

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

  describe('sorting', () => {
    function study(id: number, title: string, leadPerson: string, lastUpdated: string): Study {
      return {
        id,
        title,
        shortCode: `S${id}`,
        isLongitudinal: false,
        leadPerson,
        created: '2020-01-01T00:00:00Z',
        lastUpdated,
      }
    }

    const studies: Study[] = [
      study(1, 'gamma 10', 'Ng', '2024-02-01T00:00:00Z'),
      study(2, 'Alpha', 'zhou', '2023-05-01T00:00:00Z'),
      study(3, 'Gamma 2', 'Adeyemi', '2025-01-01T00:00:00Z'),
      study(4, 'beta', 'Kim', '2022-09-01T00:00:00Z'),
    ]

    function summary(studyId: number, totalSubjects: number): StudySummaryBasic {
      return { studyId, totalSubjects, totalSpecimens: 0, totalContainers: 0, collectionDateRange: null }
    }

    function listOnePage(list: Study[]) {
      vi.mocked(studiesApi.list).mockResolvedValue({
        studies: list,
        pagination: { page: 1, limit: 1000, total: list.length, totalPages: 1 },
      })
    }

    async function shownTitles(): Promise<string[]> {
      await screen.findAllByRole('heading', { level: 3 })
      return screen.getAllByRole('heading', { level: 3 }).map((h) => h.textContent)
    }

    it('sorts Title ascending A to Z and descending Z to A', async () => {
      listOnePage(studies)
      const user = userEvent.setup()
      const { default: Studies } = await import('../Studies')
      await render(<Studies />, { initialEntries: ['/studies?sort=title'] })

      await waitFor(async () => expect(await shownTitles()).toEqual(['Alpha', 'beta', 'Gamma 2', 'gamma 10']))

      await user.click(screen.getByRole('button', { name: 'Ascending' }))
      await waitFor(async () => expect(await shownTitles()).toEqual(['gamma 10', 'Gamma 2', 'beta', 'Alpha']))
      expect(screen.getByRole('button', { name: 'Descending' })).toBeInTheDocument()
    })

    it('sorts Lead ascending A to Z and descending Z to A', async () => {
      listOnePage(studies)
      const { default: Studies } = await import('../Studies')
      await render(<Studies />, { initialEntries: ['/studies?sort=lead'] })
      // Leads: Adeyemi (Gamma 2), Kim (beta), Ng (gamma 10), zhou (Alpha)
      await waitFor(async () => expect(await shownTitles()).toEqual(['Gamma 2', 'beta', 'gamma 10', 'Alpha']))
    })

    it('sorts Lead descending Z to A', async () => {
      listOnePage(studies)
      const { default: Studies } = await import('../Studies')
      await render(<Studies />, { initialEntries: ['/studies?sort=lead&dir=desc'] })
      await waitFor(async () => expect(await shownTitles()).toEqual(['Alpha', 'gamma 10', 'beta', 'Gamma 2']))
    })

    it('keeps date sort newest first by default and oldest first ascending', async () => {
      listOnePage(studies)
      const user = userEvent.setup()
      const { default: Studies } = await import('../Studies')
      await render(<Studies />, { initialEntries: ['/studies'] })

      await waitFor(async () => expect(await shownTitles()).toEqual(['Gamma 2', 'gamma 10', 'Alpha', 'beta']))

      await user.click(screen.getByRole('button', { name: 'Descending' }))
      await waitFor(async () => expect(await shownTitles()).toEqual(['beta', 'Alpha', 'gamma 10', 'Gamma 2']))
    })

    it('sorts by a count over every study, largest first by default', async () => {
      listOnePage(studies)
      vi.mocked(studiesApi.getSummaries).mockResolvedValue({
        summaries: [summary(1, 5), summary(2, 300), summary(3, 40), summary(4, 0)],
      })
      // Summary cards live in the query cache without observers, so keep them past render.
      const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
      const { default: Studies } = await import('../Studies')
      await render(<Studies />, { initialEntries: ['/studies?sort=subjects'], queryClient })

      // Summaries load for every study, not only the cards in view.
      await waitFor(() => expect(studiesApi.getSummaries).toHaveBeenCalledWith(expect.arrayContaining([1, 2, 3, 4])))
      await waitFor(async () => expect(await shownTitles()).toEqual(['Alpha', 'Gamma 2', 'gamma 10', 'beta']))
    })

    it('sorts the whole list, including studies past the first page', async () => {
      vi.mocked(studiesApi.list).mockImplementation((_search, params) =>
        Promise.resolve(
          params?.page === 2
            ? { studies: [studies[1]], pagination: { page: 2, limit: 3, total: 4, totalPages: 2 } }
            : {
                studies: [studies[0], studies[2], studies[3]],
                pagination: { page: 1, limit: 3, total: 4, totalPages: 2 },
              }
        )
      )
      const { default: Studies } = await import('../Studies')
      await render(<Studies />, { initialEntries: ['/studies?sort=title'] })

      await waitFor(async () => expect(await shownTitles()).toEqual(['Alpha', 'beta', 'Gamma 2', 'gamma 10']))
      expect(studiesApi.list).toHaveBeenCalledWith(undefined, expect.objectContaining({ page: 2 }))
      expect(screen.getByText('4 studies total')).toBeInTheDocument()
    })
  })
})
