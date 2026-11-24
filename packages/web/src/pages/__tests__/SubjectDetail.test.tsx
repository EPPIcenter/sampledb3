import { describe, it, expect, vi, beforeEach } from 'vitest'
import userEvent from '@testing-library/user-event'
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

vi.mock('../../lib/api/subjects', async () => {
  const { createMockedDomainModule } = await import('../../__tests__/helpers/mock-api')
  const { subjectDetailPageMock } = await import('../../__tests__/helpers/mock-api-templates')
  return createMockedDomainModule('subjects', subjectDetailPageMock())
})

vi.mock('../../lib/api/settings', async () => {
  const { createMockedDomainModule } = await import('../../__tests__/helpers/mock-api')
  const { specimenFormMock } = await import('../../__tests__/helpers/mock-api-templates')
  const { settingsApi } = specimenFormMock()
  return createMockedDomainModule('settings', { settingsApi })
})

vi.mock('../../lib/api/reference-data', async () => {
  const { createMockedDomainModule } = await import('../../__tests__/helpers/mock-api')
  const { specimenFormMock } = await import('../../__tests__/helpers/mock-api-templates')
  const { specimenTypesApi, cellLinesApi, plasmidsApi, standardsApi, unitsApi } = specimenFormMock()
  return createMockedDomainModule('reference-data', { specimenTypesApi, cellLinesApi, plasmidsApi, standardsApi, unitsApi })
})

vi.mock('../../lib/api/collections', async () => {
  const { createMockedDomainModule } = await import('../../__tests__/helpers/mock-api')
  const { specimenFormMock } = await import('../../__tests__/helpers/mock-api-templates')
  const { collectionsApi } = specimenFormMock()
  return createMockedDomainModule('collections', { collectionsApi })
})

vi.mock('../../lib/api/studies', async () => {
  const { createMockedDomainModule } = await import('../../__tests__/helpers/mock-api')
  const { specimenFormMock } = await import('../../__tests__/helpers/mock-api-templates')
  const { studiesApi } = specimenFormMock()
  return createMockedDomainModule('studies', { studiesApi })
})

vi.mock('../../lib/api/controls', async () => {
  const { createMockedDomainModule } = await import('../../__tests__/helpers/mock-api')
  const { specimenFormMock } = await import('../../__tests__/helpers/mock-api-templates')
  const { controlsApi } = specimenFormMock()
  return createMockedDomainModule('controls', { controlsApi })
})

vi.mock('../../lib/api/reagents', async () => {
  const { createMockedDomainModule } = await import('../../__tests__/helpers/mock-api')
  const { specimenFormMock } = await import('../../__tests__/helpers/mock-api-templates')
  const { reagentsApi } = specimenFormMock()
  return createMockedDomainModule('reagents', { reagentsApi })
})

vi.mock('../../contexts/UserContext', async () => {
  const actual = await vi.importActual<typeof import('../../contexts/UserContext')>('../../contexts/UserContext')
  return {
    ...actual,
    useUser: () => ({ canWrite: true }),
  }
})

import { subjectsApi } from '../../lib/api/subjects'

describe('SubjectDetail', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('shows subject name after load', async () => {
    await render(<SubjectDetail />)
    await waitFor(() => {
      expect(screen.getAllByText(/Subject 1/i).length).toBeGreaterThan(0)
    }, { timeout: 3000 })
  })

  it('shows Add Specimen when user can write', async () => {
    await render(<SubjectDetail />)
    await waitFor(() => {
      expect(screen.getAllByRole('button', { name: /add specimen/i }).length).toBeGreaterThan(0)
    }, { timeout: 3000 })
  })

  it('opens Add Specimen modal when clicked', async () => {
    const user = userEvent.setup()
    await render(<SubjectDetail />)
    await waitFor(() => {
      expect(screen.getAllByRole('button', { name: /add specimen/i }).length).toBeGreaterThan(0)
    }, { timeout: 3000 })
    await user.click(screen.getAllByRole('button', { name: /add specimen/i })[0]!)
    await waitFor(() => {
      expect(screen.getByRole('dialog', { name: /add specimen/i })).toBeInTheDocument()
    })
  })

  it('shows page error when summary fails to load', async () => {
    vi.mocked(subjectsApi.getSummary).mockRejectedValue({
      response: { data: { error: 'Server unavailable' } },
    })
    await render(<SubjectDetail />)
    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent('Server unavailable')
    })
    expect(screen.getByRole('button', { name: /try again/i })).toBeInTheDocument()
  })
})
