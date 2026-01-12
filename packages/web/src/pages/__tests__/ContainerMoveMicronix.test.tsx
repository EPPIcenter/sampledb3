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

import ContainerMoveMicronix from '../ContainerMoveMicronix'
import { collectionsApi, locationsApi, scannerConfigurationsApi } from '../../lib/api'

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
    },
    scannerConfigurationsApi: {
        getAll: vi.fn()
    }
}))

describe('ContainerMoveMicronix', () => {
    const mockScannerConfig = {
        id: 'test-config-1',
        name: 'Test Config',
        barcodeColumn: 'container_barcode',
        positionType: 'single' as const,
        positionColumn: 'target_position',
        skipRows: 0,
        isDefault: true,
    }

    beforeEach(() => {
        vi.clearAllMocks()
        mockGetSearchParams.mockReturnValue(null)
        vi.mocked(collectionsApi.listCollectionsByType).mockResolvedValue({ data: { collections: [] } } as any)
        vi.mocked(locationsApi.list).mockResolvedValue({ data: { locations: [] } } as any)
        vi.mocked(scannerConfigurationsApi.getAll).mockResolvedValue({ 
            data: { 
                configurations: [mockScannerConfig] 
            } 
        } as any)
    })

    it('renders upload step initially', async () => {
        renderWithProviders(<ContainerMoveMicronix />)
        
        await waitFor(() => {
            expect(screen.getByText('Move Micronix Tubes')).toBeInTheDocument()
        })
        expect(screen.getByText('Upload CSV Files')).toBeInTheDocument()
    })

    it('validates empty CSV file', async () => {
        const { container } = renderWithProviders(<ContainerMoveMicronix />)
        
        // Wait for scanner config to load and be selected
        await waitFor(() => {
            const input = container.querySelector('input[type="file"]') as HTMLInputElement
            expect(input).toBeInTheDocument()
            expect(input.disabled).toBe(false)
        })
        
        const file = new File([''], 'test.csv', { type: 'text/csv' })
        // Polyfill .text() for JSDOM
        Object.defineProperty(file, 'text', {
            value: async () => ''
        })
        const input = container.querySelector('input[type="file"]') as HTMLInputElement
        fireEvent.change(input, { target: { files: [file] } })
        
        // Wait for file to be processed
        await waitFor(() => {
            expect(screen.getByText('test.csv')).toBeInTheDocument()
        })
        
        fireEvent.click(screen.getByText('Next: Resolve Containers'))

        await waitFor(() => {
            expect(screen.getByText(/CSV file is empty/)).toBeInTheDocument()
        })
    })

    it('validates CSV columns specific to micronix (barcode required)', async () => {
        const { container } = renderWithProviders(<ContainerMoveMicronix />)
        
        // Wait for scanner config to load and be selected
        await waitFor(() => {
            const input = container.querySelector('input[type="file"]') as HTMLInputElement
            expect(input).toBeInTheDocument()
            expect(input.disabled).toBe(false)
        })
        
        // Micronix needs container_barcode, target_position
        const csvContent = 'wrong_col,target_position\nval1,A1'
        const file = new File([csvContent], 'micronix.csv', { type: 'text/csv' })
        // Polyfill .text() for JSDOM
        Object.defineProperty(file, 'text', {
            value: async () => csvContent
        })
        const input = container.querySelector('input[type="file"]') as HTMLInputElement

        fireEvent.change(input, { target: { files: [file] } })
        
        // Wait for file to be processed
        await waitFor(() => {
            expect(screen.getByText('micronix.csv')).toBeInTheDocument()
        })
        
        fireEvent.click(screen.getByText('Next: Resolve Containers'))

        await waitFor(() => {
            expect(screen.getByText(/Barcode column "container_barcode" is required but missing or empty/i)).toBeInTheDocument()
        })
    })

    it('resolves micronix containers successfully using barcodes', async () => {
        const csvContent = 'container_barcode,target_position\nMTX123,A1'
        const file = new File([csvContent], 'PLATE1.csv', { type: 'text/csv' })
        
        // Mock a plate that matches the filename
        vi.mocked(collectionsApi.listCollectionsByType).mockResolvedValue({ 
            data: { 
                collections: [{ 
                    id: 1, 
                    name: 'PLATE1', 
                    barcode: null,
                    locationId: null,
                    itemCount: 0 
                }] 
            } 
        } as any)

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

        const { container } = renderWithProviders(<ContainerMoveMicronix />)
        
        // Wait for scanner config to load and be selected
        await waitFor(() => {
            const input = container.querySelector('input[type="file"]') as HTMLInputElement
            expect(input).toBeInTheDocument()
            expect(input.disabled).toBe(false)
        })
        
        const input = container.querySelector('input[type="file"]') as HTMLInputElement
        fireEvent.change(input, { target: { files: [file] } })
        
        // Wait for file to be processed and plate to be auto-selected (filename matches PLATE1)
        await waitFor(() => {
            expect(screen.getByText('PLATE1.csv')).toBeInTheDocument()
        })
        
        // Wait for plate to be auto-selected
        await waitFor(() => {
            const nextButton = screen.getByText('Next: Resolve Containers')
            expect(nextButton).toBeInTheDocument()
            expect(nextButton).not.toBeDisabled()
        }, { timeout: 3000 })
        
        fireEvent.click(screen.getByText('Next: Resolve Containers'))

        await waitFor(() => {
            expect(collectionsApi.resolveContainers).toHaveBeenCalledWith({
                identifiers: [{
                    type: 'barcode',
                    barcode: 'MTX123'
                }]
            })
        })
        
        // Verify step changed to resolve
        await waitFor(() => {
            expect(mockSetSearchParams).toHaveBeenCalled()
        })
    })

    it('errors on incorrect collection types', async () => {
        const csvContent = 'container_barcode,target_position\nMTX123,A1'
        const file = new File([csvContent], 'PLATE1.csv', { type: 'text/csv' })
        
        // Mock a plate that matches the filename
        vi.mocked(collectionsApi.listCollectionsByType).mockResolvedValue({ 
            data: { 
                collections: [{ 
                    id: 1, 
                    name: 'PLATE1', 
                    barcode: null,
                    locationId: null,
                    itemCount: 0 
                }] 
            } 
        } as any)

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

        const { container } = renderWithProviders(<ContainerMoveMicronix />)
        
        // Wait for scanner config to load and be selected
        await waitFor(() => {
            const input = container.querySelector('input[type="file"]') as HTMLInputElement
            expect(input).toBeInTheDocument()
            expect(input.disabled).toBe(false)
        })
        
        const input = container.querySelector('input[type="file"]') as HTMLInputElement
        fireEvent.change(input, { target: { files: [file] } })
        
        // Wait for file to be processed and plate to be auto-selected (filename matches PLATE1)
        await waitFor(() => {
            expect(screen.getByText('PLATE1.csv')).toBeInTheDocument()
        })
        
        // Wait a bit more for plate selection to complete
        await waitFor(() => {
            const nextButton = screen.getByText('Next: Resolve Containers')
            expect(nextButton).toBeInTheDocument()
        }, { timeout: 3000 })
        
        fireEvent.click(screen.getByText('Next: Resolve Containers'))

        await waitFor(() => {
            expect(screen.getByText(/Some containers are not from micronix plates/i)).toBeInTheDocument()
        }, { timeout: 5000 })
    })
})
