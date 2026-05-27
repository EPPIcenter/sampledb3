import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '../../__tests__/helpers/render'
import ControlBatchDetail from '../ControlBatchDetail'

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom')
  return {
    ...actual,
    useParams: () => ({ id: '1' }),
  }
})

vi.mock('../../lib/api', async () => {
  const { createMockedApi } = await import('../../__tests__/helpers/mock-api')
  return createMockedApi({
  controlsApi: {
    getBatchSummary: vi.fn().mockResolvedValue({
      data: {
        batch: {
          id: 1,
          name: 'Batch 1',
          controlDefinitionId: 1,
          productionDate: '2024-01-01',
          definition: { id: 1, name: 'Control Def', controlType: 'blood' },
        },
        specimens: [],
        summary: {
          totalSpecimens: 0,
          totalContainers: 0,
          totalRemainingQuantity: 0,
          specimenTypes: [],
          collectionDateRange: null,
          timeline: [],
        },
      },
    }),
    deleteBatch: vi.fn().mockResolvedValue(undefined),
  },
})
})

vi.mock('../../contexts/UserContext', async () => {
  const actual = await vi.importActual<typeof import('../../contexts/UserContext')>('../../contexts/UserContext')
  return {
    ...actual,
    useUser: () => ({ canWrite: true }),
  }
})

describe('ControlBatchDetail', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('shows batch content after load', async () => {
    await render(<ControlBatchDetail />)
    await waitFor(() => {
      expect(screen.getByRole('heading', { name: /Batch 1|Control Def|blood/i })).toBeInTheDocument()
    }, { timeout: 3000 })
  })
})
