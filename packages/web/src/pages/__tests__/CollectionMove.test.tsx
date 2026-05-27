import { describe, it, expect, vi, beforeEach } from 'vitest'
import userEvent from '@testing-library/user-event'
import { render, screen, waitFor } from '../../__tests__/helpers/render'
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
  locationsApi: { list: vi.fn().mockResolvedValue({ data: { locations: [] } }) },
  collectionsApi: {
    listAllCollections: vi.fn().mockResolvedValue({ data: { collections: [] } }),
    moveCollections: vi.fn().mockResolvedValue({ data: { success: true, moved: 0 } }),
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
  locationsApi: { list: vi.fn().mockResolvedValue({ data: { locations: [] } }) },
  collectionsApi: {
    listAllCollections: vi.fn().mockResolvedValue({ data: { collections: [] } }),
    moveCollections: vi.fn().mockResolvedValue({ data: { success: true, moved: 0 } }),
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
  locationsApi: { list: vi.fn().mockResolvedValue({ data: { locations: [] } }) },
  collectionsApi: {
    listAllCollections: vi.fn().mockResolvedValue({ data: { collections: [] } }),
    moveCollections: vi.fn().mockResolvedValue({ data: { success: true, moved: 0 } }),
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

describe('CollectionMove', () => {
  beforeEach(() => {
    vi.clearAllMocks()
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

  it('shows both collections in Review when same id different type are selected', async () => {
    const locations = [
      { id: 1, name: 'F1', path: 'F1', parentId: null, canContainCollections: true, description: undefined, storageTypeId: null, effectiveStorageTypeName: '-80°C', created: '', lastUpdated: '' },
      { id: 2, name: 'F2', path: 'F2', parentId: null, canContainCollections: true, description: undefined, storageTypeId: null, effectiveStorageTypeName: '-80°C', created: '', lastUpdated: '' },
    ]
    const collections = [
      { id: 1, name: 'Plate A', type: 'micronix_plate' as const, itemCount: 0, locationId: 1, location: { id: 1, path: 'F1' }, barcode: null },
      { id: 1, name: 'Cryovial Box B', type: 'cryovial_box' as const, itemCount: 0, locationId: 1, location: { id: 1, path: 'F1' }, barcode: null },
    ]
    vi.mocked(locationsApi.list).mockResolvedValue({ data: { locations } } as Awaited<ReturnType<typeof locationsApi.list>>)
    vi.mocked(collectionsApi.listAllCollections).mockResolvedValue({ data: { collections } } as Awaited<ReturnType<typeof collectionsApi.listAllCollections>>)
    vi.mocked(collectionsApi.moveCollections).mockResolvedValue({
      data: { success: true, moved: 1 },
      status: 200,
      statusText: 'OK',
      headers: {},
      config: {} as import('axios').InternalAxiosRequestConfig,
    } as Awaited<ReturnType<typeof collectionsApi.moveCollections>>)

    const { default: CollectionMove } = await import('../CollectionMove')
    const user = userEvent.setup()
    render(<CollectionMove />)

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
    vi.mocked(locationsApi.list).mockResolvedValue({ data: { locations } } as Awaited<ReturnType<typeof locationsApi.list>>)
    vi.mocked(collectionsApi.listAllCollections).mockResolvedValue({ data: { collections } } as Awaited<ReturnType<typeof collectionsApi.listAllCollections>>)
    vi.mocked(collectionsApi.moveCollections).mockResolvedValue({
      data: { success: true, moved: 1 },
      status: 200,
      statusText: 'OK',
      headers: {},
      config: {} as import('axios').InternalAxiosRequestConfig,
    } as Awaited<ReturnType<typeof collectionsApi.moveCollections>>)

    const { default: CollectionMove } = await import('../CollectionMove')
    const user = userEvent.setup()
    render(<CollectionMove />)

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

    expect(collectionsApi.moveCollections).toHaveBeenCalledWith(
      expect.objectContaining({
        collectionType: 'micronix_plate',
        atomicMode: 'all_or_nothing',
      })
    )
  })

  it('sends best_effort when selected in collection move controls', async () => {
    const locations = [
      { id: 1, name: 'F1', path: 'F1', parentId: null, canContainCollections: true, description: undefined, storageTypeId: null, effectiveStorageTypeName: '-80°C', created: '', lastUpdated: '' },
      { id: 2, name: 'F2', path: 'F2', parentId: null, canContainCollections: true, description: undefined, storageTypeId: null, effectiveStorageTypeName: '-80°C', created: '', lastUpdated: '' },
    ]
    const collections = [
      { id: 21, name: 'Plate BestEffort', type: 'micronix_plate' as const, itemCount: 0, locationId: 1, location: { id: 1, path: 'F1' }, barcode: null },
    ]
    vi.mocked(locationsApi.list).mockResolvedValue({ data: { locations } } as Awaited<ReturnType<typeof locationsApi.list>>)
    vi.mocked(collectionsApi.listAllCollections).mockResolvedValue({ data: { collections } } as Awaited<ReturnType<typeof collectionsApi.listAllCollections>>)
    vi.mocked(collectionsApi.moveCollections).mockResolvedValue({
      data: { success: true, moved: 1 },
      status: 200,
      statusText: 'OK',
      headers: {},
      config: {} as import('axios').InternalAxiosRequestConfig,
    } as Awaited<ReturnType<typeof collectionsApi.moveCollections>>)

    const { default: CollectionMove } = await import('../CollectionMove')
    const user = userEvent.setup()
    render(<CollectionMove />)

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
      expect.objectContaining({
        collectionType: 'micronix_plate',
        atomicMode: 'best_effort',
      })
    )
  })
})
