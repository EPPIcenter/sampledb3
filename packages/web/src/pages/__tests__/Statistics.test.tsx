import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '../../__tests__/helpers/render'
import Statistics from '../Statistics'

vi.mock('../../lib/api', () => ({
  statisticsApi: {
    get: vi.fn().mockResolvedValue({
      data: {
        specimens: {
          total: 0,
          byStudy: {},
          bySourceType: {},
          bySpecimenType: {},
          byContainerType: {},
          byStudySubject: {},
          collectionTimeline: [],
          creationTimeline: [],
        },
        containers: {
          total: 0,
          byType: {},
          byTags: {},
          byStatus: {},
          averagePerSpecimen: 0,
        },
        storage: {
          byLocation: [],
          byRootLocation: {},
        },
      },
    }),
  },
}))

vi.mock('../../contexts/UserContext', async () => {
  const actual = await vi.importActual<typeof import('../../contexts/UserContext')>('../../contexts/UserContext')
  return { ...actual, useUser: () => ({ canWrite: true }) }
})

describe('Statistics', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('shows Statistics heading or filter content', async () => {
    await render(<Statistics />)
    await waitFor(() => {
      expect(screen.getByRole('heading', { name: /statistics/i })).toBeInTheDocument()
    }, { timeout: 3000 })
  })

  it('renders without crashing with completely empty new-app data (minimal valid structure)', async () => {
    // Simulate API response from a freshly set up app with no specimens, containers, or locations
    const { statisticsApi } = await import('../../lib/api')
    vi.mocked(statisticsApi.get).mockResolvedValue({
      data: {
        specimens: {
          total: 0,
          bySourceType: {},
          bySpecimenType: {},
          byStudy: {},
          collectionTimeline: [],
          creationTimeline: [],
        },
        containers: {
          total: 0,
          byType: {},
          byTags: {},
          byStatus: {},
          averagePerSpecimen: 0,
        },
        storage: {
          byLocation: [],
          byRootLocation: {},
        },
      },
    } as unknown as Awaited<ReturnType<typeof statisticsApi.get>>)
    const { container } = await render(<Statistics />)
    await waitFor(() => {
      expect(screen.getByRole('heading', { name: /statistics/i })).toBeInTheDocument()
    })
    expect(container).toBeInTheDocument()
    // Should show zero values without crashing (multiple stat cards show "0")
    expect(screen.getAllByText('0').length).toBeGreaterThan(0)
  })

  // We do not defend against malformed API responses: the server is under our control
  // and must return the full StatisticsData shape; malformed data indicates a server bug and we fail loudly.
})
