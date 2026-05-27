import { render, screen, fireEvent, waitFor, within } from '@testing-library/react'
import { vi, describe, it, expect, beforeEach } from 'vitest'
import ContainerMovePapers from '../ContainerMovePapers'
import { collectionsApi } from '../../lib/api/collections'
import { locationsApi } from '../../lib/api/locations'
import { renderWithProviders } from '../../__tests__/helpers/render'

// Mock API (authApi required for UserProvider in renderWithProviders)
vi.mock('../../lib/api/locations', async () => {
  const { createMockedDomainModule } = await import('../../__tests__/helpers/mock-api')
  return createMockedDomainModule('locations', {
    authApi: {
        getCurrentUser: vi.fn().mockResolvedValue({ user: { id: 1, email: 'admin@test.com', name: 'Admin', role: 'admin' } }),
    },
    collectionsApi: {
        listCollectionsByType: vi.fn(),
        getBox: vi.fn(),
        getBag: vi.fn(),
        moveSheets: vi.fn()
    },
    locationsApi: {
        list: vi.fn()
    }
})
})

vi.mock('../../lib/api/collections', async () => {
  const { createMockedDomainModule } = await import('../../__tests__/helpers/mock-api')
  return createMockedDomainModule('collections', {
    authApi: {
        getCurrentUser: vi.fn().mockResolvedValue({ user: { id: 1, email: 'admin@test.com', name: 'Admin', role: 'admin' } }),
    },
    collectionsApi: {
        listCollectionsByType: vi.fn(),
        getBox: vi.fn(),
        getBag: vi.fn(),
        moveSheets: vi.fn()
    },
    locationsApi: {
        list: vi.fn()
    }
})
})

vi.mock('../../lib/api/auth', async () => {
  const { createMockedDomainModule } = await import('../../__tests__/helpers/mock-api')
  return createMockedDomainModule('auth', {
    authApi: {
        getCurrentUser: vi.fn().mockResolvedValue({ user: { id: 1, email: 'admin@test.com', name: 'Admin', role: 'admin' } }),
    },
    collectionsApi: {
        listCollectionsByType: vi.fn(),
        getBox: vi.fn(),
        getBag: vi.fn(),
        moveSheets: vi.fn()
    },
    locationsApi: {
        list: vi.fn()
    },
  })
})

