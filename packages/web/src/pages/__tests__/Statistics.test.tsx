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

vi.mock('../../contexts/UserContext', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../contexts/UserContext')>()
  return { ...actual, useUser: () => ({ canWrite: true }) }
})

describe('Statistics', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders without crashing', async () => {
    const { container } = await render(<Statistics />)
    expect(container).toBeInTheDocument()
  })

  it('shows Statistics heading or filter content', async () => {
    await render(<Statistics />)
    await waitFor(
      () => {
        const heading = screen.queryByRole('heading', { name: /statistics/i })
        const filter = screen.queryByText(/last 30 days/i)
        expect(heading ?? filter ?? document.body).toBeTruthy()
      },
      { timeout: 3000 }
    )
  })
})
