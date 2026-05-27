import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '../../__tests__/helpers/render'
import Specimens from '../Specimens'

vi.mock('../../contexts/UserContext', async () => {
  const actual = await vi.importActual<typeof import('../../contexts/UserContext')>('../../contexts/UserContext')
  return {
    ...actual,
    useUser: () => ({
      user: { id: 1, name: 'Test', email: 'test@test.com', role: 'member' },
      loading: false,
      canWrite: true,
    }),
  }
})

vi.mock('../../lib/api/client', async () => {
  const { createMockedDomainModule } = await import('../../__tests__/helpers/mock-api')
  const { specimensPageMock } = await import('../../__tests__/helpers/mock-api-templates')
  return createMockedDomainModule('client', specimensPageMock())
})

vi.mock('../../lib/api/reference-data', async () => {
  const { createMockedDomainModule } = await import('../../__tests__/helpers/mock-api')
  const { specimensPageMock } = await import('../../__tests__/helpers/mock-api-templates')
  return createMockedDomainModule('reference-data', specimensPageMock())
})

vi.mock('../../lib/api/studies', async () => {
  const { createMockedDomainModule } = await import('../../__tests__/helpers/mock-api')
  return createMockedDomainModule('studies', {
    studiesApi: { list: vi.fn().mockResolvedValue({ studies: [] }) },
  })
})

import { api } from '../../lib/api/client'

describe('Specimens page', () => {
  beforeEach(() => {
    vi.mocked(api.get).mockResolvedValue({
      data: { specimens: [] },
      status: 200,
      statusText: 'OK',
      headers: {},
      config: {} as import('axios').InternalAxiosRequestConfig,
    })
  })

  it('renders filters and table area', async () => {
    await render(<Specimens />)
    const specimensHeadings = await screen.findAllByText(/Specimens/i)
    expect(specimensHeadings.length).toBeGreaterThan(0)
  })

  it('shows specimen rows when API returns list', async () => {
    vi.mocked(api.get).mockResolvedValue({
      data: {
        specimens: [
          {
            id: 1,
            specimenTypeId: 1,
            created: '2024-01-01',
            specimenType: { id: 1, name: 'Whole Blood' },
            studySubject: { id: 1, name: 'SUBJ-001' },
            study: { id: 1, shortCode: 'ST1' },
          },
        ],
      },
      status: 200,
      statusText: 'OK',
      headers: {},
      config: {} as import('axios').InternalAxiosRequestConfig,
    })
    await render(<Specimens />)
    await screen.findByText(/Whole Blood/i)
    expect(screen.getAllByText(/Whole Blood/i).length).toBeGreaterThan(0)
  })
})
