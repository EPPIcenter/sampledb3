import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { QueryClientProvider } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import { controlKeys, useDeleteControlBatchSpecimen } from '../useControls'
import { collectionKeys } from '../useCollections'
import { specimenKeys } from '../useSpecimens'
import { dashboardKeys } from '../useDashboard'
import { controlsApi } from '../../lib/api/controls'
import {
  createInvalidationTestClient,
  keysNotInvalidated,
  observeQuery,
  seedQueries,
} from '../../__tests__/helpers/query-invalidation'

vi.mock('../../lib/api/controls', async () => {
  const { createMockedDomainModule } = await import('../../__tests__/helpers/mock-api')
  return createMockedDomainModule('controls', {
    controlsApi: { deleteSpecimenFromBatch: vi.fn() },
  })
})

function setup() {
  const queryClient = createInvalidationTestClient()
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  )
  return { queryClient, wrapper }
}

const batchPages = [
  collectionKeys.micronixPlate(4),
  collectionKeys.sheet(6),
  controlKeys.batchSummary(9),
  controlKeys.overview(),
  specimenKeys.list({}),
  dashboardKeys.count('specimens'),
]

describe('useDeleteControlBatchSpecimen', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('invalidates the Collection grids, the batch, the Controls overview and dashboard', async () => {
    vi.mocked(controlsApi.deleteSpecimenFromBatch).mockResolvedValue({ message: 'Deleted' })
    const { queryClient, wrapper } = setup()
    seedQueries(queryClient, batchPages)

    const { result } = renderHook(() => useDeleteControlBatchSpecimen(), { wrapper })
    result.current.mutate({ batchId: 9, specimenId: 30 })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(controlsApi.deleteSpecimenFromBatch).toHaveBeenCalledWith(9, 30)
    expect(keysNotInvalidated(queryClient, batchPages)).toEqual([])
  })

  it("marks the deleted Specimen's pages stale without refetching them", async () => {
    vi.mocked(controlsApi.deleteSpecimenFromBatch).mockResolvedValue({ message: 'Deleted' })
    const { queryClient, wrapper } = setup()
    const deletedDetail = await observeQuery(queryClient, specimenKeys.detail(30))
    const deletedContainers = await observeQuery(queryClient, specimenKeys.containers(30))
    const batch = await observeQuery(queryClient, controlKeys.batchSummary(9))

    const { result } = renderHook(() => useDeleteControlBatchSpecimen(), { wrapper })
    result.current.mutate({ batchId: 9, specimenId: 30 })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(batch.queryFn).toHaveBeenCalledTimes(2)
    expect(deletedDetail.queryFn).toHaveBeenCalledTimes(1)
    expect(deletedContainers.queryFn).toHaveBeenCalledTimes(1)
    for (const observed of [deletedDetail, deletedContainers, batch]) observed.unsubscribe()
  })

  it('invalidates nothing when the delete fails', async () => {
    vi.mocked(controlsApi.deleteSpecimenFromBatch).mockRejectedValue(new Error('Not in this batch'))
    const { queryClient, wrapper } = setup()
    seedQueries(queryClient, batchPages)

    const { result } = renderHook(() => useDeleteControlBatchSpecimen(), { wrapper })
    result.current.mutate({ batchId: 9, specimenId: 30 })

    await waitFor(() => expect(result.current.isError).toBe(true))
    expect(keysNotInvalidated(queryClient, batchPages)).toEqual(batchPages)
  })
})
