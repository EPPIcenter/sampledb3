import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { QueryClientProvider, type QueryClient } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import {
  containerKeys,
  useAddSpecimenContainer,
  useCreateDerivation,
  useUpdateContainer,
} from '../useContainers'
import { collectionKeys } from '../useCollections'
import { specimenKeys } from '../useSpecimens'
import { studyKeys } from '../useStudies'
import { dashboardKeys } from '../useDashboard'
import { containersApi } from '../../lib/api/containers'
import { derivationsApi, type CreateDerivationPayload } from '../../lib/api/derivations'
import { specimensApi, type AddContainerData } from '../../lib/api/specimens'
import {
  createInvalidationTestClient,
  keysNotInvalidated,
  seedQueries,
} from '../../__tests__/helpers/query-invalidation'

vi.mock('../../lib/api/containers', async () => {
  const { createMockedDomainModule } = await import('../../__tests__/helpers/mock-api')
  return createMockedDomainModule('containers', {
    containersApi: { list: vi.fn(), get: vi.fn(), update: vi.fn() },
  })
})

vi.mock('../../lib/api/derivations', async () => {
  const { createMockedDomainModule } = await import('../../__tests__/helpers/mock-api')
  return createMockedDomainModule('derivations', {
    derivationsApi: { createFromContainer: vi.fn(), listFromContainer: vi.fn(), getSource: vi.fn() },
  })
})

vi.mock('../../lib/api/specimens', async () => {
  const { createMockedDomainModule } = await import('../../__tests__/helpers/mock-api')
  return createMockedDomainModule('specimens', {
    specimensApi: { addContainer: vi.fn() },
  })
})

function setup() {
  const queryClient = createInvalidationTestClient()
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  )
  return { queryClient, wrapper }
}

/** Pages that show a Container: its detail, a Collection grid, its Specimen's Containers, and the dashboard. */
const containerPages = [
  containerKeys.detail(5),
  containerKeys.derivations(5),
  collectionKeys.cryovialBox(1),
  collectionKeys.micronixPlate(2),
  specimenKeys.containers(7),
  dashboardKeys.count('containers'),
  dashboardKeys.secondary(),
]

function seed(queryClient: QueryClient, extra: readonly (readonly unknown[])[] = []) {
  const keys = [...containerPages, ...extra]
  seedQueries(queryClient, keys)
  return keys
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('useUpdateContainer', () => {
  it('saves the edit and invalidates the Collection grids, Specimen Containers and dashboard that show it', async () => {
    const updated = { id: 5, containerType: 'paper' as const, sublabel: 'NEW' }
    vi.mocked(containersApi.update).mockResolvedValue(updated as never)
    const { queryClient, wrapper } = setup()
    const keys = seed(queryClient)

    const { result } = renderHook(() => useUpdateContainer(), { wrapper })
    result.current.mutate({ id: 5, data: { sublabel: 'NEW' } })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(containersApi.update).toHaveBeenCalledWith(5, { sublabel: 'NEW' })
    expect(result.current.data).toEqual(updated)
    expect(keysNotInvalidated(queryClient, keys)).toEqual([])
  })

  it('invalidates nothing when the save fails', async () => {
    vi.mocked(containersApi.update).mockRejectedValue(new Error('Unknown tag id: 9'))
    const { queryClient, wrapper } = setup()
    const keys = seed(queryClient)

    const { result } = renderHook(() => useUpdateContainer(), { wrapper })
    result.current.mutate({ id: 5, data: { tagIds: [9] } })

    await waitFor(() => expect(result.current.isError).toBe(true))
    expect(keysNotInvalidated(queryClient, keys)).toEqual(keys)
  })
})

describe('useCreateDerivation', () => {
  const payload = { derivationType: 'dna_extraction', specimenTypeName: 'DNA' } as CreateDerivationPayload

  it('creates the Derivation and invalidates the Collection grids, Specimen lists, study summary and dashboard', async () => {
    vi.mocked(derivationsApi.createFromContainer).mockResolvedValue({ warnings: [] } as never)
    const { queryClient, wrapper } = setup()
    const keys = seed(queryClient, [
      specimenKeys.list({}),
      [...studyKeys.detail(3), 'summary'],
      dashboardKeys.count('specimens'),
    ])

    const { result } = renderHook(() => useCreateDerivation(), { wrapper })
    result.current.mutate({ parentContainerId: 5, payload })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(derivationsApi.createFromContainer).toHaveBeenCalledWith(5, payload)
    expect(keysNotInvalidated(queryClient, keys)).toEqual([])
  })

  it('invalidates nothing when the Derivation fails', async () => {
    vi.mocked(derivationsApi.createFromContainer).mockRejectedValue(new Error('Position taken'))
    const { queryClient, wrapper } = setup()
    const keys = seed(queryClient)

    const { result } = renderHook(() => useCreateDerivation(), { wrapper })
    result.current.mutate({ parentContainerId: 5, payload })

    await waitFor(() => expect(result.current.isError).toBe(true))
    expect(keysNotInvalidated(queryClient, keys)).toEqual(keys)
  })
})

describe('useAddSpecimenContainer', () => {
  const container = { containerType: 'cryovial_tube' } as AddContainerData

  it('adds the Container and invalidates the target Collection grid, the Specimen Containers and dashboard', async () => {
    vi.mocked(specimensApi.addContainer).mockResolvedValue({ containerId: 11 })
    const { queryClient, wrapper } = setup()
    const keys = seed(queryClient, [collectionKeys.box(4), specimenKeys.detail(7)])

    const { result } = renderHook(() => useAddSpecimenContainer(), { wrapper })
    result.current.mutate({ specimenId: 7, container })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(specimensApi.addContainer).toHaveBeenCalledWith(7, container)
    expect(keysNotInvalidated(queryClient, keys)).toEqual([])
  })

  it('invalidates nothing when the add fails', async () => {
    vi.mocked(specimensApi.addContainer).mockRejectedValue(new Error('Position taken'))
    const { queryClient, wrapper } = setup()
    const keys = seed(queryClient)

    const { result } = renderHook(() => useAddSpecimenContainer(), { wrapper })
    result.current.mutate({ specimenId: 7, container })

    await waitFor(() => expect(result.current.isError).toBe(true))
    expect(keysNotInvalidated(queryClient, keys)).toEqual(keys)
  })
})
