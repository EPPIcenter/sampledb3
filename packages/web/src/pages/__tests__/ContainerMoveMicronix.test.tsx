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
import { scannerConfigurationsApi } from '../../lib/api/settings'

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
        vi.mocked(collectionsApi.listCollectionsByType).mockResolvedValue({ data: { collections: [] } } as any)
        vi.mocked(locationsApi.list).mockResolvedValue({ data: { locations: [] } } as any)
        vi.mocked(scannerConfigurationsApi.getAll).mockResolvedValue({
            data: {
                configurations: [mockScannerConfig]
            }
        } as any)
        vi.mocked(collectionsApi.getMicronixPlate).mockResolvedValue({
            data: { plate: { id: 1, name: 'PLATE1' }, wells: {} }
        } as any)
    })

    it('renders upload step initially', async () => {
        await renderWithProviders(<ContainerMoveMicronix />)
        
        await waitFor(() => {
            expect(screen.getByText('Move Micronix Tubes')).toBeInTheDocument()
        })
        expect(screen.getByText('Upload CSV Files')).toBeInTheDocument()
    })

    it('resets to upload step and updates URL when step=resolve in URL but no files (reload)', async () => {
        initialSearchParams = new URLSearchParams({ step: 'resolve' })
        vi.mocked(collectionsApi.listCollectionsByType).mockResolvedValue({ data: { collections: [] } } as any)
        vi.mocked(locationsApi.list).mockResolvedValue({ data: { locations: [] } } as any)
        vi.mocked(scannerConfigurationsApi.getAll).mockResolvedValue({
            data: { configurations: [mockScannerConfig] },
        } as any)

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
        vi.mocked(collectionsApi.listCollectionsByType).mockResolvedValue({
            data: { collections: [{ id: 1, name: 'PLATE1', barcode: null, locationId: null, itemCount: 0 }] }
        } as any)
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

    it('validates empty CSV file', async () => {
        const { container } = await renderWithProviders(<ContainerMoveMicronix />)
        
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

    it('validates CSV must list all 96 well positions', async () => {
        const { container } = await renderWithProviders(<ContainerMoveMicronix />)
        await waitFor(() => {
            const input = container.querySelector('input[type="file"]') as HTMLInputElement
            expect(input).toBeInTheDocument()
            expect(input.disabled).toBe(false)
        })

        const csvContent = 'container_barcode,target_position\nMTX123,A01\n,A02\n,A03'
        const file = new File([csvContent], 'plate.csv', { type: 'text/csv' })
        const input = container.querySelector('input[type="file"]') as HTMLInputElement
        fireEvent.change(input, { target: { files: [file] } })

        await waitFor(() => {
            expect(screen.getByText('plate.csv')).toBeInTheDocument()
        })

        fireEvent.click(screen.getByText('Next: Resolve Containers'))

        await waitFor(() => {
            expect(screen.getByText(/CSV must list all 96 well positions/i)).toBeInTheDocument()
            expect(screen.getByText(/Missing:/i)).toBeInTheDocument()
        })
    })

    it('rejects CSV with duplicate position and one missing (95 distinct)', async () => {
        const { container } = await renderWithProviders(<ContainerMoveMicronix />)
        await waitFor(() => {
            const input = container.querySelector('input[type="file"]') as HTMLInputElement
            expect(input).toBeInTheDocument()
            expect(input.disabled).toBe(false)
        })

        const base = fullPlateCSV({ A01: 'MTX123' })
        const lines = base.split('\n')
        const dataLines = lines.slice(1)
        const withoutA02 = dataLines.filter((l) => !l.endsWith(',A02'))
        const withA01Duplicate = [...withoutA02, 'MTX456,A01']
        const csvContent = lines[0] + '\n' + withA01Duplicate.join('\n')
        const file = new File([csvContent], 'plate.csv', { type: 'text/csv' })
        const input = container.querySelector('input[type="file"]') as HTMLInputElement
        fireEvent.change(input, { target: { files: [file] } })

        await waitFor(() => {
            expect(screen.getByText('plate.csv')).toBeInTheDocument()
        })

        fireEvent.click(screen.getByText('Next: Resolve Containers'))

        await waitFor(() => {
            expect(screen.getByText(/CSV must list all 96 well positions/i)).toBeInTheDocument()
            expect(screen.getByText(/Missing:/i)).toBeInTheDocument()
        })
    })

    it('rejects CSV with invalid well position (e.g. I01) so only 95 valid positions', async () => {
        const { container } = await renderWithProviders(<ContainerMoveMicronix />)
        await waitFor(() => {
            const input = container.querySelector('input[type="file"]') as HTMLInputElement
            expect(input).toBeInTheDocument()
            expect(input.disabled).toBe(false)
        })

        const base = fullPlateCSV({ A01: 'MTX123' })
        const lines = base.split('\n')
        const dataLines = lines.slice(1)
        const withoutA02 = dataLines.filter((l) => !l.endsWith(',A02'))
        const withInvalid = [...withoutA02, ',I01']
        const csvContent = lines[0] + '\n' + withInvalid.join('\n')
        const file = new File([csvContent], 'plate.csv', { type: 'text/csv' })
        const input = container.querySelector('input[type="file"]') as HTMLInputElement
        fireEvent.change(input, { target: { files: [file] } })

        await waitFor(() => {
            expect(screen.getByText('plate.csv')).toBeInTheDocument()
        })

        fireEvent.click(screen.getByText('Next: Resolve Containers'))

        await waitFor(() => {
            expect(screen.getByText(/CSV must list all 96 well positions/i)).toBeInTheDocument()
            expect(screen.getByText(/Missing:/i)).toBeInTheDocument()
        })
    })

    it('accepts CSV with exactly 96 well positions', async () => {
        vi.mocked(collectionsApi.listCollectionsByType).mockResolvedValue({
            data: {
                collections: [
                    { id: 1, name: 'PLATE1', barcode: null, locationId: null, itemCount: 0 }
                ]
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
                            currentCollectionName: 'SourcePlate',
                            currentCollectionType: 'micronix_plate',
                            currentPosition: 'B02',
                            barcode: 'MTX123'
                        }
                    }
                ]
            }
        } as any)
        const csvContent = fullPlateCSV({ A01: 'MTX123' })
        const file = new File([csvContent], 'PLATE1.csv', { type: 'text/csv' })

        const { container } = await renderWithProviders(<ContainerMoveMicronix />)
        await waitFor(() => {
            const input = container.querySelector('input[type="file"]') as HTMLInputElement
            expect(input).toBeInTheDocument()
            expect(input.disabled).toBe(false)
        })

        const input = container.querySelector('input[type="file"]') as HTMLInputElement
        fireEvent.change(input, { target: { files: [file] } })

        await waitFor(() => {
            expect(screen.getByText('PLATE1.csv')).toBeInTheDocument()
        })
        await waitFor(() => {
            const nextButton = screen.getByText('Next: Resolve Containers')
            expect(nextButton).not.toBeDisabled()
        }, { timeout: 3000 })

        fireEvent.click(screen.getByText('Next: Resolve Containers'))

        await waitFor(() => {
            expect(screen.queryByText(/CSV must list all 96 well positions/i)).not.toBeInTheDocument()
        })
        expect(mockSetSearchParams).toHaveBeenCalled()
    })

    it('validates position is required (barcode may be empty)', async () => {
        const { container } = await renderWithProviders(<ContainerMoveMicronix />)

        await waitFor(() => {
            const input = container.querySelector('input[type="file"]') as HTMLInputElement
            expect(input).toBeInTheDocument()
            expect(input.disabled).toBe(false)
        })

        // Missing position column so target_position is empty; barcode empty is allowed
        const csvContent = 'container_barcode,wrong_pos\n,'
        const file = new File([csvContent], 'micronix.csv', { type: 'text/csv' })
        Object.defineProperty(file, 'text', { value: async () => csvContent })
        const input = container.querySelector('input[type="file"]') as HTMLInputElement
        fireEvent.change(input, { target: { files: [file] } })

        await waitFor(() => {
            expect(screen.getByText('micronix.csv')).toBeInTheDocument()
        })

        fireEvent.click(screen.getByText('Next: Resolve Containers'))

        await waitFor(() => {
            expect(screen.getByText(/Position column .* is required/i)).toBeInTheDocument()
        })
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
        vi.mocked(scannerConfigurationsApi.getAll).mockResolvedValue({
            data: {
                configurations: [configWithTargetPosition, configWithPositionColumn],
            },
        } as any)

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

    it('re-validation round-trip: changing config back to valid clears errors', async () => {
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
        vi.mocked(scannerConfigurationsApi.getAll).mockResolvedValue({
            data: {
                configurations: [configWithTargetPosition, configWithPositionColumn],
            },
        } as any)

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
        await waitFor(() => expect(screen.getByText('96 rows')).toBeInTheDocument(), { timeout: 3000 })

        const select = container.querySelector('select')!
        fireEvent.change(select, { target: { value: 'config-position' } })
        await waitFor(() => {
            expect(screen.getAllByText(/Position column "position".*required/i).length).toBeGreaterThan(0)
        }, { timeout: 3000 })

        fireEvent.change(select, { target: { value: 'config-target' } })
        await waitFor(() => {
            expect(screen.queryAllByText(/Position column "position".*required/i).length).toBe(0)
            expect(screen.getByText('96 rows')).toBeInTheDocument()
        }, { timeout: 3000 })
    })

    it('re-validates all files when scanner configuration changes (multiple files)', async () => {
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
        vi.mocked(scannerConfigurationsApi.getAll).mockResolvedValue({
            data: {
                configurations: [configWithTargetPosition, configWithPositionColumn],
            },
        } as any)

        const csvContent = fullPlateCSV({ A01: 'MTX1' })
        const file1 = new File([csvContent], 'plate1.csv', { type: 'text/csv' })
        const file2 = new File([csvContent], 'plate2.csv', { type: 'text/csv' })

        const { container } = await renderWithProviders(<ContainerMoveMicronix />)
        await waitFor(() => {
            const input = container.querySelector('input[type="file"]') as HTMLInputElement
            expect(input).toBeInTheDocument()
            expect(input.disabled).toBe(false)
        })

        fireEvent.change(container.querySelector('input[type="file"]') as HTMLInputElement, {
            target: { files: [file1, file2] },
        })

        await waitFor(() => {
            expect(screen.getByText('plate1.csv')).toBeInTheDocument()
            expect(screen.getByText('plate2.csv')).toBeInTheDocument()
        }, { timeout: 3000 })
        expect(screen.getAllByText('96 rows').length).toBe(2)

        const select = container.querySelector('select')!
        fireEvent.change(select, { target: { value: 'config-position' } })

        await waitFor(() => {
            const errors = screen.getAllByText(/Position column "position".*required/i)
            expect(errors.length).toBeGreaterThan(0)
        }, { timeout: 3000 })
        expect(screen.getByText('plate1.csv')).toBeInTheDocument()
        expect(screen.getByText('plate2.csv')).toBeInTheDocument()
    })

    it('resets to upload step and clears resolve state when config changes after resolving', async () => {
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
        vi.mocked(scannerConfigurationsApi.getAll).mockResolvedValue({
            data: {
                configurations: [configWithTargetPosition, configWithPositionColumn],
            },
        } as any)
        vi.mocked(collectionsApi.listCollectionsByType).mockResolvedValue({
            data: {
                collections: [
                    { id: 1, name: 'PLATE1', barcode: null, locationId: null, itemCount: 0 },
                ],
            },
        } as any)
        vi.mocked(collectionsApi.resolveContainers).mockResolvedValue({
            data: { containers: [] },
        } as any)
        vi.mocked(collectionsApi.getMicronixPlate).mockResolvedValue({
            data: { plate: { id: 1, name: 'PLATE1' }, wells: {} },
        } as any)

        const csvContent = fullPlateCSV({ A01: 'MTX1' })
        const file = new File([csvContent], 'PLATE1.csv', { type: 'text/csv' })

        const { container } = await renderWithProviders(<ContainerMoveMicronix />)
        await waitFor(() => {
            const input = container.querySelector('input[type="file"]') as HTMLInputElement
            expect(input).toBeInTheDocument()
            expect(input.disabled).toBe(false)
        })

        fireEvent.change(container.querySelector('input[type="file"]') as HTMLInputElement, {
            target: { files: [file] },
        })
        await waitFor(() => expect(screen.getByText('PLATE1.csv')).toBeInTheDocument(), { timeout: 3000 })
        await waitFor(() => {
            expect(screen.getByText('Next: Resolve Containers')).not.toBeDisabled()
        }, { timeout: 3000 })

        fireEvent.click(screen.getByText('Next: Resolve Containers'))
        await waitFor(() => expect(screen.getByText('Resolved Micronix Tubes')).toBeInTheDocument(), { timeout: 3000 })

        fireEvent.click(screen.getByRole('button', { name: /back/i }))
        await waitFor(() => {
            const select = container.querySelector('select')
            expect(select).toBeInTheDocument()
        }, { timeout: 3000 })
        const select = container.querySelector('select')!
        fireEvent.change(select, { target: { value: 'config-position' } })

        await waitFor(() => {
            const errors = screen.getAllByText(/Position column "position".*required/i)
            expect(errors.length).toBeGreaterThan(0)
        }, { timeout: 3000 })

        const setStepCalls = mockSetSearchParams.mock.calls.filter(
            (call) => typeof call[0] === 'function'
        )
        expect(setStepCalls.length).toBeGreaterThan(0)
        const lastSetStep = setStepCalls[setStepCalls.length - 1][0] as (prev: URLSearchParams) => URLSearchParams
        const nextParams = lastSetStep(new URLSearchParams())
        expect(nextParams.get('step')).toBe('upload')
    })

    it('allows empty barcode rows and only resolves rows with barcode', async () => {
        const csvContent = fullPlateCSV({ A01: 'MTX123' })
        const file = new File([csvContent], 'PLATE1.csv', { type: 'text/csv' })

        vi.mocked(collectionsApi.listCollectionsByType).mockResolvedValue({
            data: {
                collections: [
                    { id: 1, name: 'PLATE1', barcode: null, locationId: null, itemCount: 0 }
                ]
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
                            currentCollectionName: 'SourcePlate',
                            currentCollectionType: 'micronix_plate',
                            currentPosition: 'B02',
                            barcode: 'MTX123'
                        }
                    }
                ]
            }
        } as any)
        vi.mocked(collectionsApi.getMicronixPlate).mockResolvedValue({
            data: {
                plate: { id: 1, name: 'PLATE1' },
                wells: {} // destination plate empty
            }
        } as any)

        const { container } = await renderWithProviders(<ContainerMoveMicronix />)
        await waitFor(() => {
            const input = container.querySelector('input[type="file"]') as HTMLInputElement
            expect(input).toBeInTheDocument()
            expect(input.disabled).toBe(false)
        })

        const input = container.querySelector('input[type="file"]') as HTMLInputElement
        fireEvent.change(input, { target: { files: [file] } })

        await waitFor(() => {
            expect(screen.getByText('PLATE1.csv')).toBeInTheDocument()
        })
        await waitFor(() => {
            const nextButton = screen.getByText('Next: Resolve Containers')
            expect(nextButton).not.toBeDisabled()
        }, { timeout: 3000 })

        fireEvent.click(screen.getByText('Next: Resolve Containers'))

        await waitFor(() => {
            expect(collectionsApi.resolveContainers).toHaveBeenCalledWith({
                identifiers: [{ type: 'barcode', barcode: 'MTX123' }]
            })
        })
    })

    it('clears resolution state and relocation errors when destination plate is changed', async () => {
        // Setup: two plates, file name does not match so picker is shown
        vi.mocked(collectionsApi.listCollectionsByType).mockResolvedValue({
            data: {
                collections: [
                    { id: 1, name: 'PLATE1', barcode: null, locationId: 1, itemCount: 0, location: { path: '/Loc1' } },
                    { id: 2, name: 'PLATE2', barcode: null, locationId: 1, itemCount: 0, location: { path: '/Loc1' } }
                ]
            }
        } as any)
        vi.mocked(locationsApi.list).mockResolvedValue({
            data: { locations: [{ id: 1, name: 'Loc1', path: '/Loc1', parentId: null }] }
        } as any)
        vi.mocked(collectionsApi.resolveContainers).mockResolvedValue({ data: { containers: [] } } as any)
        // PLATE1 has tube at A01 not in upload -> relocation error; PLATE2 empty
        vi.mocked(collectionsApi.getMicronixPlate).mockImplementation((plateId: number) =>
            Promise.resolve(
                plateId === 1
                    ? ({
                          data: {
                              plate: { id: 1, name: 'PLATE1' },
                              wells: { A01: { type: 'micronix_tube', id: 99, barcode: 'TUBE_AT_A01', position: 'A01' } }
                          }
                      } as any)
                    : ({ data: { plate: { id: 2, name: 'PLATE2' }, wells: {} } } as any)
            )
        )

        const csvContent = fullPlateCSV()
        const file = new File([csvContent], 'data.csv', { type: 'text/csv' })

        const { container } = await renderWithProviders(<ContainerMoveMicronix />)
        await waitFor(() => {
            const input = container.querySelector('input[type="file"]') as HTMLInputElement
            expect(input.disabled).toBe(false)
        })

        fireEvent.change(container.querySelector('input[type="file"]') as HTMLInputElement, { target: { files: [file] } })

        await waitFor(() => {
            expect(screen.getByText('data.csv')).toBeInTheDocument()
        })

        fireEvent.click(screen.getByText('Select target plate...'))
        await waitFor(() => {
            expect(screen.getByText('Select Micronix Plate')).toBeInTheDocument()
        })
        fireEvent.click(screen.getByRole('option', { name: /PLATE1/ }))

        await waitFor(() => {
            expect(screen.getByText('Next: Resolve Containers')).not.toBeDisabled()
        }, { timeout: 3000 })

        fireEvent.click(screen.getByText('Next: Resolve Containers'))

        await waitFor(() => {
            expect(screen.getByText(/Position A01 on plate "PLATE1" is empty.*not relocated/i)).toBeInTheDocument()
        }, { timeout: 5000 })

        // Change destination plate to PLATE2 (reopen picker and select PLATE2)
        fireEvent.click(screen.getByRole('button', { name: /PLATE1/ }))
        await waitFor(() => {
            expect(screen.getByText('Select Micronix Plate')).toBeInTheDocument()
        })
        fireEvent.click(screen.getByRole('option', { name: /PLATE2/ }))

        // Relocation error should be cleared (was for PLATE1)
        await waitFor(() => {
            expect(screen.queryByText(/not relocated/i)).not.toBeInTheDocument()
        })
    })

    it('relocation validation: error when tube at empty position is not relocated', async () => {
        // CSV says A01 is empty; destination plate has tube TUBE_AT_A01 at A01; barcode not in upload
        const csvContent = fullPlateCSV()
        const file = new File([csvContent], 'PLATE1.csv', { type: 'text/csv' })

        vi.mocked(collectionsApi.listCollectionsByType).mockResolvedValue({
            data: {
                collections: [
                    { id: 1, name: 'PLATE1', barcode: null, locationId: null, itemCount: 0 }
                ]
            }
        } as any)
        vi.mocked(collectionsApi.resolveContainers).mockResolvedValue({
            data: { containers: [] }
        } as any)
        vi.mocked(collectionsApi.getMicronixPlate).mockResolvedValue({
            data: {
                plate: { id: 1, name: 'PLATE1' },
                wells: {
                    A01: {
                        type: 'micronix_tube',
                        id: 99,
                        barcode: 'TUBE_AT_A01',
                        position: 'A01'
                    }
                }
            }
        } as any)

        const { container } = await renderWithProviders(<ContainerMoveMicronix />)
        await waitFor(() => {
            const input = container.querySelector('input[type="file"]') as HTMLInputElement
            expect(input).toBeInTheDocument()
            expect(input.disabled).toBe(false)
        })

        const input = container.querySelector('input[type="file"]') as HTMLInputElement
        fireEvent.change(input, { target: { files: [file] } })

        await waitFor(() => {
            expect(screen.getByText('PLATE1.csv')).toBeInTheDocument()
        })
        await waitFor(() => {
            const nextButton = screen.getByText('Next: Resolve Containers')
            expect(nextButton).not.toBeDisabled()
        }, { timeout: 3000 })

        fireEvent.click(screen.getByText('Next: Resolve Containers'))

        await waitFor(() => {
            expect(screen.getByText(/Position A01 on plate "PLATE1" is empty.*tube TUBE_AT_A01.*not relocated/i)).toBeInTheDocument()
        }, { timeout: 5000 })
    })

    it('relocation validation: when tubes removed with no destination, user stays on upload and sees errors', async () => {
        // CSV has empty wells; plate has tube at A01 not in upload -> relocation error.
        // User must stay on upload step, see the error, and Next must be disabled.
        const csvContent = fullPlateCSV()
        const file = new File([csvContent], 'PLATE1.csv', { type: 'text/csv' })

        vi.mocked(collectionsApi.listCollectionsByType).mockResolvedValue({
            data: {
                collections: [
                    { id: 1, name: 'PLATE1', barcode: null, locationId: null, itemCount: 0 }
                ]
            }
        } as any)
        vi.mocked(collectionsApi.resolveContainers).mockResolvedValue({
            data: { containers: [] }
        } as any)
        vi.mocked(collectionsApi.getMicronixPlate).mockResolvedValue({
            data: {
                plate: { id: 1, name: 'PLATE1' },
                wells: {
                    A01: {
                        type: 'micronix_tube',
                        id: 99,
                        barcode: 'TUBE_AT_A01',
                        position: 'A01'
                    }
                }
            }
        } as any)

        const { container } = await renderWithProviders(<ContainerMoveMicronix />)
        await waitFor(() => {
            const input = container.querySelector('input[type="file"]') as HTMLInputElement
            expect(input).toBeInTheDocument()
            expect(input.disabled).toBe(false)
        })

        const input = container.querySelector('input[type="file"]') as HTMLInputElement
        fireEvent.change(input, { target: { files: [file] } })

        await waitFor(() => {
            expect(screen.getByText('PLATE1.csv')).toBeInTheDocument()
        })
        await waitFor(() => {
            const nextButton = screen.getByText('Next: Resolve Containers')
            expect(nextButton).not.toBeDisabled()
        }, { timeout: 3000 })

        fireEvent.click(screen.getByText('Next: Resolve Containers'))

        await waitFor(() => {
            expect(screen.getByText(/Position A01 on plate "PLATE1" is empty.*tube TUBE_AT_A01.*not relocated/i)).toBeInTheDocument()
        }, { timeout: 5000 })
        expect(screen.getByText('Next: Resolve Containers')).toBeInTheDocument()
        expect(screen.getByText('Next: Resolve Containers')).toBeDisabled()
    })

    it('relocation validation: no error when tube at empty position is relocated in same file', async () => {
        // CSV: A01 empty, A02 has TUBE_AT_A01; plate has TUBE_AT_A01 at A01 → relocated
        const csvContent = fullPlateCSV({ A01: '', A02: 'TUBE_AT_A01' })
        const file = new File([csvContent], 'PLATE1.csv', { type: 'text/csv' })

        vi.mocked(collectionsApi.listCollectionsByType).mockResolvedValue({
            data: {
                collections: [
                    { id: 1, name: 'PLATE1', barcode: null, locationId: null, itemCount: 0 }
                ]
            }
        } as any)
        vi.mocked(collectionsApi.resolveContainers).mockResolvedValue({
            data: {
                containers: [
                    {
                        identifier: { barcode: 'TUBE_AT_A01' },
                        container: {
                            containerId: 3,
                            currentCollectionId: 300,
                            currentCollectionName: 'SourcePlate',
                            currentCollectionType: 'micronix_plate',
                            currentPosition: 'A01',
                            barcode: 'TUBE_AT_A01'
                        }
                    }
                ]
            }
        } as any)
        vi.mocked(collectionsApi.getMicronixPlate).mockResolvedValue({
            data: {
                plate: { id: 1, name: 'PLATE1' },
                wells: {
                    A01: {
                        type: 'micronix_tube',
                        id: 99,
                        barcode: 'TUBE_AT_A01',
                        position: 'A01'
                    }
                }
            }
        } as any)

        const { container } = await renderWithProviders(<ContainerMoveMicronix />)
        await waitFor(() => {
            const input = container.querySelector('input[type="file"]') as HTMLInputElement
            expect(input).toBeInTheDocument()
            expect(input.disabled).toBe(false)
        })

        const input = container.querySelector('input[type="file"]') as HTMLInputElement
        fireEvent.change(input, { target: { files: [file] } })

        await waitFor(() => {
            expect(screen.getByText('PLATE1.csv')).toBeInTheDocument()
        })
        await waitFor(() => {
            const nextButton = screen.getByText('Next: Resolve Containers')
            expect(nextButton).not.toBeDisabled()
        }, { timeout: 3000 })

        fireEvent.click(screen.getByText('Next: Resolve Containers'))

        await waitFor(() => {
            expect(mockSetSearchParams).toHaveBeenCalled()
        })
        expect(screen.queryByText(/not relocated/i)).not.toBeInTheDocument()
    })

    it('relocation validation: no error when tube at empty position is relocated in another file targeting same plate', async () => {
        // File1: A01 empty. File2: A02 has TUBE_AT_A01. Plate has TUBE_AT_A01 at A01 → relocated in move
        const file1 = new File([fullPlateCSV()], 'PLATE1.csv', { type: 'text/csv' })
        const file2 = new File([fullPlateCSV({ A02: 'TUBE_AT_A01' })], 'PLATE1.csv', { type: 'text/csv' })

        vi.mocked(collectionsApi.listCollectionsByType).mockResolvedValue({
            data: {
                collections: [
                    { id: 1, name: 'PLATE1', barcode: null, locationId: null, itemCount: 0 }
                ]
            }
        } as any)
        vi.mocked(collectionsApi.resolveContainers).mockResolvedValue({
            data: {
                containers: [
                    {
                        identifier: { barcode: 'TUBE_AT_A01' },
                        container: {
                            containerId: 3,
                            currentCollectionId: 300,
                            currentCollectionName: 'SourcePlate',
                            currentCollectionType: 'micronix_plate',
                            currentPosition: 'A01',
                            barcode: 'TUBE_AT_A01'
                        }
                    }
                ]
            }
        } as any)
        vi.mocked(collectionsApi.getMicronixPlate).mockResolvedValue({
            data: {
                plate: { id: 1, name: 'PLATE1' },
                wells: {
                    A01: {
                        type: 'micronix_tube',
                        id: 99,
                        barcode: 'TUBE_AT_A01',
                        position: 'A01'
                    }
                }
            }
        } as any)

        const { container } = await renderWithProviders(<ContainerMoveMicronix />)
        await waitFor(() => {
            const input = container.querySelector('input[type="file"]') as HTMLInputElement
            expect(input).toBeInTheDocument()
            expect(input.disabled).toBe(false)
        })

        const input = container.querySelector('input[type="file"]') as HTMLInputElement
        fireEvent.change(input, { target: { files: [file1, file2] } })

        await waitFor(() => {
            expect(screen.getAllByText('PLATE1.csv').length).toBeGreaterThanOrEqual(1)
        }, { timeout: 3000 })
        await waitFor(() => {
            const nextButton = screen.getByText('Next: Resolve Containers')
            expect(nextButton).not.toBeDisabled()
        }, { timeout: 3000 })

        fireEvent.click(screen.getByText('Next: Resolve Containers'))

        await waitFor(() => {
            expect(mockSetSearchParams).toHaveBeenCalled()
        })
        expect(screen.queryByText(/not relocated/i)).not.toBeInTheDocument()
    })

    it('execute sends only rows with barcode in move payload', async () => {
        vi.mocked(collectionsApi.listCollectionsByType).mockResolvedValue({
            data: {
                collections: [
                    { id: 1, name: 'PLATE1', barcode: null, locationId: null, itemCount: 0 }
                ]
            }
        } as any)
        vi.mocked(collectionsApi.moveContainers).mockResolvedValue({
            data: { success: true, moved: 1 }
        } as any)

        const csvContent = fullPlateCSV({ A01: 'MTX123' })
        const file = new File([csvContent], 'PLATE1.csv', { type: 'text/csv' })

        vi.mocked(collectionsApi.resolveContainers).mockResolvedValue({
            data: {
                containers: [
                    {
                        identifier: { barcode: 'MTX123' },
                        container: {
                            containerId: 3,
                            currentCollectionId: 300,
                            currentCollectionName: 'SourcePlate',
                            currentCollectionType: 'micronix_plate',
                            currentPosition: 'B02',
                            barcode: 'MTX123'
                        }
                    }
                ]
            }
        } as any)
        vi.mocked(collectionsApi.getMicronixPlate).mockResolvedValue({
            data: { plate: { id: 1, name: 'PLATE1' }, wells: {} }
        } as any)

        const { container } = await renderWithProviders(<ContainerMoveMicronix />)
        await waitFor(() => {
            const input = container.querySelector('input[type="file"]') as HTMLInputElement
            expect(input).toBeInTheDocument()
            expect(input.disabled).toBe(false)
        })

        const input = container.querySelector('input[type="file"]') as HTMLInputElement
        fireEvent.change(input, { target: { files: [file] } })

        await waitFor(() => {
            expect(screen.getByText('PLATE1.csv')).toBeInTheDocument()
        })
        await waitFor(() => {
            const nextButton = screen.getByText('Next: Resolve Containers')
            expect(nextButton).not.toBeDisabled()
        }, { timeout: 3000 })

        fireEvent.click(screen.getByText('Next: Resolve Containers'))

        await waitFor(() => {
            expect(screen.getByRole('button', { name: /execute moves/i })).toBeInTheDocument()
        }, { timeout: 5000 })
        fireEvent.click(screen.getByRole('button', { name: /execute moves/i }))

        await waitFor(() => {
            expect(collectionsApi.moveContainers).toHaveBeenCalledWith(
                expect.objectContaining({
                    moves: expect.arrayContaining([
                        expect.objectContaining({
                            identifier: { type: 'barcode', barcode: 'MTX123' },
                            targetPosition: 'A01'
                        })
                    ])
                })
            )
        })
        const moveCall = vi.mocked(collectionsApi.moveContainers).mock.calls[0][0]
        expect(moveCall.moves).toHaveLength(1)
        expect(moveCall.moves[0].identifier).toEqual({ type: 'barcode', barcode: 'MTX123' })
        expect(moveCall.moves[0].targetPosition).toBe('A01')
    })

    it('resolves micronix containers successfully using barcodes', async () => {
        const csvContent = fullPlateCSV({ A01: 'MTX123' })
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

    it('infers destination plate from filename with date suffix', async () => {
        const file = new File([fullPlateCSV()], 'PLATE1_2024-01-15.csv', { type: 'text/csv' })
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

        const { container } = await renderWithProviders(<ContainerMoveMicronix />)
        await waitFor(() => {
            expect(collectionsApi.listCollectionsByType).toHaveBeenCalled()
        })
        await waitFor(() => {
            const input = container.querySelector('input[type="file"]') as HTMLInputElement
            expect(input).toBeInTheDocument()
            expect(input.disabled).toBe(false)
        })
        // Allow useEffect promise to resolve and state to commit before uploading
        const input = container.querySelector('input[type="file"]') as HTMLInputElement
        fireEvent.change(input, { target: { files: [file] } })

        await waitFor(() => {
            expect(screen.getByText('PLATE1_2024-01-15.csv')).toBeInTheDocument()
        })
        await waitFor(() => {
            const nextButton = screen.getByText('Next: Resolve Containers')
            expect(nextButton).toBeInTheDocument()
            expect(nextButton).not.toBeDisabled()
        }, { timeout: 3000 })
        // Destination plate was auto-selected from stem (date suffix stripped); green "Inferred" box may also be shown
    })

    it('infers destination plate from filename stem with contains match', async () => {
        const file = new File([fullPlateCSV()], 'MyPlate.csv', { type: 'text/csv' })
        vi.mocked(collectionsApi.listCollectionsByType).mockResolvedValue({
            data: {
                collections: [{
                    id: 1,
                    name: 'MyPlate-001',
                    barcode: null,
                    locationId: null,
                    itemCount: 0
                }]
            }
        } as any)

        const { container } = await renderWithProviders(<ContainerMoveMicronix />)
        await waitFor(() => {
            expect(collectionsApi.listCollectionsByType).toHaveBeenCalled()
        })
        await waitFor(() => {
            const input = container.querySelector('input[type="file"]') as HTMLInputElement
            expect(input).toBeInTheDocument()
            expect(input.disabled).toBe(false)
        })
        const input = container.querySelector('input[type="file"]') as HTMLInputElement
        fireEvent.change(input, { target: { files: [file] } })

        await waitFor(() => {
            expect(screen.getByText('MyPlate.csv')).toBeInTheDocument()
        })
        await waitFor(() => {
            const nextButton = screen.getByText('Next: Resolve Containers')
            expect(nextButton).toBeInTheDocument()
            expect(nextButton).not.toBeDisabled()
        }, { timeout: 3000 })
        // Destination plate was auto-selected from stem via contains match (MyPlate-001); green "Inferred" box may also be shown
    })

    it('errors on incorrect collection types', async () => {
        const csvContent = fullPlateCSV({ A01: 'MTX123' })
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

    it('sends selected atomic mode in move payload', async () => {
        vi.mocked(collectionsApi.listCollectionsByType).mockResolvedValue({
            data: {
                collections: [{ id: 1, name: 'PLATE1', barcode: null, locationId: null, itemCount: 0 }],
            },
        } as any)
        vi.mocked(collectionsApi.resolveContainers).mockResolvedValue({
            data: {
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
            },
        } as any)
        vi.mocked(collectionsApi.moveContainers).mockResolvedValue({
            data: { success: true, moved: 1 },
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
            expect(screen.getByText('Next: Resolve Containers')).not.toBeDisabled()
        }, { timeout: 3000 })
        fireEvent.click(screen.getByText('Next: Resolve Containers'))

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
})
