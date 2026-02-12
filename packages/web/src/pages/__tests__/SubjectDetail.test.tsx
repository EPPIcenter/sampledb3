import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '../../__tests__/helpers/render'
import SubjectDetail from '../SubjectDetail'

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom')
  return {
    ...actual,
    useParams: () => ({ id: '1' }),
    useSearchParams: () => [new URLSearchParams(), vi.fn()],
  }
})

vi.mock('../../lib/api', () => ({
  subjectsApi: {
    getSummary: vi.fn().mockResolvedValue({
      subject: { id: 1, name: 'Subject 1', studyId: 1, study: { id: 1, title: 'Study', shortCode: 'ST1' } },
      specimens: [],
      summary: {
        totalSpecimens: 0,
        totalContainers: 0,
        specimenTypes: [],
        collectionDateRange: null,
        timeline: [],
      },
    }),
  },
}))

vi.mock('../../contexts/UserContext', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../contexts/UserContext')>()
  return {
    ...actual,
    useUser: () => ({ canWrite: true }),
  }
})

describe('SubjectDetail', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('shows subject name after load', async () => {
    await render(<SubjectDetail />)
    await waitFor(() => {
      const matches = screen.getAllByText(/Subject 1/i)
      expect(matches.length).toBeGreaterThan(0)
    }, { timeout: 3000 })
  })
})
