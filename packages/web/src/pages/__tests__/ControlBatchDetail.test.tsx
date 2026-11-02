import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '../../__tests__/helpers/render'
import userEvent from '@testing-library/user-event'
import ControlBatchDetail from '../ControlBatchDetail'
import { controlsApi } from '../../lib/api/controls'
import { collectionKeys } from '../../hooks/useCollections'
import { controlKeys } from '../../hooks/useControls'
import { specimenKeys } from '../../hooks/useSpecimens'
import { dashboardKeys } from '../../hooks/useDashboard'
import {
  createInvalidationTestClient,
  keysNotInvalidated,
  seedQueries,
} from '../../__tests__/helpers/query-invalidation'

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom')
  return {
    ...actual,
    useParams: () => ({ id: '1' }),
  }
})

vi.mock('../../lib/api/controls', async () => {
  const { createMockedDomainModule } = await import('../../__tests__/helpers/mock-api')
  return createMockedDomainModule('controls', {
  controlsApi: {
    getBatchSummary: vi.fn().mockResolvedValue({
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
    }),
    deleteBatch: vi.fn().mockResolvedValue(undefined),
    deleteSpecimenFromBatch: vi.fn().mockResolvedValue({ message: 'Deleted' }),
  }
  })
})

const userState = vi.hoisted(() => ({ isAdmin: false }))

vi.mock('../../contexts/UserContext', async () => {
  const actual = await vi.importActual<typeof import('../../contexts/UserContext')>('../../contexts/UserContext')
  return {
    ...actual,
    useUser: () => ({ canWrite: true, isAdmin: userState.isAdmin }),
  }
})

describe('ControlBatchDetail', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    userState.isAdmin = false
  })

  it('shows batch content after load', async () => {
    await render(<ControlBatchDetail />)
    await waitFor(() => {
      expect(screen.getByRole('heading', { name: /Batch 1|Control Def|blood/i })).toBeInTheDocument()
    }, { timeout: 3000 })
  })

  it('shows Delete Batch to an admin', async () => {
    userState.isAdmin = true
    await render(<ControlBatchDetail />)
    expect(await screen.findByRole('button', { name: /Delete Batch/i })).toBeInTheDocument()
  })

  it('hides Delete Batch from a member who can still edit the batch', async () => {
    await render(<ControlBatchDetail />)
    expect(await screen.findByRole('button', { name: /^Edit$/ })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Delete Batch/i })).not.toBeInTheDocument()
  })

  it('refreshes the Collection grids, Specimen lists and dashboard after deleting a Specimen from the batch', async () => {
    const user = userEvent.setup()
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    const loaded = await controlsApi.getBatchSummary(1)
    vi.mocked(controlsApi.getBatchSummary).mockResolvedValueOnce({
      ...loaded,
      specimens: [{ id: 30, specimenTypeName: 'Whole blood', collectionDate: '2024-01-02' }],
    } as never)
    const queryClient = createInvalidationTestClient()
    const otherPages = [
      collectionKeys.micronixPlate(4),
      controlKeys.overview(),
      specimenKeys.list({}),
      dashboardKeys.count('specimens'),
    ]
    seedQueries(queryClient, otherPages)
    await render(<ControlBatchDetail />, { queryClient })

    await user.click(await screen.findByRole('button', { name: 'Delete' }))

    await waitFor(() => expect(controlsApi.deleteSpecimenFromBatch).toHaveBeenCalledWith(1, 30))
    await waitFor(() => expect(keysNotInvalidated(queryClient, otherPages)).toEqual([]))
  })
})
