import { describe, it, expect, vi, beforeEach } from 'vitest'
import userEvent from '@testing-library/user-event'
import { render, screen, waitFor } from '../../__tests__/helpers/render'
import SpecimenDetail from '../SpecimenDetail'

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom')
  return {
    ...actual,
    useParams: () => ({ id: '1' }),
  }
})

const mockAddContainer = vi.fn()

vi.mock('../../lib/api/client', async () => {
  const { createMockedDomainModule } = await import('../../__tests__/helpers/mock-api')
  const { specimenDetailPageMock } = await import('../../__tests__/helpers/mock-api-templates')
  return createMockedDomainModule('client', specimenDetailPageMock((...args: unknown[]) => mockAddContainer(...args)))
})

vi.mock('../../lib/api/specimens', async () => {
  const { createMockedDomainModule } = await import('../../__tests__/helpers/mock-api')
  const { specimenDetailPageMock } = await import('../../__tests__/helpers/mock-api-templates')
  return createMockedDomainModule('specimens', specimenDetailPageMock((...args: unknown[]) => mockAddContainer(...args)))
})

vi.mock('../../lib/api/reference-data', async () => {
  const { createMockedDomainModule } = await import('../../__tests__/helpers/mock-api')
  const { specimenDetailPageMock } = await import('../../__tests__/helpers/mock-api-templates')
  return createMockedDomainModule('reference-data', specimenDetailPageMock((...args: unknown[]) => mockAddContainer(...args)))
})

vi.mock('../../lib/api/settings', async () => {
  const { createMockedDomainModule } = await import('../../__tests__/helpers/mock-api')
  const { specimenDetailPageMock } = await import('../../__tests__/helpers/mock-api-templates')
  return createMockedDomainModule('settings', specimenDetailPageMock((...args: unknown[]) => mockAddContainer(...args)))
})

vi.mock('../../lib/api/collections', async () => {
  const { createMockedDomainModule } = await import('../../__tests__/helpers/mock-api')
  const { specimenDetailPageMock } = await import('../../__tests__/helpers/mock-api-templates')
  return createMockedDomainModule('collections', specimenDetailPageMock((...args: unknown[]) => mockAddContainer(...args)))
})

vi.mock('../../contexts/UserContext', async () => {
  const actual = await vi.importActual<typeof import('../../contexts/UserContext')>('../../contexts/UserContext')
  return { ...actual, useUser: () => ({ canWrite: true }) }
})

import { api } from '../../lib/api/client'

describe('SpecimenDetail', () => {
  beforeEach(() => {
    vi.mocked(api.get).mockResolvedValue({
      subject: { id: 1, name: 'S1', studyId: 1 },
      study: { title: 'Study', code: 'ST1' },
    })
    mockAddContainer.mockResolvedValue({ containerId: 101 })
  })

  it('shows specimen content after load', async () => {
    await render(<SpecimenDetail />)
    await waitFor(() => {
      const matches = screen.getAllByText(/Containers|No containers found/i)
      expect(matches.length).toBeGreaterThan(0)
    }, { timeout: 3000 })
  })

  it('shows Add container button when user can write', async () => {
    await render(<SpecimenDetail />)
    await waitFor(() => {
      expect(screen.getByText(/No containers found/i)).toBeInTheDocument()
    }, { timeout: 3000 })
    expect(screen.getByRole('button', { name: /add container/i })).toBeInTheDocument()
  })

  it('opens Add container modal when Add container is clicked', async () => {
    const user = userEvent.setup()
    await render(<SpecimenDetail />)
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /add container/i })).toBeInTheDocument()
    }, { timeout: 3000 })
    await user.click(screen.getByRole('button', { name: /add container/i }))
    await waitFor(() => {
      expect(screen.getByRole('dialog', { name: /add container/i })).toBeInTheDocument()
    })
  })
})
