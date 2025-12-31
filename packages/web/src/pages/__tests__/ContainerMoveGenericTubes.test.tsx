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

import ContainerMoveGenericTubes from '../ContainerMoveGenericTubes'
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

describe('ContainerMoveGenericTubes', () => {
    beforeEach(() => {
        vi.clearAllMocks()
        mockGetSearchParams.mockReturnValue(null) // Default to 'upload' step
    })

    it('renders upload step initially', () => {
        render(<ContainerMoveGenericTubes />)
        expect(screen.getByText('Move Generic Tubes')).toBeInTheDocument()
        expect(screen.getByText('Upload CSV')).toBeInTheDocument()
        expect(screen.getByText('Upload CSV File')).toBeInTheDocument()
    })

    it('validates empty CSV file', async () => {
        const { container } = render(<ContainerMoveGenericTubes />)

        const file = new File([''], 'test.csv', { type: 'text/csv' })
        // Polyfill .text() for JSDOM
        Object.defineProperty(file, 'text', {
            value: async () => ''
        })
        const input = container.querySelector('input[type="file"]') as HTMLInputElement

        // Using fireEvent.change because userEvent.upload can be tricky with some inputs in tests
        fireEvent.change(input, { target: { files: [file] } })

        const nextButton = screen.getByText('Next: Resolve Containers')
        fireEvent.click(nextButton)

        await waitFor(() => {
            expect(screen.getByText(/CSV file is empty/)).toBeInTheDocument()
        })
    })

    it('validates CSV columns', async () => {
        const { container } = render(<ContainerMoveGenericTubes />)

        const csvContent = 'wrong_column,another_wrong\nval1,val2'
        const file = new File([csvContent], 'test.csv', { type: 'text/csv' })
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

    it('resolves containers successfully', async () => {
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
                            currentCollectionType: 'box',
                            currentPosition: 'A1'
                        }
                    }
                ]
            }
        } as any)

        const { container } = render(<ContainerMoveGenericTubes />)

        const input = container.querySelector('input[type="file"]') as HTMLInputElement
        fireEvent.change(input, { target: { files: [file] } })

        const nextButton = screen.getByText('Next: Resolve Containers')
        fireEvent.click(nextButton)

        await waitFor(() => {
            // Should move to resolve step (mocked routing or checking for new content)
            // Since we are mocking useSearchParams, the component internal state update for 'step' calls setSearchParams
            expect(mockSetSearchParams).toHaveBeenCalledWith(expect.any(Function))
        })

        // Now we simulate being on step 'resolve'
        mockGetSearchParams.mockReturnValue('resolve')
        // We need to re-render or trigger effect, but in this test setup with internal state mocking url params might be tricky.
        // However, the component calls 'setCurrentStep' which updates search params.
        // Let's verify collectionsApi was called correctly
        expect(collectionsApi.resolveContainers).toHaveBeenCalledWith({
            identifiers: [{
                type: 'position',
                sourceCollectionName: 'BOX1',
                sourcePosition: 'A1'
            }]
        })
    })

    it('validates mixed collection types', async () => {
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
                            currentCollectionType: 'cryovial_box', // Wrong type
                            currentPosition: 'A1'
                        }
                    }
                ]
            }
        } as any)

        const { container } = render(<ContainerMoveGenericTubes />)

        const input = container.querySelector('input[type="file"]') as HTMLInputElement
        fireEvent.change(input, { target: { files: [file] } })

        const nextButton = screen.getByText('Next: Resolve Containers')
        fireEvent.click(nextButton)

        await waitFor(() => {
            expect(screen.getByText(/Mixed or invalid collection types/i)).toBeInTheDocument()
        })
    })
})
