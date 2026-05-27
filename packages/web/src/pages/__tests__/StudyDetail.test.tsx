import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '../../__tests__/helpers/render'
import { DateFilterProvider } from '../../contexts/DateFilterContext'
import StudyDetail from '../StudyDetail'

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom')
  return {
    ...actual,
    useParams: () => ({ id: '1' }),
    useSearchParams: () => [new URLSearchParams(), vi.fn()],
  }
})

vi.mock('../../lib/api/client', async () => {
  const { createMockedDomainModule } = await import('../../__tests__/helpers/mock-api')
  return createMockedDomainModule('client', { default: { get: vi.fn() } })
})

vi.mock('../../lib/api/studies', async () => {
  const { createMockedDomainModule } = await import('../../__tests__/helpers/mock-api')
  const { studyDetailPageMock } = await import('../../__tests__/helpers/mock-api-templates')
  return createMockedDomainModule('studies', studyDetailPageMock())
})

vi.mock('../../lib/api/subjects', async () => {
  const { createMockedDomainModule } = await import('../../__tests__/helpers/mock-api')
  const { studyDetailPageMock } = await import('../../__tests__/helpers/mock-api-templates')
  return createMockedDomainModule('subjects', studyDetailPageMock())
})

vi.mock('../../contexts/UserContext', async () => {
  const actual = await vi.importActual<typeof import('../../contexts/UserContext')>('../../contexts/UserContext')
  return {
    ...actual,
    useUser: () => ({
      user: { id: 1, name: 'Test', email: 'test@test.com', role: 'member' },
      loading: false,
      canWrite: true,
      isAdmin: false,
    }),
  }
})

import { api } from '../../lib/api/client'
import { studiesApi } from '../../lib/api/studies'

describe('StudyDetail page', () => {
  beforeEach(() => {
    vi.mocked(api.get).mockResolvedValue({
      data: { pagination: { total: 0 } },
      status: 200,
      statusText: 'OK',
      headers: {},
      config: { headers: {} } as import('axios').AxiosResponse['config'],
    })
    vi.mocked(studiesApi.get).mockResolvedValue({
      study: {
        id: 1,
        title: 'Test Study',
        shortCode: 'ST1',
        description: 'Description',
        isLongitudinal: false,
        leadPerson: 'Dr. Lead',
        created: '2024-01-01',
        lastUpdated: '2024-01-01',
      },
    })
    vi.mocked(studiesApi.getSummary).mockResolvedValue({
      study: {
        id: 1,
        title: 'Test Study',
        shortCode: 'ST1',
        description: 'Description',
        isLongitudinal: false,
        leadPerson: 'Dr. Lead',
        created: '2024-01-01',
        lastUpdated: '2024-01-01',
      },
      summary: {
        totalSubjects: 0,
        totalSpecimens: 0,
        totalContainers: 0,
        averageSpecimensPerSubject: 0,
        specimenTypes: [],
        containerTypes: {},
        collectionDateRange: null,
        studyDurationDays: null,
        collectionTimeline: [],
        enrollmentTimeline: [],
      },
    })
    vi.mocked(studiesApi.getTimeline).mockResolvedValue({
      subjects: [],
      specimenTypes: [],
      dateRange: null,
    })
    vi.mocked(studiesApi.getSubjects).mockResolvedValue({
      subjects: [],
      pagination: { page: 1, limit: 50, total: 0, totalPages: 0 },
    })
  })

  it('renders study header and key sections', async () => {
      await render(
        <DateFilterProvider>
          <StudyDetail />
        </DateFilterProvider>
      )
      await waitFor(
        () => {
          const heading = screen.getByRole('heading', { level: 1 })
          expect(heading).toHaveTextContent('Test Study')
          expect(screen.getByText('ST1')).toBeInTheDocument()
        },
        { timeout: 3000 }
      )
      expect(studiesApi.get).toHaveBeenCalled()
    }
  )
})
