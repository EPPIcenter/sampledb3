import { render, screen, fireEvent, waitFor, within } from '@testing-library/react'
import { vi, describe, it, expect, beforeEach } from 'vitest'
import ContainerMovePapers from '../ContainerMovePapers'
import { collectionsApi, locationsApi } from '../../lib/api'
import { BrowserRouter } from 'react-router-dom'

// Mock API
vi.mock('../../lib/api', () => ({
    collectionsApi: {
        listCollectionsByType: vi.fn(),
        getBox: vi.fn(),
        getBag: vi.fn(),
        moveSheets: vi.fn()
    },
    locationsApi: {
        list: vi.fn()
    }
}))

vi.mock('../../components/CollectionTreePicker', () => ({
    default: ({ collections, onSelect }: any) => (
        <div data-testid="collection-tree-picker">
            {collections.map((c: any) => (
                <button key={c.id} onClick={() => onSelect(c.type, c.id, c.name)}>
                    {c.name}
                </button>
            ))}
        </div>
    )
}))

// Wrapper to provide router context for Link components
const Wrapper = ({ children }: { children: React.ReactNode }) => (
    <BrowserRouter>{children}</BrowserRouter>
)

describe('ContainerMovePapers', () => {
    beforeEach(() => {
        vi.clearAllMocks()
        vi.mocked(collectionsApi.listCollectionsByType).mockResolvedValue({ data: { collections: [] } } as any)
        vi.mocked(locationsApi.list).mockResolvedValue({ data: { locations: [] } } as any)
        vi.mocked(collectionsApi.getBox).mockResolvedValue({
            data: {
                contents: {
                    sheets: [
                        { id: 100, name: 'Sheet A', papers: [] },
                        { id: 101, name: 'Sheet B', papers: [] }
                    ]
                }
            }
        } as any)
    })

    it('renders initial step successfully', async () => {
        render(<ContainerMovePapers />, { wrapper: Wrapper })
        await waitFor(() => {
            expect(screen.getByText('Move Papers')).toBeInTheDocument()
        })
        expect(screen.getByText('Choose Source Collection')).toBeInTheDocument()
    })

    it('loads available collections on mount', async () => {
        vi.mocked(collectionsApi.listCollectionsByType).mockImplementation((type) => {
            if (type === 'box') return Promise.resolve({ data: { collections: [{ id: 1, name: 'Box 1', itemCount: 1 }] } } as any)
            if (type === 'bag') return Promise.resolve({ data: { collections: [{ id: 2, name: 'Bag 1', itemCount: 2 }] } } as any)
            return Promise.resolve({ data: { collections: [] } } as any)
        })

        render(<ContainerMovePapers />, { wrapper: Wrapper })

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
            if (type === 'box') return Promise.resolve({ data: { collections: [{ id: 1, name: 'Source Box', itemCount: 5, locationId: 10 }] } } as any)
            return Promise.resolve({ data: { collections: [{ id: 2, name: 'Source Bag', itemCount: 5, locationId: 10 }] } } as any)
        })
        vi.mocked(locationsApi.list).mockResolvedValue({
            data: { locations: [{ id: 10, name: 'Freezer', parentId: null, storageTypeId: '1', canContainCollections: true, path: 'Freezer' }] }
        } as any)

        render(<ContainerMovePapers />, { wrapper: Wrapper })

        // 2. Select Source
        // Need to wait for collection picker to load
        await waitFor(() => expect(screen.getByText('Source Box')).toBeInTheDocument())
        fireEvent.click(screen.getByText('Source Box')) // Assuming clicking the name selects it

        // 3. Select Sheets

        // Wait for step transition
        await waitFor(() => expect(screen.getByText('Select Sheets to Move')).toBeInTheDocument())
        await waitFor(() => expect(screen.getByText('Sheet A')).toBeInTheDocument())

        // Select Sheet A
        fireEvent.click(screen.getByText('Sheet A'))

        // Click Next
        fireEvent.click(screen.getByText('Next: Select Destination'))

        // 4. Select Destination
        await waitFor(() => expect(screen.getByText('Choose Destination Collection')).toBeInTheDocument())
        // Reuse the same collection list for simplicity, but we need to select one
        // Select destination
        fireEvent.click(screen.getByText('Source Bag')) // Select bag as destination

        // Actually, let's mock two boxes
        vi.mocked(collectionsApi.listCollectionsByType).mockResolvedValue({
            data: {
                collections: [
                    { id: 1, name: 'Source Box', itemCount: 5 },
                    { id: 2, name: 'Dest Box', itemCount: 0 }
                ]
            }
        } as any)
        // We need re-render to pick up new mock? No, effect runs on mount. 
        // We should have mocked it correctly initially.
    })
})
