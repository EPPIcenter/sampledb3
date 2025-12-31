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

import ContainerMoveMicronix from '../ContainerMoveMicronix'
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

describe('ContainerMoveMicronix', () => {
    beforeEach(() => {
        vi.clearAllMocks()
        mockGetSearchParams.mockReturnValue(null)
    })

    it('renders upload step initially', () => {
        render(<ContainerMoveMicronix />)
        expect(screen.getByText('Move Micronix Tubes')).toBeInTheDocument()
        expect(screen.getByText('Upload CSV')).toBeInTheDocument()
    })

    it('validates empty CSV file', async () => {
        const { container } = render(<ContainerMoveMicronix />)
        const file = new File([''], 'test.csv', { type: 'text/csv' })
        // Polyfill .text() for JSDOM
        Object.defineProperty(file, 'text', {
            value: async () => ''
        })
        const input = container.querySelector('input[type="file"]') as HTMLInputElement
        fireEvent.change(input, { target: { files: [file] } })
        fireEvent.click(screen.getByText('Next: Resolve Containers'))

        await waitFor(() => {
            expect(screen.getByText(/CSV file is empty/)).toBeInTheDocument()
        })
    })

    it('validates CSV columns specific to micronix (barcode required)', async () => {
        const { container } = render(<ContainerMoveMicronix />)
        // Micronix needs container_barcode, target_position
        const csvContent = 'wrong_col,target_position\nval1,A1'
        const file = new File([csvContent], 'micronix.csv', { type: 'text/csv' })
        // Polyfill .text() for JSDOM
        Object.defineProperty(file, 'text', {
            value: async () => csvContent
        })
        const input = container.querySelector('input[type="file"]') as HTMLInputElement

        fireEvent.change(input, { target: { files: [file] } })
        fireEvent.click(screen.getByText('Next: Resolve Containers'))

        await waitFor(() => {
            expect(screen.getByText(/container_barcode is required/i)).toBeInTheDocument()
        })
    })

    it('resolves micronix containers successfully using barcodes', async () => {
        const csvContent = 'container_barcode,target_position\nMTX123,A1'
        const file = new File([csvContent], 'micronix.csv', { type: 'text/csv' })

        vi.mocked(collectionsApi.resolveContainers).mockResolvedValue({
            data: {
                containers: [
                    {
                        identifier: { barcode: 'MTX123' },
                        container: {
                            containerId: 3,
                            currentCollectionId: 300,
                            currentCollectionName: 'PLATE1',
                            currentCollectionType: 'micronix_plate',
                            currentPosition: 'B2',
                            barcode: 'MTX123'
                        }
                    }
                ]
            }
        } as any)

        const { container } = render(<ContainerMoveMicronix />)
        const input = container.querySelector('input[type="file"]') as HTMLInputElement
        fireEvent.change(input, { target: { files: [file] } })
        fireEvent.click(screen.getByText('Next: Resolve Containers'))

        await waitFor(() => {
            expect(mockSetSearchParams).toHaveBeenCalledWith(expect.any(Function))
        })

        expect(collectionsApi.resolveContainers).toHaveBeenCalledWith({
            identifiers: [{
                type: 'barcode',
                barcode: 'MTX123'
            }]
        })
    })

    it('errors on incorrect collection types', async () => {
        const csvContent = 'container_barcode,target_position\nMTX123,A1'
        const file = new File([csvContent], 'micronix.csv', { type: 'text/csv' })

        vi.mocked(collectionsApi.resolveContainers).mockResolvedValue({
            data: {
                containers: [
                    {
                        identifier: { barcode: 'MTX123' },
                        container: {
                            containerId: 3,
                            currentCollectionId: 300,
                            currentCollectionName: 'PLATE1',
                            currentCollectionType: 'box', // Wrong type
                            currentPosition: 'B2',
                            barcode: 'MTX123'
                        }
                    }
                ]
            }
        } as any)

        const { container } = render(<ContainerMoveMicronix />)
        const input = container.querySelector('input[type="file"]') as HTMLInputElement
        fireEvent.change(input, { target: { files: [file] } })
        fireEvent.click(screen.getByText('Next: Resolve Containers'))

        await waitFor(() => {
            expect(screen.getByText(/Mixed or invalid collection types found/i)).toBeInTheDocument()
            expect(screen.getByText(/must be from micronix_plate collections/i)).toBeInTheDocument()
        })
    })
})
