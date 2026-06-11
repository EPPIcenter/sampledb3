/**
 * Wiring smoke tests for the micronix scan move page (ADR 0008).
 *
 * Workflow scenarios (CSV validation, relocation rules, resolve grouping,
 * move planning, destination creation) are covered by plain-data unit tests
 * in src/lib/scan-move/__tests__ and src/lib/__tests__/scanner-plate-csv.test.ts.
 * These tests only assert that the page wires the hook, bootstrap queries,
 * URL step, and gateway calls together correctly.
 */
import { screen, fireEvent, waitFor } from '@testing-library/react'
import { vi, describe, it, expect, beforeEach } from 'vitest'
import { renderWithProviders } from '../../__tests__/helpers/render'

// Polyfill File.prototype.text for JSDOM (may exist in some test envs)
// eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- runtime check for JSDOM
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
import { collectionsApi } from '../../lib/api/collections'
import { locationsApi } from '../../lib/api/locations'
import { settingsApi } from '../../lib/api/settings'
import { scannerConfigurationsValue } from '../../__tests__/helpers/settings-mocks'

// Mock react-router-dom: stateful so setSearchParams triggers re-renders and get() returns current params.
let initialSearchParams = new URLSearchParams()
const mockSetSearchParams = vi.fn()

vi.mock('react-router-dom', async (importOriginal) => {
    const actual = await importOriginal<typeof import('react-router-dom')>()
    const React = await import('react')
    return {
        ...actual,
        useSearchParams: function useSearchParamsMock() {
            const [params, setParams] = React.useState(initialSearchParams)
            const setSearchParams = React.useCallback((updater: (prev: URLSearchParams) => URLSearchParams) => {
                setParams((prev: URLSearchParams) => {
                    const next = updater(new URLSearchParams(prev))
                    mockSetSearchParams(updater)
                    return next
                })
            }, [])
            return [params, setSearchParams]
        },
    }
})

// Mock API (authApi required for UserProvider in renderWithProviders)
vi.mock('../../lib/api/auth', async () => {
  const { createMockedDomainModule } = await import('../../__tests__/helpers/mock-api')
  const { micronixMoveAuthMock } = await import('../../__tests__/helpers/mock-api-templates')
  return createMockedDomainModule('auth', micronixMoveAuthMock())
})

vi.mock('../../lib/api/collections', async () => {
  const { createMockedDomainModule } = await import('../../__tests__/helpers/mock-api')
  const { micronixMovePageMock } = await import('../../__tests__/helpers/mock-api-templates')
  return createMockedDomainModule('collections', micronixMovePageMock())
})

vi.mock('../../lib/api/locations', async () => {
  const { createMockedDomainModule } = await import('../../__tests__/helpers/mock-api')
  const { micronixMovePageMock } = await import('../../__tests__/helpers/mock-api-templates')
  return createMockedDomainModule('locations', micronixMovePageMock())
})

vi.mock('../../lib/api/settings', async () => {
  const { createMockedDomainModule } = await import('../../__tests__/helpers/mock-api')
  const { micronixMovePageMock } = await import('../../__tests__/helpers/mock-api-templates')
  return createMockedDomainModule('settings', micronixMovePageMock())
})

vi.mock('../../components/LocationPicker', () => ({
  default: ({
    value,
    onChange,
    disabled,
  }: {
    value: number | null
    onChange: (id: number | null) => void
    disabled?: boolean
  }) => (
    <button type="button" disabled={disabled} onClick={() => onChange(99)}>
      {value == null ? 'Select location' : `Location ${value}`}
    </button>
  ),
}))

/** Build a full 96-well CSV (container_barcode,target_position). Overrides: position -> barcode (empty = empty well). */
function fullPlateCSV(overrides: Record<string, string> = {}): string {
    const rows = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'].flatMap((row) =>
        Array.from({ length: 12 }, (_, i) => {
            const col = (i + 1).toString().padStart(2, '0')
            return `${row}${col}`
        })
    )
    const lines = rows.map((pos) => {
        const barcode = pos in overrides ? overrides[pos] : ''
        return `${barcode},${pos}`
    })
    return 'container_barcode,target_position\n' + lines.join('\n')
}

