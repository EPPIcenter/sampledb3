import { describe, it, expect, vi, beforeEach } from 'vitest'
import userEvent from '@testing-library/user-event'
import { render, screen, within } from '../../__tests__/helpers/render'
import Dashboard from '../Dashboard'
import { studiesApi } from '../../lib/api/studies'
import { specimensApi } from '../../lib/api/specimens'
import { subjectsApi } from '../../lib/api/subjects'
import { containersApi } from '../../lib/api/containers'
import { locationsApi } from '../../lib/api/locations'

vi.mock('../../lib/api/studies', async () => {
  const { createMockedDomainModule } = await import('../../__tests__/helpers/mock-api')
  const { dashboardPageMock } = await import('../../__tests__/helpers/mock-api-templates')
  return createMockedDomainModule('studies', dashboardPageMock())
})

vi.mock('../../lib/api/specimens', async () => {
  const { createMockedDomainModule } = await import('../../__tests__/helpers/mock-api')
  return createMockedDomainModule('specimens', { specimensApi: { search: vi.fn() } })
})

vi.mock('../../lib/api/subjects', async () => {
  const { createMockedDomainModule } = await import('../../__tests__/helpers/mock-api')
  return createMockedDomainModule('subjects', { subjectsApi: { list: vi.fn() } })
})

vi.mock('../../lib/api/containers', async () => {
  const { createMockedDomainModule } = await import('../../__tests__/helpers/mock-api')
  return createMockedDomainModule('containers', { containersApi: { list: vi.fn() } })
})

vi.mock('../../lib/api/locations', async () => {
  const { createMockedDomainModule } = await import('../../__tests__/helpers/mock-api')
  return createMockedDomainModule('locations', { locationsApi: { list: vi.fn() } })
})

vi.mock('../../lib/api/search', async () => {
  const { createMockedDomainModule } = await import('../../__tests__/helpers/mock-api')
  const { dashboardPageMock } = await import('../../__tests__/helpers/mock-api-templates')
  return createMockedDomainModule('search', dashboardPageMock())
})

vi.mock('../../lib/api/statistics', async () => {
  const { createMockedDomainModule } = await import('../../__tests__/helpers/mock-api')
  const { dashboardPageMock } = await import('../../__tests__/helpers/mock-api-templates')
  return createMockedDomainModule('statistics', dashboardPageMock())
})

vi.mock('../../lib/api/controls', async () => {
  const { createMockedDomainModule } = await import('../../__tests__/helpers/mock-api')
  const { dashboardPageMock } = await import('../../__tests__/helpers/mock-api-templates')
  return createMockedDomainModule('controls', dashboardPageMock())
})

vi.mock('../../lib/api/qpcr', async () => {
  const { createMockedDomainModule } = await import('../../__tests__/helpers/mock-api')
  const { dashboardPageMock } = await import('../../__tests__/helpers/mock-api-templates')
  return createMockedDomainModule('qpcr', dashboardPageMock())
})

vi.mock('../../contexts/UserContext', async () => {
  const actual = await vi.importActual<typeof import('../../contexts/UserContext')>('../../contexts/UserContext')
  return { ...actual, useUser: () => ({ canWrite: true }) }
})

type CountParams = { limit?: number; created_from?: string; created_to?: string }

/** A list body whose total depends on which window the request asks for. */
function totals(all: number, current: number, previous: number) {
  return (params?: CountParams) => {
    const total = params?.created_to ? previous : params?.created_from ? current : all
    return { pagination: { total, page: 1, limit: 1, totalPages: total } }
  }
}

function tile(title: string) {
  return screen.getByRole('heading', { level: 2, name: title }).closest('.dashboard-card') as HTMLElement
}

describe('Dashboard', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    const studies = totals(118, 3, 4)
    const specimens = totals(118069, 15, 10)
    const subjects = totals(63520, 0, 0)
    vi.mocked(studiesApi.list).mockImplementation(
      async (_search, params) => ({ studies: [], ...studies(params) }) as never,
    )
    vi.mocked(specimensApi.search).mockImplementation(
      async (params) => ({ specimens: [], ...specimens(params) }) as never,
    )
    vi.mocked(subjectsApi.list).mockImplementation(
      async (params) => ({ subjects: [], ...subjects(params) }) as never,
    )
    vi.mocked(containersApi.list).mockResolvedValue({
      containers: [],
      pagination: { total: 120500, page: 1, limit: 1, totalPages: 120500 },
    } as never)
    vi.mocked(locationsApi.list).mockResolvedValue({
      locations: [],
      pagination: { total: 42, page: 1, limit: 1, totalPages: 42 },
    } as never)
  })

  it('shows each count in full on its tile', async () => {
    await render(<Dashboard />)
    expect(await within(await findTile('Specimens')).findByText('118,069')).toBeInTheDocument()
    expect(within(tile('Containers')).getByText('120,500')).toBeInTheDocument()
    expect(within(tile('Subjects')).getByText('63,520')).toBeInTheDocument()
    expect(within(tile('Studies')).getByText('118')).toBeInTheDocument()
    expect(within(tile('Locations')).getByText('42')).toBeInTheDocument()
  })

  it('compares the last 30 days with the 30 days before on each trend', async () => {
    await render(<Dashboard />)
    // Specimens: 15 created in the last 30 days, 10 in the 30 before.
    expect(await within(await findTile('Specimens')).findByText('+50%')).toBeInTheDocument()
    // Studies: 3 against 4.
    expect(await within(tile('Studies')).findByText('-25%')).toBeInTheDocument()
    // Subjects: nothing created in either window, so no percentage at all.
    expect(within(tile('Subjects')).queryByText(/%/)).not.toBeInTheDocument()

    const specimenWindows = vi.mocked(specimensApi.search).mock.calls.map(([p]) => p)
    expect(specimenWindows).toContainEqual(expect.objectContaining({ created_from: expect.any(String) }))
    expect(specimenWindows).toContainEqual(
      expect.objectContaining({ created_from: expect.any(String), created_to: expect.any(String) }),
    )
    const subjectWindows = vi.mocked(subjectsApi.list).mock.calls.map(([p]) => p)
    expect(subjectWindows).toContainEqual(
      expect.objectContaining({ created_from: expect.any(String), created_to: expect.any(String) }),
    )
  })

  it('shows an error on a tile whose count fails, not 0, and retries it', async () => {
    const user = userEvent.setup()
    vi.mocked(subjectsApi.list).mockRejectedValue(new Error('Subjects service unavailable'))

    await render(<Dashboard />)

    const subjects = await findTile('Subjects')
    expect(await within(subjects).findByRole('alert')).toHaveTextContent('Subjects service unavailable')
    expect(within(subjects).queryByText('0')).not.toBeInTheDocument()
    // The other tiles still show their counts.
    expect(await within(tile('Specimens')).findByText('118,069')).toBeInTheDocument()

    vi.mocked(subjectsApi.list).mockResolvedValue({
      subjects: [],
      pagination: { total: 7, page: 1, limit: 1, totalPages: 7 },
    } as never)
    await user.click(within(subjects).getByRole('button', { name: 'Retry loading Subjects' }))
    expect(await within(tile('Subjects')).findByText('7')).toBeInTheDocument()
  })
})

async function findTile(title: string) {
  await screen.findByRole('heading', { level: 2, name: title })
  return tile(title)
}