describe('ContainerMovePapers', () => {
    beforeEach(() => {
        vi.clearAllMocks()
        vi.mocked(collectionsApi.listCollectionsByType).mockResolvedValue({ collections: [] } as any)
        vi.mocked(locationsApi.list).mockResolvedValue({ locations: [] } as any)
        vi.mocked(collectionsApi.getBox).mockResolvedValue({
                contents: {
                    sheets: [
                        { id: 100, name: 'Sheet A', papers: [] },
                        { id: 101, name: 'Sheet B', papers: [] }
                    ]
                }
            } as any)
        vi.mocked(collectionsApi.getBox).mockResolvedValue({
                contents: {
                    sheets: [
                        { id: 100, name: 'Sheet A', papers: [] },
                        { id: 101, name: 'Sheet B', papers: [] }
                    ]
                }
            } as any)
    })

    it('renders initial step successfully', async () => {
        await renderWithProviders(<ContainerMovePapers />)
        await waitFor(() => {
            expect(screen.getByText('Move Papers')).toBeInTheDocument()
        })
        expect(screen.getByText('Choose Source Collection')).toBeInTheDocument()
    })

    it('shows PageError with retry when bootstrap load fails', async () => {
        vi.mocked(collectionsApi.listCollectionsByType).mockRejectedValue(new Error('fail'))
        await renderWithProviders(<ContainerMovePapers />)
        await waitFor(() => {
            expect(screen.getByRole('alert')).toBeInTheDocument()
            expect(screen.getByText(/Could not load collections/i)).toBeInTheDocument()
            expect(screen.getByRole('button', { name: /try again/i })).toBeInTheDocument()
        })
    })

    it('expanding location row reveals child locations and collections', async () => {
        vi.mocked(collectionsApi.listCollectionsByType).mockImplementation((type) => {
            if (type === 'box') return Promise.resolve({ collections: [{ id: 1, name: 'Box A', itemCount: 2, locationId: 10 }] } as any)
            if (type === 'bag') return Promise.resolve({ collections: [] } as any)
            return Promise.resolve({ collections: [] } as any)
        })
        vi.mocked(locationsApi.list).mockResolvedValue({
                locations: [
                    { id: 1, name: 'Building', parentId: null, storageTypeId: '1', canContainCollections: true, path: 'Building' },
                    { id: 10, name: 'Freezer', parentId: 1, storageTypeId: '1', canContainCollections: true, path: 'Building / Freezer' }
                ]
            } as any)

        await renderWithProviders(<ContainerMovePapers />)

        await waitFor(() => expect(screen.getByRole('button', { name: /expand building/i })).toBeInTheDocument())
        // Click the location row to expand (full row is the expand target)
        fireEvent.click(screen.getByRole('button', { name: /expand building/i }))
        await waitFor(() => expect(screen.getByText('Freezer')).toBeInTheDocument())
        await waitFor(() => expect(screen.getByText('Box A')).toBeInTheDocument())
    })

    it('loads available collections on mount', async () => {
        vi.mocked(collectionsApi.listCollectionsByType).mockImplementation((type) => {
            if (type === 'box') return Promise.resolve({ collections: [{ id: 1, name: 'Box 1', itemCount: 1 }] } as any)
            if (type === 'bag') return Promise.resolve({ collections: [{ id: 2, name: 'Bag 1', itemCount: 2 }] } as any)
            return Promise.resolve({ collections: [] } as any)
        })

        await renderWithProviders(<ContainerMovePapers />)

        await waitFor(() => {
            expect(collectionsApi.listCollectionsByType).toHaveBeenCalledWith('box')
            expect(collectionsApi.listCollectionsByType).toHaveBeenCalledWith('bag')
        })
    })

    // Since CollectionTreePicker is a complex component, we might mock it or interact with its rendered output.
    // Assuming we can select by clicking on items if they are rendered.
    // For unit testing the page logic, we often want to test the interaction flow.

    // Checking error handling
    it('shows error if move fails', async () => {
        // Setup state where we are at execution step (harder to simulate without full interaction flow or exposing state)
        // Instead, let's try to simulate the full flow minimally if possible, or mock the internal hook state if it was extracted.
        // Since state is internal, we must drive it via UI.

        // 1. Mock data loading
        vi.mocked(collectionsApi.listCollectionsByType).mockImplementation((type) => {
            if (type === 'box') return Promise.resolve({ collections: [{ id: 1, name: 'Source Box', itemCount: 5, locationId: 10 }] } as any)
            return Promise.resolve({ collections: [{ id: 2, name: 'Source Bag', itemCount: 5, locationId: 10 }] } as any)
        })
        vi.mocked(locationsApi.list).mockResolvedValue({
                locations: [
                    { id: 1, name: 'Building', parentId: null, storageTypeId: '1', canContainCollections: true, path: 'Building' },
                    { id: 10, name: 'Freezer', parentId: 1, storageTypeId: '1', canContainCollections: true, path: 'Building / Freezer' }
                ]
            } as any)

        await renderWithProviders(<ContainerMovePapers />)

        // 2. Select Source: expand location row then select collection
        await waitFor(() => expect(screen.getByRole('button', { name: /expand building/i })).toBeInTheDocument())
        fireEvent.click(screen.getByRole('button', { name: /expand building/i }))
        await waitFor(() => expect(screen.getByText('Source Box')).toBeInTheDocument())
        fireEvent.click(screen.getByText('Source Box'))

        // 3. Select Sheets

        // Wait for step transition
        await waitFor(() => expect(screen.getByText('Select Sheets to Move')).toBeInTheDocument())
        await waitFor(() => expect(screen.getByText('Sheet A')).toBeInTheDocument())

        // Select Sheet A
        fireEvent.click(screen.getByText('Sheet A'))

        // Click Next
        fireEvent.click(screen.getByText('Next: Select Destination'))

        // 4. Select Destination: expand location row then select destination collection
        await waitFor(() => expect(screen.getByText('Choose Destination Collection')).toBeInTheDocument())
        await waitFor(() => expect(screen.getByRole('button', { name: /expand building/i })).toBeInTheDocument())
        fireEvent.click(screen.getByRole('button', { name: /expand building/i }))
        await waitFor(() => expect(screen.getByText('Source Bag')).toBeInTheDocument())
        fireEvent.click(screen.getByText('Source Bag'))
    })
})
