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
