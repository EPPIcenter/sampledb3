import { describe, it, expect, vi, beforeEach } from 'vitest'
import userEvent from '@testing-library/user-event'
import { QueryClient } from '@tanstack/react-query'
import { render, screen, waitFor, within } from '../../__tests__/helpers/render'
import { collectionsApi } from '../../lib/api/collections'
import { locationsApi } from '../../lib/api/locations'

vi.mock('../../lib/api/locations', async () => {
  const { createMockedDomainModule } = await import('../../__tests__/helpers/mock-api')
  return createMockedDomainModule('locations', {
  authApi: {
    getCurrentUser: vi.fn().mockResolvedValue({
      data: { user: { id: 1, email: 'admin@test.com', name: 'Admin', role: 'admin' } },
    }),
  },
  locationsApi: { list: vi.fn().mockResolvedValue({ locations: [] }) },
  collectionsApi: {
    listAllCollections: vi.fn().mockResolvedValue({ collections: [] }),
    moveCollections: vi.fn().mockResolvedValue({ success: true, moved: 0 }),
  },
})
})

vi.mock('../../lib/api/collections', async () => {
  const { createMockedDomainModule } = await import('../../__tests__/helpers/mock-api')
  return createMockedDomainModule('collections', {
  authApi: {
    getCurrentUser: vi.fn().mockResolvedValue({
      data: { user: { id: 1, email: 'admin@test.com', name: 'Admin', role: 'admin' } },
    }),
  },
  locationsApi: { list: vi.fn().mockResolvedValue({ locations: [] }) },
  collectionsApi: {
    listAllCollections: vi.fn().mockResolvedValue({ collections: [] }),
    moveCollections: vi.fn().mockResolvedValue({ success: true, moved: 0 }),
  },
})
})

vi.mock('../../lib/api/auth', async () => {
  const { createMockedDomainModule } = await import('../../__tests__/helpers/mock-api')
  return createMockedDomainModule('auth', {
  authApi: {
    getCurrentUser: vi.fn().mockResolvedValue({
      data: { user: { id: 1, email: 'admin@test.com', name: 'Admin', role: 'admin' } },
    }),
  },
  locationsApi: { list: vi.fn().mockResolvedValue({ locations: [] }) },
  collectionsApi: {
    listAllCollections: vi.fn().mockResolvedValue({ collections: [] }),
    moveCollections: vi.fn().mockResolvedValue({ success: true, moved: 0 }),
  }
  })
})

vi.mock('../../contexts/UserContext', async () => {
  const actual = await vi.importActual<typeof import('../../contexts/UserContext')>('../../contexts/UserContext')
  return { ...actual, useUser: () => ({ canWrite: true }) }
})

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom')
  return { ...actual, useNavigate: () => vi.fn() }
})

function emptyCollectionsPayload() {
  return { collections: [] }
}

