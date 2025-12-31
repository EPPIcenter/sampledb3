import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { vi, describe, it, expect, beforeEach } from 'vitest'

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
import { collectionsApi } from '../../lib/api'

// Mock react-router-dom
const mockSetSearchParams = vi.fn()
const mockGetSearchParams = vi.fn()

vi.mock('react-router-dom', () => ({
    useSearchParams: () => [{
        get: mockGetSearchParams
    }, mockSetSearchParams]
}))

// Mock API
vi.mock('../../lib/api', () => ({
    collectionsApi: {
        resolveContainers: vi.fn(),
        listCollectionsByType: vi.fn(),
        moveContainers: vi.fn()
    }
}))

describe('ContainerMoveCryovial', () => {
    beforeEach(() => {
        vi.clearAllMocks()
        mockGetSearchParams.mockReturnValue(null)
    })

    it('renders upload step initially', () => {
        render(<ContainerMoveCryovial />)
        expect(screen.getByText('Move Cryovial Tubes')).toBeInTheDocument()
        expect(screen.getByText('Upload CSV')).toBeInTheDocument()
    })

    it('validates empty CSV file', async () => {
        const { container } = render(<ContainerMoveCryovial />)

        const file = new File([''], 'test.csv', { type: 'text/csv' })
        // Polyfill .text() for JSDOM
        Object.defineProperty(file, 'text', {
            value: async () => ''
        })
        const input = container.querySelector('input[type="file"]') as HTMLInputElement

        fireEvent.change(input, { target: { files: [file] } })

        const nextButton = screen.getByText('Next: Resolve Containers')
        fireEvent.click(nextButton)

        await waitFor(() => {
            expect(screen.getByText(/CSV file is empty/)).toBeInTheDocument()
        })
    })

    it('validates CSV columns specific to cryovials', async () => {
        const { container } = render(<ContainerMoveCryovial />)
        // Cryovials need source_collection_name, source_position, target_position
        const csvContent = 'wrong_col,another\nval1,val2'
        const file = new File([csvContent], 'cryo.csv', { type: 'text/csv' })
        // Polyfill .text() for JSDOM
        Object.defineProperty(file, 'text', {
            value: async () => csvContent
        })
        const input = container.querySelector('input[type="file"]') as HTMLInputElement

        fireEvent.change(input, { target: { files: [file] } })

        const nextButton = screen.getByText('Next: Resolve Containers')
        fireEvent.click(nextButton)

        await waitFor(() => {
            expect(screen.getByText(/source_collection_name is required/i)).toBeInTheDocument()
        })
    })

    it('resolves cryovial containers successfully', async () => {
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

        const { container } = render(<ContainerMoveCryovial />)

        const input = container.querySelector('input[type="file"]') as HTMLInputElement
        fireEvent.change(input, { target: { files: [file] } })

        const nextButton = screen.getByText('Next: Resolve Containers')
        fireEvent.click(nextButton)

        await waitFor(() => {
            expect(mockSetSearchParams).toHaveBeenCalledWith(expect.any(Function))
        })

        expect(collectionsApi.resolveContainers).toHaveBeenCalledWith({
            identifiers: [{
                type: 'position',
                sourceCollectionName: 'CRYO1',
                sourcePosition: 'A1'
            }]
        })
    })

    it('errors on incorrect collection types (e.g. generic box)', async () => {
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

        const { container } = render(<ContainerMoveCryovial />)
        const input = container.querySelector('input[type="file"]') as HTMLInputElement
        fireEvent.change(input, { target: { files: [file] } })
        fireEvent.click(screen.getByText('Next: Resolve Containers'))

        await waitFor(() => {
            expect(screen.getByText(/Mixed or invalid collection types found/i)).toBeInTheDocument()
            expect(screen.getByText(/All containers must be from cryovial_box collections/i)).toBeInTheDocument()
        })
    })
})
