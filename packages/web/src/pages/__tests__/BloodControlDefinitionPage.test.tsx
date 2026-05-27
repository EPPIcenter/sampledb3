import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '../../__tests__/helpers/render'
import BloodControlDefinitionPage from '../BloodControlDefinitionPage'

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom')
  return {
    ...actual,
    useParams: () => ({ id: undefined }),
  }
})

vi.mock('../../contexts/UserContext', async () => {
  const actual = await vi.importActual<typeof import('../../contexts/UserContext')>('../../contexts/UserContext')
  return {
    ...actual,
    useUser: () => ({ canWrite: true }),
  }
})

vi.mock('../../lib/api/controls', async () => {
  const { createMockedDomainModule } = await import('../../__tests__/helpers/mock-api')
  return createMockedDomainModule('controls', {
    controlsApi: {
      create: vi.fn(),
      createDefinitionsBulk: vi.fn(),
      update: vi.fn().mockResolvedValue({}),
      suggestName: vi.fn().mockResolvedValue({ suggestedName: 'Suggested', exists: false }),
    },
  })
})

vi.mock('../../lib/api/reference-data', async () => {
  const { createMockedDomainModule } = await import('../../__tests__/helpers/mock-api')
  return createMockedDomainModule('reference-data', {
    strainsApi: { list: vi.fn().mockResolvedValue({ data: [] }) },
    unitsApi: { listAll: vi.fn().mockResolvedValue([]) },
  })
})

describe('BloodControlDefinitionPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders new definition form', async () => {
    await render(<BloodControlDefinitionPage />)
    expect(screen.getAllByRole('heading', { name: /new blood control definition/i }).length).toBeGreaterThan(0)
  })
})
