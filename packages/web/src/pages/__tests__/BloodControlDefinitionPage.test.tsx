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

vi.mock('../../lib/api', async () => {
  const { createMockedApi } = await import('../../__tests__/helpers/mock-api')
  return createMockedApi({
  controlsApi: { listDefinitions: vi.fn().mockResolvedValue({ data: { definitions: [] } }) },
  specimenTypesApi: { list: vi.fn().mockResolvedValue({ data: [] }) },
  strainsApi: { list: vi.fn().mockResolvedValue({ data: [] }) },
  settingsApi: { getUnits: vi.fn().mockResolvedValue({ data: [] }) },
})
})

describe('BloodControlDefinitionPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('shows New Blood Control Definition heading when id is undefined', async () => {
    await render(<BloodControlDefinitionPage />)
    const headings = screen.getAllByRole('heading', { name: /new blood control definition/i })
    expect(headings.length).toBeGreaterThan(0)
  })
})
