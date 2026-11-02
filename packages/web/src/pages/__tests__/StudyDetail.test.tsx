import { describe, it, expect, vi, beforeEach } from 'vitest'
import userEvent from '@testing-library/user-event'
import { render, screen, waitFor, within } from '../../__tests__/helpers/render'
import { DateFilterProvider } from '../../contexts/DateFilterContext'
import StudyDetail from '../StudyDetail'

const routerState = vi.hoisted(() => ({ search: '' }))

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom')
  return {
    ...actual,
    useParams: () => ({ id: '1' }),
    useSearchParams: () => [new URLSearchParams(routerState.search), vi.fn()],
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
    routerState.search = ''
    vi.mocked(api.get).mockResolvedValue({ pagination: { total: 0 } })
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

  it('sorts Subjects by name naturally, lowest names first', async () => {
    // Names drawn from study 70: numeric names and alphanumeric ones.
    const names = ['140', '80', '116', '29PH', '10', '1', '100', '350', '2', '3CDX']
    vi.mocked(studiesApi.getSubjects).mockResolvedValue({
      subjects: names.map((name, i) => ({
        id: i + 1,
        studyId: 1,
        name,
        specimenCount: 1,
        created: '2024-01-01T00:00:00Z',
        lastUpdated: '2024-01-01T00:00:00Z',
      })),
    })
    routerState.search = 'tab=subjects'
    const user = userEvent.setup()
    await render(
      <DateFilterProvider>
        <StudyDetail />
      </DateFilterProvider>
    )

    const nameHeader = await screen.findByRole('columnheader', { name: 'Name' })
    await screen.findByRole('cell', { name: '3CDX' })
    await user.click(nameHeader)

    const shownNames = () =>
      screen
        .getAllByRole('row')
        .slice(1)
        .map((row) => within(row).getAllByRole('cell')[0].textContent)
    expect(shownNames()).toEqual(['1', '2', '3CDX', '10', '29PH', '80', '100', '116', '140', '350'])

    await user.click(nameHeader)
    expect(shownNames()[0]).toBe('350')
  })
})