describe('CollectionMove', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(locationsApi.list).mockResolvedValue({ locations: [] })
    vi.mocked(collectionsApi.listAllCollections).mockResolvedValue(emptyCollectionsPayload())
  })

  it('shows collection move content', async () => {
    const { default: CollectionMove } = await import('../CollectionMove')
    await render(<CollectionMove />)
    const heading = await screen.findByRole('heading', { name: /move collections/i })
    expect(heading).toBeInTheDocument()
    await waitFor(() => {
      expect(screen.queryByText(/loading collections/i)).not.toBeInTheDocument()
    })
  })

  it('shows PageError with retry when collections load fails', async () => {
    vi.mocked(collectionsApi.listAllCollections).mockRejectedValue(new Error('fail'))
    const { default: CollectionMove } = await import('../CollectionMove')
    await render(<CollectionMove />)
    await waitFor(() => {
      expect(screen.getByRole('alert')).toBeInTheDocument()
      expect(screen.getByText(/Could not load collections/i)).toBeInTheDocument()
      expect(screen.getByRole('button', { name: /try again/i })).toBeInTheDocument()
    })
  })

  it('shows both collections in Review when same id different type are selected', async () => {
    const locations = [
      { id: 1, name: 'F1', path: 'F1', parentId: null, canContainCollections: true, description: undefined, storageTypeId: null, effectiveStorageTypeName: '-80°C', created: '', lastUpdated: '' },
      { id: 2, name: 'F2', path: 'F2', parentId: null, canContainCollections: true, description: undefined, storageTypeId: null, effectiveStorageTypeName: '-80°C', created: '', lastUpdated: '' },
    ]
    const collections = [
      { id: 1, name: 'Plate A', type: 'micronix_plate' as const, itemCount: 0, locationId: 1, location: { id: 1, path: 'F1' }, barcode: null },
      { id: 1, name: 'Cryovial Box B', type: 'cryovial_box' as const, itemCount: 0, locationId: 1, location: { id: 1, path: 'F1' }, barcode: null },
    ]
    vi.mocked(locationsApi.list).mockResolvedValue({ locations })
    vi.mocked(collectionsApi.listAllCollections).mockResolvedValue({ collections })
    vi.mocked(collectionsApi.moveCollections).mockResolvedValue({ success: true, moved: 1 })

    const { default: CollectionMove } = await import('../CollectionMove')
    const user = userEvent.setup()
    await render(<CollectionMove />)

    await waitFor(() => {
      expect(screen.queryByText(/loading collections/i)).not.toBeInTheDocument()
    })

    // Expand location F1 (click the expand control; accessible name is "Expand F1")
    const expandButton = screen.getByRole('button', { name: /expand\s+f1/i })
    await user.click(expandButton)

    // Select both collections (two checkboxes for Plate A and Cryovial Box B)
    const checkboxes = screen.getAllByRole('checkbox')
    expect(checkboxes.length).toBeGreaterThanOrEqual(2)
    await user.click(checkboxes[0])
    await user.click(checkboxes[1])

    // Continue with 2 collections
    await user.click(screen.getByRole('button', { name: /continue with 2 collections/i }))

    // Open destination picker and select F2
    await waitFor(() => {
      expect(screen.getByText(/choose destination location/i)).toBeInTheDocument()
    })
    await user.click(screen.getByRole('button', { name: /select locations/i }))
    await waitFor(() => {
      expect(screen.getByRole('heading', { name: /select locations/i })).toBeInTheDocument()
    })
    // Wait for locations to load in the modal; each location row has a "Select" button. First match may be "Select locations..." (trigger); then F1's Select, then F2's Select.
    const selectButtons = await screen.findAllByRole('button', { name: /select/i })
    expect(selectButtons.length).toBeGreaterThanOrEqual(3)
    await user.click(selectButtons[2])

    // Review & Confirm step should show both collections (same id, different type)
    expect(screen.getByRole('heading', { name: /review & confirm/i })).toBeInTheDocument()
    expect(screen.getByText(/plate a/i)).toBeInTheDocument()
    expect(screen.getByText(/cryovial box b/i)).toBeInTheDocument()
    expect(screen.getByText(/micronix plates/i)).toBeInTheDocument()
    expect(screen.getByText(/cryovial boxes/i)).toBeInTheDocument()
  })

  it('uses all_or_nothing by default when executing collection move', async () => {
    const locations = [
      { id: 1, name: 'F1', path: 'F1', parentId: null, canContainCollections: true, description: undefined, storageTypeId: null, effectiveStorageTypeName: '-80°C', created: '', lastUpdated: '' },
      { id: 2, name: 'F2', path: 'F2', parentId: null, canContainCollections: true, description: undefined, storageTypeId: null, effectiveStorageTypeName: '-80°C', created: '', lastUpdated: '' },
    ]
    const collections = [
      { id: 11, name: 'Plate Default', type: 'micronix_plate' as const, itemCount: 0, locationId: 1, location: { id: 1, path: 'F1' }, barcode: null },
    ]
    vi.mocked(locationsApi.list).mockResolvedValue({ locations })
    vi.mocked(collectionsApi.listAllCollections).mockResolvedValue({ collections })
    vi.mocked(collectionsApi.moveCollections).mockResolvedValue({ success: true, moved: 1 })

    const { default: CollectionMove } = await import('../CollectionMove')
    const user = userEvent.setup()
    await render(<CollectionMove />)

    await waitFor(() => {
      expect(screen.queryByText(/loading collections/i)).not.toBeInTheDocument()
    })

    await user.click(screen.getByRole('button', { name: /expand\s+f1/i }))
    await user.click(screen.getAllByRole('checkbox')[0])
    await user.click(screen.getByRole('button', { name: /continue with 1 collection/i }))

    await user.click(screen.getByRole('button', { name: /select locations/i }))
    const selectButtons = await screen.findAllByRole('button', { name: /select/i })
    await user.click(selectButtons[2])

    const strictRadio = screen.getByRole('radio', { name: /all-or-nothing/i }) as HTMLInputElement
    expect(strictRadio.checked).toBe(true)

    await user.click(screen.getByRole('button', { name: /confirm & move/i }))
    await waitFor(() => {
      expect(collectionsApi.moveCollections).toHaveBeenCalled()
    })

    expect(collectionsApi.moveCollections).toHaveBeenCalledWith({
      atomicMode: 'all_or_nothing',
      moves: [{ collectionType: 'micronix_plate', identifier: { type: 'id', id: 11 }, targetLocationId: 2 }],
    })
  })

  it('sends best_effort when selected in collection move controls', async () => {
    const locations = [
      { id: 1, name: 'F1', path: 'F1', parentId: null, canContainCollections: true, description: undefined, storageTypeId: null, effectiveStorageTypeName: '-80°C', created: '', lastUpdated: '' },
      { id: 2, name: 'F2', path: 'F2', parentId: null, canContainCollections: true, description: undefined, storageTypeId: null, effectiveStorageTypeName: '-80°C', created: '', lastUpdated: '' },
    ]
    const collections = [
      { id: 21, name: 'Plate BestEffort', type: 'micronix_plate' as const, itemCount: 0, locationId: 1, location: { id: 1, path: 'F1' }, barcode: null },
    ]
    vi.mocked(locationsApi.list).mockResolvedValue({ locations })
    vi.mocked(collectionsApi.listAllCollections).mockResolvedValue({ collections })
    vi.mocked(collectionsApi.moveCollections).mockResolvedValue({ success: true, moved: 1 })

    const { default: CollectionMove } = await import('../CollectionMove')
    const user = userEvent.setup()
    await render(<CollectionMove />)

    await waitFor(() => {
      expect(screen.queryByText(/loading collections/i)).not.toBeInTheDocument()
    })

    await user.click(screen.getByRole('button', { name: /expand\s+f1/i }))
    await user.click(screen.getAllByRole('checkbox')[0])
    await user.click(screen.getByRole('button', { name: /continue with 1 collection/i }))

    await user.click(screen.getByRole('button', { name: /select locations/i }))
    const selectButtons = await screen.findAllByRole('button', { name: /select/i })
    await user.click(selectButtons[2])

    const bestEffortRadio = screen.getByRole('radio', { name: /best effort/i }) as HTMLInputElement
    await user.click(bestEffortRadio)
    expect(bestEffortRadio.checked).toBe(true)

    await user.click(screen.getByRole('button', { name: /confirm & move/i }))
    await waitFor(() => {
      expect(collectionsApi.moveCollections).toHaveBeenCalled()
    })

    expect(collectionsApi.moveCollections).toHaveBeenCalledWith(
      expect.objectContaining({ atomicMode: 'best_effort' })
    )
  })

  describe('move results', () => {
    const locations = [
      { id: 1, name: 'F1', path: 'F1', parentId: null, canContainCollections: true, description: undefined, storageTypeId: null, effectiveStorageTypeName: '-80°C', created: '', lastUpdated: '' },
      { id: 2, name: 'F2', path: 'F2', parentId: null, canContainCollections: true, description: undefined, storageTypeId: null, effectiveStorageTypeName: '-80°C', created: '', lastUpdated: '' },
    ]
    const collections = [
      { id: 5, name: 'Plate P', type: 'micronix_plate' as const, itemCount: 0, locationId: 1, location: { id: 1, path: 'F1' }, barcode: null },
      { id: 7, name: 'Box B', type: 'cryovial_box' as const, itemCount: 0, locationId: 1, location: { id: 1, path: 'F1' }, barcode: null },
    ]

    /** Select both Collections, pick F2, choose the atomicity mode and confirm. */
    async function moveBoth(atomicLabel: RegExp) {
      vi.mocked(locationsApi.list).mockResolvedValue({ locations })
      vi.mocked(collectionsApi.listAllCollections).mockResolvedValue({ collections })
      const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } })
      const invalidate = vi.spyOn(queryClient, 'invalidateQueries')
      const { default: CollectionMove } = await import('../CollectionMove')
      const user = userEvent.setup()
      await render(<CollectionMove />, { queryClient })

      await user.click(await screen.findByRole('button', { name: /expand\s+f1/i }))
      for (const checkbox of screen.getAllByRole('checkbox').slice(0, 2)) await user.click(checkbox)
      await user.click(screen.getByRole('button', { name: /continue with 2 collections/i }))
      await user.click(screen.getByRole('button', { name: /select locations/i }))
      const selectButtons = await screen.findAllByRole('button', { name: /select/i })
      await user.click(selectButtons[2])
      await user.click(screen.getByRole('radio', { name: atomicLabel }))
      invalidate.mockClear()
      await user.click(screen.getByRole('button', { name: /confirm & move/i }))
      return { invalidate }
    }

    it('sends plates and boxes in one request so all-or-nothing covers both types', async () => {
      vi.mocked(collectionsApi.moveCollections).mockResolvedValue({ success: true, moved: 2 })

      await moveBoth(/all-or-nothing/i)

      expect(await screen.findByRole('heading', { name: /move completed successfully/i })).toBeInTheDocument()
      expect(collectionsApi.moveCollections).toHaveBeenCalledTimes(1)
      const request = vi.mocked(collectionsApi.moveCollections).mock.calls[0][0]
      expect(request.atomicMode).toBe('all_or_nothing')
      expect(request.moves).toEqual(
        expect.arrayContaining([
          { collectionType: 'micronix_plate', identifier: { type: 'id', id: 5 }, targetLocationId: 2 },
          { collectionType: 'cryovial_box', identifier: { type: 'id', id: 7 }, targetLocationId: 2 },
        ]),
      )
      expect(request.moves).toHaveLength(2)
    })

    it('shows the moved count and the failing row from a partial best-effort move, and refreshes pages', async () => {
      vi.mocked(collectionsApi.moveCollections).mockImplementation(async (data) => {
        const boxRow = data.moves.findIndex((m) => m.collectionType === 'cryovial_box') + 1
        return { success: false, moved: 1, errors: [{ row: boxRow, error: 'Collection is already at location 2' }] }
      })

      const { invalidate } = await moveBoth(/best effort/i)

      expect(await screen.findByRole('heading', { name: /move partly completed/i })).toBeInTheDocument()
      expect(screen.getByText(/moved 1 collection to f2/i)).toBeInTheDocument()
      const errors = screen.getByRole('list')
      expect(within(errors).getByText(/\(box b, cryovial boxes\): collection is already at location 2/i)).toBeInTheDocument()
      expect(invalidate).toHaveBeenCalled()
    })

    it('shows the errors of a move the API rejected and does not refresh pages', async () => {
      vi.mocked(collectionsApi.moveCollections).mockImplementation(async (data) => {
        const boxRow = data.moves.findIndex((m) => m.collectionType === 'cryovial_box') + 1
        throw Object.assign(new Error('Request failed with status code 400'), {
          response: {
            status: 400,
            data: { error: 'Move operation failed', moved: 0, errors: [{ row: boxRow, error: 'Collection not found: ID 7.' }] },
          },
        })
      })

      const { invalidate } = await moveBoth(/all-or-nothing/i)

      expect(await screen.findByRole('heading', { name: /move failed/i })).toBeInTheDocument()
      expect(screen.getByText(/no collections were moved/i)).toBeInTheDocument()
      expect(screen.getByText(/\(box b, cryovial boxes\): collection not found: id 7\./i)).toBeInTheDocument()
      expect(invalidate).not.toHaveBeenCalled()
    })

    it('reports a network failure as a request-level error', async () => {
      vi.mocked(collectionsApi.moveCollections).mockRejectedValue(new Error('Network Error'))

      await moveBoth(/all-or-nothing/i)

      expect(await screen.findByRole('heading', { name: /move failed/i })).toBeInTheDocument()
      expect(screen.getByText(/request: network error/i)).toBeInTheDocument()
    })
  })
})
