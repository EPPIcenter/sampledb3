import { describe, it, expect, vi, beforeEach } from 'vitest'
import userEvent from '@testing-library/user-event'
import { render, screen, waitFor } from '../../__tests__/helpers/render'
import { collectionsApi, locationsApi } from '../../lib/api'

vi.mock('../../lib/api', () => ({
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
}))

vi.mock('../../contexts/UserContext', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../contexts/UserContext')>()
  return { ...actual, useUser: () => ({ canWrite: true }) }
})

vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-router-dom')>()
  return { ...actual, useNavigate: () => vi.fn() }
})

describe('CollectionMove', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders without crashing', async () => {
    const { default: CollectionMove } = await import('../CollectionMove')
    const { container } = await render(<CollectionMove />)
    await waitFor(() => {
      expect(screen.queryByText(/loading collections/i)).not.toBeInTheDocument()
    })
    expect(container).toBeInTheDocument()
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

    // Expand location F1 (click the expand control next to "F1")
    const expandButton = screen.getByRole('button', { name: /f1/i })
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
})