describe('ContainerMoveMicronix', { timeout: 8_000 }, () => {
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
        initialSearchParams = new URLSearchParams()
        vi.mocked(collectionsApi.listCollectionsByType).mockResolvedValue({ collections: [] } as any)
        vi.mocked(locationsApi.list).mockResolvedValue({ locations: [] } as any)
        vi.mocked(settingsApi.getValue).mockResolvedValue(
            scannerConfigurationsValue([mockScannerConfig]),
        )
        vi.mocked(collectionsApi.getMicronixPlate).mockResolvedValue({ plate: { id: 1, name: 'PLATE1' }, wells: {} } as any)
    })

    it('renders upload step initially', async () => {
        await renderWithProviders(<ContainerMoveMicronix />)
        
        await waitFor(() => {
            expect(screen.getByText('Move Micronix Tubes')).toBeInTheDocument()
        })
        expect(screen.getByText('Upload CSV Files')).toBeInTheDocument()
    })

    it('shows PageError with retry when bootstrap load fails', async () => {
        vi.mocked(collectionsApi.listCollectionsByType).mockRejectedValue(new Error('fail'))
        await renderWithProviders(<ContainerMoveMicronix />)
        await waitFor(() => {
            expect(screen.getByRole('alert')).toBeInTheDocument()
            expect(screen.getByText(/Could not load collections/i)).toBeInTheDocument()
            expect(screen.getByRole('button', { name: /try again/i })).toBeInTheDocument()
        })
    })

    it('resets to upload step and updates URL when step=resolve in URL but no files (reload)', async () => {
        initialSearchParams = new URLSearchParams({ step: 'resolve' })
        vi.mocked(collectionsApi.listCollectionsByType).mockResolvedValue({ collections: [] } as any)
        vi.mocked(locationsApi.list).mockResolvedValue({ locations: [] } as any)
        vi.mocked(settingsApi.getValue).mockResolvedValue(
            scannerConfigurationsValue([mockScannerConfig]),
        )

        await renderWithProviders(<ContainerMoveMicronix />)

        await waitFor(() => {
            expect(screen.getByText('Upload CSV Files')).toBeInTheDocument()
        })
        expect(mockSetSearchParams).toHaveBeenCalledWith(expect.any(Function))
        const updater = mockSetSearchParams.mock.calls[0][0] as (prev: URLSearchParams) => URLSearchParams
        const next = updater(new URLSearchParams())
        expect(next.get('step')).toBe('upload')
    })

    it('clears file input value when a file is removed', async () => {
        vi.mocked(collectionsApi.listCollectionsByType).mockResolvedValue({ collections: [{ id: 1, name: 'PLATE1', barcode: null, locationId: null, itemCount: 0 }] } as any)
        const csvContent = fullPlateCSV({ A01: 'MTX1' })
        const file = new File([csvContent], 'PLATE1.csv', { type: 'text/csv' })

        const { container } = await renderWithProviders(<ContainerMoveMicronix />)
        await waitFor(() => {
            const input = container.querySelector('input[type="file"]') as HTMLInputElement
            expect(input).toBeInTheDocument()
            expect(input.disabled).toBe(false)
        })

        const fileInput = container.querySelector('input[type="file"]') as HTMLInputElement
        fireEvent.change(fileInput, { target: { files: [file] } })

        await waitFor(() => {
            expect(screen.getByText('PLATE1.csv')).toBeInTheDocument()
        })

        fireEvent.click(screen.getByRole('button', { name: /^Remove$/i }))

        await waitFor(() => {
            expect(screen.queryByText('PLATE1.csv')).not.toBeInTheDocument()
        })

        const inputAfterRemove = container.querySelector('input[type="file"]') as HTMLInputElement
        expect(inputAfterRemove.value).toBe('')
    })

    it('re-validates uploaded CSV when scanner configuration changes', async () => {
        const configWithTargetPosition = {
            id: 'config-target',
            name: 'Target Position Config',
            barcodeColumn: 'container_barcode',
            positionType: 'single' as const,
            positionColumn: 'target_position',
            skipRows: 0,
            isDefault: true,
        }
        const configWithPositionColumn = {
            id: 'config-position',
            name: 'Position Column Config',
            barcodeColumn: 'container_barcode',
            positionType: 'single' as const,
            positionColumn: 'position',
            skipRows: 0,
            isDefault: false,
        }
        vi.mocked(settingsApi.getValue).mockResolvedValue(
            scannerConfigurationsValue([configWithTargetPosition, configWithPositionColumn]),
        )

        const csvContent = fullPlateCSV({ A01: 'MTX1' })
        const file = new File([csvContent], 'plate.csv', { type: 'text/csv' })

        const { container } = await renderWithProviders(<ContainerMoveMicronix />)
        await waitFor(() => {
            const input = container.querySelector('input[type="file"]') as HTMLInputElement
            expect(input).toBeInTheDocument()
            expect(input.disabled).toBe(false)
        })

        fireEvent.change(container.querySelector('input[type="file"]') as HTMLInputElement, {
            target: { files: [file] },
        })

        await waitFor(() => {
            expect(screen.getByText('plate.csv')).toBeInTheDocument()
        })
        await waitFor(() => {
            expect(screen.getByText('96 rows')).toBeInTheDocument()
        }, { timeout: 3000 })

        const select = container.querySelector('select')
        expect(select).toBeInTheDocument()
        fireEvent.change(select!, { target: { value: 'config-position' } })

        await waitFor(() => {
            const errors = screen.getAllByText(/Position column "position".*required/i)
            expect(errors.length).toBeGreaterThan(0)
        }, { timeout: 3000 })
    })

    it('resolves micronix containers successfully using barcodes', async () => {
        const csvContent = fullPlateCSV({ A01: 'MTX123' })
        const file = new File([csvContent], 'PLATE1.csv', { type: 'text/csv' })
        
        // Mock a plate that matches the filename
        vi.mocked(collectionsApi.listCollectionsByType).mockResolvedValue({ 
                collections: [{ 
                    id: 1, 
                    name: 'PLATE1', 
                    barcode: null,
                    locationId: null,
                    itemCount: 0 
                }] 
            } as any)

        vi.mocked(collectionsApi.resolveContainers).mockResolvedValue({
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
            } as any)

        const { container } = await renderWithProviders(<ContainerMoveMicronix />)
        
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
            const nextButton = screen.getByRole('button', { name: /^Next:/ })
            expect(nextButton).toBeInTheDocument()
            expect(nextButton).not.toBeDisabled()
        }, { timeout: 3000 })
        
        fireEvent.click(screen.getByRole('button', { name: /^Next:/ }))

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

    it('sends selected atomic mode in move payload', async () => {
        vi.mocked(collectionsApi.listCollectionsByType).mockResolvedValue({
            collections: [{ id: 1, name: 'PLATE1', barcode: null, locationId: null, itemCount: 0 }],
        } as any)
        vi.mocked(collectionsApi.resolveContainers).mockResolvedValue({
            containers: [
                {
                    identifier: { barcode: 'MTX1' },
                    container: {
                        containerId: 1,
                        currentCollectionId: 1,
                        currentCollectionName: 'PLATE1',
                        currentCollectionType: 'micronix_plate',
                        currentPosition: 'A01',
                        barcode: 'MTX1',
                    },
                },
            ],
        } as any)
        vi.mocked(collectionsApi.moveContainers).mockResolvedValue({
            success: true,
            moved: 1,
        } as any)

        const csvContent = fullPlateCSV({ A01: 'MTX1' })
        const file = new File([csvContent], 'PLATE1.csv', { type: 'text/csv' })

        const { container } = await renderWithProviders(<ContainerMoveMicronix />)
        await waitFor(() => {
            const input = container.querySelector('input[type="file"]') as HTMLInputElement
            expect(input.disabled).toBe(false)
        })
        fireEvent.change(container.querySelector('input[type="file"]') as HTMLInputElement, {
            target: { files: [file] },
        })
        await waitFor(() => expect(screen.getByText('PLATE1.csv')).toBeInTheDocument(), { timeout: 3000 })
        await waitFor(() => {
            expect(screen.getByRole('button', { name: /^Next:/ })).not.toBeDisabled()
        }, { timeout: 3000 })
        fireEvent.click(screen.getByRole('button', { name: /^Next:/ }))

        await waitFor(() => {
            expect(screen.getByText('Resolved Micronix Tubes')).toBeInTheDocument()
        }, { timeout: 3000 })
        await waitFor(() => {
            expect(screen.getByRole('button', { name: /execute moves/i })).not.toBeDisabled()
        }, { timeout: 3000 })

        const bestEffort = screen.getByRole('radio', { name: /best effort/i })
        fireEvent.click(bestEffort)

        fireEvent.click(screen.getByRole('button', { name: /execute moves/i }))

        await waitFor(() => {
            expect(collectionsApi.moveContainers).toHaveBeenCalledWith(
                expect.objectContaining({
                    collectionType: 'micronix_plate',
                    atomicMode: 'best_effort',
                })
            )
        })
    })

    it('creates destination plate and continues to resolve', async () => {
        vi.mocked(collectionsApi.listCollectionsByType)
            .mockResolvedValueOnce({ collections: [] } as any)
            .mockResolvedValue({ collections: [{ id: 42, name: 'NEW-PLATE', barcode: null, locationId: 99, itemCount: 0 }] } as any)
        vi.mocked(collectionsApi.createMicronixPlate).mockResolvedValue({
            plate: { id: 42, name: 'NEW-PLATE', locationId: 99 },
        } as any)
        vi.mocked(collectionsApi.resolveContainers).mockResolvedValue({
            containers: [
                {
                    identifier: { barcode: 'MTX123' },
                    container: {
                        containerId: 3,
                        currentCollectionId: 300,
                        currentCollectionName: 'SourcePlate',
                        currentCollectionType: 'micronix_plate',
                        currentPosition: 'B02',
                        barcode: 'MTX123',
                    },
                },
            ],
        } as any)
        vi.mocked(collectionsApi.getMicronixPlate).mockResolvedValue({
            plate: { id: 42, name: 'NEW-PLATE' },
            wells: {},
        } as any)

        const csvContent = fullPlateCSV({ A01: 'MTX123' })
        const file = new File([csvContent], 'NEW-PLATE.csv', { type: 'text/csv' })

        const { container } = await renderWithProviders(<ContainerMoveMicronix />)
        await waitFor(() => {
            const input = container.querySelector('input[type="file"]') as HTMLInputElement
            expect(input.disabled).toBe(false)
        })

        fireEvent.change(container.querySelector('input[type="file"]') as HTMLInputElement, {
            target: { files: [file] },
        })

        await waitFor(() => {
            expect(screen.getByText('NEW-PLATE.csv')).toBeInTheDocument()
        })

        fireEvent.click(screen.getByRole('button', { name: /Next: Create Destination Plates/i }))

        await waitFor(() => {
            expect(screen.getByRole('heading', { name: 'Create Destination Plates' })).toBeInTheDocument()
        })

        fireEvent.click(screen.getByRole('button', { name: /Select location/i }))
        fireEvent.click(screen.getByRole('button', { name: /Create Plates & Continue/i }))

        await waitFor(() => {
            expect(collectionsApi.createMicronixPlate).toHaveBeenCalledWith({
                name: 'NEW-PLATE',
                locationId: 99,
                barcode: undefined,
            })
            expect(screen.getByText('Resolved Micronix Tubes')).toBeInTheDocument()
        })
    })

    it('after backing from resolve, upload step skips create and re-resolves', async () => {
        vi.mocked(collectionsApi.listCollectionsByType)
            .mockResolvedValueOnce({ collections: [] } as any)
            .mockResolvedValue({ collections: [{ id: 42, name: 'NEW-PLATE', barcode: null, locationId: 99, itemCount: 0 }] } as any)
        vi.mocked(collectionsApi.createMicronixPlate).mockResolvedValue({
            plate: { id: 42, name: 'NEW-PLATE', locationId: 99 },
        } as any)
        vi.mocked(collectionsApi.resolveContainers).mockResolvedValue({ containers: [] } as any)
        vi.mocked(collectionsApi.getMicronixPlate).mockResolvedValue({
            plate: { id: 42, name: 'NEW-PLATE' },
            wells: {},
        } as any)

        const csvContent = fullPlateCSV({ A01: 'UNKNOWN-TUBE' })
        const file = new File([csvContent], 'NEW-PLATE.csv', { type: 'text/csv' })

        const { container } = await renderWithProviders(<ContainerMoveMicronix />)
        await waitFor(() => {
            const input = container.querySelector('input[type="file"]') as HTMLInputElement
            expect(input.disabled).toBe(false)
        })

        fireEvent.change(container.querySelector('input[type="file"]') as HTMLInputElement, {
            target: { files: [file] },
        })
        await waitFor(() => expect(screen.getByText('NEW-PLATE.csv')).toBeInTheDocument())

        fireEvent.click(screen.getByRole('button', { name: /Next: Create Destination Plates/i }))
        fireEvent.click(screen.getByRole('button', { name: /Select location/i }))
        fireEvent.click(screen.getByRole('button', { name: /Create Plates & Continue/i }))

        await waitFor(() => expect(screen.getByText('Resolved Micronix Tubes')).toBeInTheDocument())

        fireEvent.click(screen.getByRole('button', { name: /^Back$/i }))
        await waitFor(() => expect(screen.getByText('Upload CSV Files')).toBeInTheDocument())

        fireEvent.click(screen.getByRole('button', { name: /Next: Resolve Containers/i }))

        await waitFor(() => {
            expect(screen.getByText('Resolved Micronix Tubes')).toBeInTheDocument()
        })
        expect(collectionsApi.createMicronixPlate).toHaveBeenCalledTimes(1)
    })
})
