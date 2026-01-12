import { screen, fireEvent, waitFor } from '@testing-library/react'
import { vi, describe, it, expect, beforeEach } from 'vitest'
import { renderWithProviders } from '../../__tests__/helpers/render'

// Polyfill File.prototype.text for JSDOM
if (!File.prototype.text) {
    File.prototype.text = async function () {
        return new Promise((resolve) => {
            const reader = new FileReader()
            reader.onload = () => resolve(reader.result as string)
            reader.readAsText(this)
        })
    }
}

import ContainerMoveCryovial from '../ContainerMoveCryovial'
import { collectionsApi, locationsApi } from '../../lib/api'

// Mock react-router-dom
const mockSetSearchParams = vi.fn()
const mockGetSearchParams = vi.fn()

vi.mock('react-router-dom', async () => {
    const actual = await vi.importActual('react-router-dom')
    return {
        ...actual,
        useSearchParams: () => [{
            get: mockGetSearchParams
        }, mockSetSearchParams]
    }
})

// Mock API
vi.mock('../../lib/api', () => ({
    collectionsApi: {
        resolveContainers: vi.fn(),
        listCollectionsByType: vi.fn(),
        moveContainers: vi.fn()
    },
    locationsApi: {
        list: vi.fn()
    }
}))

describe('ContainerMoveCryovial', () => {
    beforeEach(() => {
        vi.clearAllMocks()
        mockGetSearchParams.mockReturnValue(null)
        vi.mocked(collectionsApi.listCollectionsByType).mockResolvedValue({ data: { collections: [] } } as any)
        vi.mocked(locationsApi.list).mockResolvedValue({ data: { locations: [] } } as any)
    })

    it('renders upload step initially', async () => {
        vi.mocked(collectionsApi.listCollectionsByType).mockResolvedValue({ data: { collections: [] } } as any)
        vi.mocked(locationsApi.list).mockResolvedValue({ data: { locations: [] } } as any)
        
        renderWithProviders(<ContainerMoveCryovial />)
        
        await waitFor(() => {
            expect(screen.getByText('Move Cryovial Tubes')).toBeInTheDocument()
        })
        
        await waitFor(() => {
            expect(screen.getByText('Upload CSV Files')).toBeInTheDocument()
        })
    })

    it('validates empty CSV file', async () => {
        vi.mocked(collectionsApi.listCollectionsByType).mockResolvedValue({ data: { collections: [] } } as any)
        vi.mocked(locationsApi.list).mockResolvedValue({ data: { locations: [] } } as any)
        
        const { container } = renderWithProviders(<ContainerMoveCryovial />)

        await waitFor(() => {
            const input = container.querySelector('input[type="file"]') as HTMLInputElement
            expect(input).toBeInTheDocument()
        })

        const file = new File([''], 'test.csv', { type: 'text/csv' })
        // Polyfill .text() for JSDOM
        Object.defineProperty(file, 'text', {
            value: async () => ''
        })
        const input = container.querySelector('input[type="file"]') as HTMLInputElement

        fireEvent.change(input, { target: { files: [file] } })

        await waitFor(() => {
            expect(screen.getByText('Next: Resolve Containers')).toBeInTheDocument()
        })

        const nextButton = screen.getByText('Next: Resolve Containers')
        fireEvent.click(nextButton)

        await waitFor(() => {
            expect(screen.getByText(/CSV file is empty/)).toBeInTheDocument()
        })
    })

    it('validates CSV columns specific to cryovials', async () => {
        vi.mocked(collectionsApi.listCollectionsByType).mockResolvedValue({ data: { collections: [] } } as any)
        vi.mocked(locationsApi.list).mockResolvedValue({ data: { locations: [] } } as any)
        
        const { container } = renderWithProviders(<ContainerMoveCryovial />)
        
        await waitFor(() => {
            const input = container.querySelector('input[type="file"]') as HTMLInputElement
            expect(input).toBeInTheDocument()
        })
        
        // Cryovials need source_collection_name, source_position, target_position
        const csvContent = 'wrong_col,another\nval1,val2'
        const file = new File([csvContent], 'cryo.csv', { type: 'text/csv' })
        // Polyfill .text() for JSDOM
        Object.defineProperty(file, 'text', {
            value: async () => csvContent
        })
        const input = container.querySelector('input[type="file"]') as HTMLInputElement

        fireEvent.change(input, { target: { files: [file] } })

        await waitFor(() => {
            expect(screen.getByText('Next: Resolve Containers')).toBeInTheDocument()
        })

        const nextButton = screen.getByText('Next: Resolve Containers')
        fireEvent.click(nextButton)

        await waitFor(() => {
            expect(screen.getByText(/source_collection_name is required/i)).toBeInTheDocument()
        })
    })

    it('resolves cryovial containers successfully', async () => {
        // Mock a box that matches the filename so it auto-selects
        vi.mocked(collectionsApi.listCollectionsByType).mockResolvedValue({ 
            data: { 
                collections: [{ 
                    id: 1, 
                    name: 'cryo', 
                    barcode: null, 
                    locationId: null,
                    itemCount: 0,
                    location: null
                }] 
            } 
        } as any)
        vi.mocked(locationsApi.list).mockResolvedValue({ data: { locations: [] } } as any)
        
        const csvContent = 'source_collection_name,source_position,target_position\nCRYO1,A1,B1'
        const file = new File([csvContent], 'cryo.csv', { type: 'text/csv' })

        vi.mocked(collectionsApi.resolveContainers).mockResolvedValue({
            data: {
                containers: [
                    {
                        identifier: { sourceCollectionName: 'CRYO1', sourcePosition: 'A1' },
                        container: {
                            containerId: 2,
                            currentCollectionId: 200,
                            currentCollectionName: 'CRYO1',
                            currentCollectionType: 'cryovial_box',
                            currentPosition: 'A1'
                        }
                    }
                ]
            }
        } as any)

        const { container } = renderWithProviders(<ContainerMoveCryovial />)

        await waitFor(() => {
            const input = container.querySelector('input[type="file"]') as HTMLInputElement
            expect(input).toBeInTheDocument()
        })

        const input = container.querySelector('input[type="file"]') as HTMLInputElement
        fireEvent.change(input, { target: { files: [file] } })

        await waitFor(() => {
            expect(screen.getByText('Next: Resolve Containers')).toBeInTheDocument()
        })

        const nextButton = screen.getByText('Next: Resolve Containers')
        fireEvent.click(nextButton)

        await waitFor(() => {
            expect(collectionsApi.resolveContainers).toHaveBeenCalled()
        }, { timeout: 3000 })

        expect(collectionsApi.resolveContainers).toHaveBeenCalledWith({
            identifiers: [{
                type: 'position',
                sourceCollectionName: 'CRYO1',
                sourcePosition: 'A1'
            }]
        })
    })

    it('errors on incorrect collection types (e.g. generic box)', async () => {
        // Mock a box that matches the filename so it auto-selects
        vi.mocked(collectionsApi.listCollectionsByType).mockResolvedValue({ 
            data: { 
                collections: [{ 
                    id: 1, 
                    name: 'test', 
                    barcode: null, 
                    locationId: null,
                    itemCount: 0,
                    location: null
                }] 
            } 
        } as any)
        vi.mocked(locationsApi.list).mockResolvedValue({ data: { locations: [] } } as any)
        
        const csvContent = 'source_collection_name,source_position,target_position\nBOX1,A1,B1'
        const file = new File([csvContent], 'test.csv', { type: 'text/csv' })

        vi.mocked(collectionsApi.resolveContainers).mockResolvedValue({
            data: {
                containers: [
                    {
                        identifier: { sourceCollectionName: 'BOX1', sourcePosition: 'A1' },
                        container: {
                            containerId: 1,
                            currentCollectionId: 100,
                            currentCollectionName: 'BOX1',
                            currentCollectionType: 'box', // Wrong type
                            currentPosition: 'A1'
                        }
                    }
                ]
            }
        } as any)

        const { container } = renderWithProviders(<ContainerMoveCryovial />)
        
        await waitFor(() => {
            const input = container.querySelector('input[type="file"]') as HTMLInputElement
            expect(input).toBeInTheDocument()
        })
        
        const input = container.querySelector('input[type="file"]') as HTMLInputElement
        fireEvent.change(input, { target: { files: [file] } })
        
        await waitFor(() => {
            expect(screen.getByText('Next: Resolve Containers')).toBeInTheDocument()
        })
        
        fireEvent.click(screen.getByText('Next: Resolve Containers'))

        await waitFor(() => {
            expect(screen.getByText(/Some containers are not from cryovial boxes/i)).toBeInTheDocument()
        }, { timeout: 3000 })
    })
})
