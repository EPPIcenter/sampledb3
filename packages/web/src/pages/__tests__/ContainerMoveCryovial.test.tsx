/**
 * Wiring smoke tests for the cryovial scan move page (ADR 0008).
 *
 * Workflow scenarios (CSV parsing/validation, resolve grouping, move
 * planning, destination creation) are covered by plain-data unit tests in
 * src/lib/scan-move/__tests__. These tests only assert that the page wires
 * the hook, bootstrap queries, URL step, and gateway calls together.
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

import ContainerMoveCryovial from '../ContainerMoveCryovial'
import { collectionsApi } from '../../lib/api/collections'
import { locationsApi } from '../../lib/api/locations'

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
vi.mock('../../lib/api/locations', async () => {
  const { createMockedDomainModule } = await import('../../__tests__/helpers/mock-api')
  return createMockedDomainModule('locations', {
    authApi: {
        getCurrentUser: vi.fn().mockResolvedValue({ user: { id: 1, email: 'admin@test.com', name: 'Admin', role: 'admin' } }),
    },
    collectionsApi: {
        resolveContainers: vi.fn(),
        listCollectionsByType: vi.fn(),
        moveContainers: vi.fn()
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
        resolveContainers: vi.fn(),
        listCollectionsByType: vi.fn(),
        moveContainers: vi.fn(),
        createCryovialBox: vi.fn()
    },
    locationsApi: {
        list: vi.fn()
    }
})
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

vi.mock('../../lib/api/auth', async () => {
  const { createMockedDomainModule } = await import('../../__tests__/helpers/mock-api')
  return createMockedDomainModule('auth', {
    authApi: {
        getCurrentUser: vi.fn().mockResolvedValue({ user: { id: 1, email: 'admin@test.com', name: 'Admin', role: 'admin' } }),
    },
    collectionsApi: {
        resolveContainers: vi.fn(),
        listCollectionsByType: vi.fn(),
        moveContainers: vi.fn()
    },
    locationsApi: {
        list: vi.fn()
    },
  })
})

describe('ContainerMoveCryovial', () => {
    beforeEach(() => {
        vi.clearAllMocks()
        initialSearchParams = new URLSearchParams()
        vi.mocked(collectionsApi.listCollectionsByType).mockResolvedValue({ collections: [] } as any)
        vi.mocked(locationsApi.list).mockResolvedValue({ locations: [] } as any)
    })

    it('renders upload step initially', async () => {
        vi.mocked(collectionsApi.listCollectionsByType).mockResolvedValue({ collections: [] } as any)
        vi.mocked(locationsApi.list).mockResolvedValue({ locations: [] } as any)
        
        await renderWithProviders(<ContainerMoveCryovial />)
        
        await waitFor(() => {
            expect(screen.getByText('Move Cryovial Tubes')).toBeInTheDocument()
        })
        
        await waitFor(() => {
            expect(screen.getByText('Upload CSV Files')).toBeInTheDocument()
        })
    })

    it('shows PageError with retry when bootstrap load fails', async () => {
        vi.mocked(collectionsApi.listCollectionsByType).mockRejectedValue(new Error('fail'))
        await renderWithProviders(<ContainerMoveCryovial />)
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

        await renderWithProviders(<ContainerMoveCryovial />)

        await waitFor(() => {
            expect(screen.getByText('Upload CSV Files')).toBeInTheDocument()
        })
        expect(mockSetSearchParams).toHaveBeenCalledWith(expect.any(Function))
        const updater = mockSetSearchParams.mock.calls[0][0] as (prev: URLSearchParams) => URLSearchParams
        const next = updater(new URLSearchParams())
        expect(next.get('step')).toBe('upload')
    })

    it('clears file input value when a file is removed', async () => {
        vi.mocked(collectionsApi.listCollectionsByType).mockResolvedValue({ collections: [{ id: 1, name: 'BOX1', barcode: null, locationId: null, itemCount: 0 }] } as any)
        vi.mocked(locationsApi.list).mockResolvedValue({ locations: [] } as any)

        const csvContent = 'source_collection_name,source_position,target_position\nBOX1,A1,B1'
        const file = new File([csvContent], 'BOX1.csv', { type: 'text/csv' })
        Object.defineProperty(file, 'text', { value: async () => csvContent })

        const { container } = await renderWithProviders(<ContainerMoveCryovial />)
        await waitFor(() => {
            const input = container.querySelector('input[type="file"]') as HTMLInputElement
            expect(input).toBeInTheDocument()
            expect(input.disabled).toBe(false)
        })

        const fileInput = container.querySelector('input[type="file"]') as HTMLInputElement
        fireEvent.change(fileInput, { target: { files: [file] } })

        await waitFor(() => {
            expect(screen.getByText('BOX1.csv')).toBeInTheDocument()
        })

        fireEvent.click(screen.getByRole('button', { name: /^Remove$/i }))

        await waitFor(() => {
            expect(screen.queryByText('BOX1.csv')).not.toBeInTheDocument()
        })

        const inputAfterRemove = container.querySelector('input[type="file"]') as HTMLInputElement
        expect(inputAfterRemove.value).toBe('')
    })

    it('clears resolution state when destination box is changed', async () => {
        vi.mocked(collectionsApi.listCollectionsByType).mockResolvedValue({
                collections: [
                    { id: 1, name: 'BOX1', barcode: null, locationId: 1, itemCount: 0, location: { path: '/Loc1' } },
                    { id: 2, name: 'BOX2', barcode: null, locationId: 1, itemCount: 0, location: { path: '/Loc1' } },
                ],
            } as any)
        vi.mocked(locationsApi.list).mockResolvedValue({ locations: [{ id: 1, name: 'Loc1', path: '/Loc1', parentId: null }] } as any)
        vi.mocked(collectionsApi.resolveContainers).mockResolvedValue({
                containers: [
                    {
                        identifier: { sourceCollectionName: 'BOX1', sourcePosition: 'A1' },
                        container: {
                            containerId: 2,
                            currentCollectionId: 200,
                            currentCollectionName: 'BOX1',
                            currentCollectionType: 'cryovial_box',
                            currentPosition: 'A1',
                        },
                    },
                ],
            } as any)

        const csvContent = 'source_collection_name,source_position,target_position\nBOX1,A1,B1'
        const file = new File([csvContent], 'data.csv', { type: 'text/csv' })
        Object.defineProperty(file, 'text', { value: async () => csvContent })

        const { container } = await renderWithProviders(<ContainerMoveCryovial />)
        await waitFor(() => {
            const input = container.querySelector('input[type="file"]') as HTMLInputElement
            expect(input.disabled).toBe(false)
        })

        fireEvent.change(container.querySelector('input[type="file"]') as HTMLInputElement, { target: { files: [file] } })

        await waitFor(() => {
            expect(screen.getByText('data.csv')).toBeInTheDocument()
        })

        fireEvent.click(screen.getByText('Select target box...'))
        await waitFor(() => {
            expect(screen.getByText('Select Cryovial Box')).toBeInTheDocument()
        })
        fireEvent.click(screen.getByRole('button', { name: /BOX1 0 items/ }))

        await waitFor(() => {
            expect(screen.getByText('Next: Resolve Containers')).not.toBeDisabled()
        }, { timeout: 3000 })

        fireEvent.click(screen.getByText('Next: Resolve Containers'))

        await waitFor(() => {
            expect(collectionsApi.resolveContainers).toHaveBeenCalledTimes(1)
        }, { timeout: 5000 })

        // Change destination box: go back to upload, reopen picker, select BOX2
        fireEvent.click(screen.getByRole('button', { name: /^Back$/i }))
        await waitFor(() => {
            expect(screen.getByText('Next: Resolve Containers')).toBeInTheDocument()
        })
        fireEvent.click(screen.getByRole('button', { name: /BOX1/ }))
        await waitFor(() => {
            expect(screen.getByText('Select Cryovial Box')).toBeInTheDocument()
        })
        fireEvent.click(screen.getByRole('button', { name: /BOX2 0 items/ }))

        fireEvent.click(screen.getByText('Next: Resolve Containers'))

        await waitFor(() => {
            expect(collectionsApi.resolveContainers).toHaveBeenCalledTimes(2)
        }, { timeout: 5000 })
    })

    it('validates CSV columns specific to cryovials', async () => {
        vi.mocked(collectionsApi.listCollectionsByType).mockResolvedValue({ collections: [] } as any)
        vi.mocked(locationsApi.list).mockResolvedValue({ locations: [] } as any)
        
        const { container } = await renderWithProviders(<ContainerMoveCryovial />)
        
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

        // Filename matches no box, so it is auto-proposed as a new box and the
        // button routes through the create step.
        await waitFor(() => {
            expect(screen.getByRole('button', { name: /^Next:/ })).toBeInTheDocument()
        })

        const nextButton = screen.getByRole('button', { name: /^Next:/ })
        fireEvent.click(nextButton)

        await waitFor(() => {
            expect(screen.getByText(/source_collection_name is required/i)).toBeInTheDocument()
        })
    })

    it('resolves cryovial containers successfully', async () => {
        // Mock a box that matches the filename so it auto-selects
        vi.mocked(collectionsApi.listCollectionsByType).mockResolvedValue({ 
                collections: [{ 
                    id: 1, 
                    name: 'cryo', 
                    barcode: null, 
                    locationId: null,
                    itemCount: 0,
                    location: null
                }] 
            } as any)
        vi.mocked(locationsApi.list).mockResolvedValue({ locations: [] } as any)
        
        const csvContent = 'source_collection_name,source_position,target_position\nCRYO1,A1,B1'
        const file = new File([csvContent], 'cryo.csv', { type: 'text/csv' })

        vi.mocked(collectionsApi.resolveContainers).mockResolvedValue({
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
            } as any)

        const { container } = await renderWithProviders(<ContainerMoveCryovial />)

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

    it('sends selected atomic mode in move payload', async () => {
        vi.mocked(collectionsApi.listCollectionsByType).mockResolvedValue({
                collections: [
                    { id: 1, name: 'BOX1', barcode: null, locationId: 1, itemCount: 0, location: { path: '/Loc1' } },
                ],
            } as any)
        vi.mocked(locationsApi.list).mockResolvedValue({ locations: [{ id: 1, name: 'Loc1', path: '/Loc1', parentId: null }] } as any)
        vi.mocked(collectionsApi.resolveContainers).mockResolvedValue({
                containers: [
                    {
                        identifier: { sourceCollectionName: 'BOX1', sourcePosition: 'A1' },
                        container: {
                            containerId: 2,
                            currentCollectionId: 1,
                            currentCollectionName: 'BOX1',
                            currentCollectionType: 'cryovial_box',
                            currentPosition: 'A1',
                        },
                    },
                ],
            } as any)
        vi.mocked(collectionsApi.moveContainers).mockResolvedValue({ success: true, moved: 1 } as any)

        const csvContent = 'source_collection_name,source_position,target_position\nBOX1,A1,B1'
        const file = new File([csvContent], 'BOX1.csv', { type: 'text/csv' })
        Object.defineProperty(file, 'text', { value: async () => csvContent })

        const { container } = await renderWithProviders(<ContainerMoveCryovial />)
        await waitFor(() => {
            const input = container.querySelector('input[type="file"]') as HTMLInputElement
            expect(input.disabled).toBe(false)
        })

        fireEvent.change(container.querySelector('input[type="file"]') as HTMLInputElement, { target: { files: [file] } })
        await waitFor(() => expect(screen.getByText('BOX1.csv')).toBeInTheDocument())
        await waitFor(() => {
            expect(screen.getByText('Next: Resolve Containers')).not.toBeDisabled()
        }, { timeout: 3000 })
        fireEvent.click(screen.getByText('Next: Resolve Containers'))

        await waitFor(() => {
            expect(screen.getByText('Resolved Cryovial Tubes')).toBeInTheDocument()
        })

        const bestEffort = screen.getByRole('radio', { name: /best effort/i })
        fireEvent.click(bestEffort)

        fireEvent.click(screen.getByRole('button', { name: /execute moves/i }))

        await waitFor(() => {
            expect(collectionsApi.moveContainers).toHaveBeenCalledWith(
                expect.objectContaining({
                    collectionType: 'cryovial_box',
                    atomicMode: 'best_effort',
                })
            )
        })
    })

    it('creates destination box and continues to resolve', async () => {
        vi.mocked(collectionsApi.listCollectionsByType)
            .mockResolvedValueOnce({ collections: [] } as any)
            .mockResolvedValue({ collections: [{ id: 42, name: 'NEW-BOX', barcode: null, locationId: 99, itemCount: 0 }] } as any)
        vi.mocked(collectionsApi.createCryovialBox).mockResolvedValue({
            box: { id: 42, name: 'NEW-BOX', locationId: 99 },
        } as any)
        vi.mocked(collectionsApi.resolveContainers).mockResolvedValue({
            containers: [
                {
                    identifier: { sourceCollectionName: 'BOX1', sourcePosition: 'A1' },
                    container: {
                        containerId: 2,
                        currentCollectionId: 200,
                        currentCollectionName: 'BOX1',
                        currentCollectionType: 'cryovial_box',
                        currentPosition: 'A1',
                    },
                },
            ],
        } as any)

        const csvContent = 'source_collection_name,source_position,target_position\nBOX1,A1,B1'
        const file = new File([csvContent], 'NEW-BOX.csv', { type: 'text/csv' })
        Object.defineProperty(file, 'text', { value: async () => csvContent })

        const { container } = await renderWithProviders(<ContainerMoveCryovial />)
        await waitFor(() => {
            const input = container.querySelector('input[type="file"]') as HTMLInputElement
            expect(input.disabled).toBe(false)
        })

        fireEvent.change(container.querySelector('input[type="file"]') as HTMLInputElement, {
            target: { files: [file] },
        })

        await waitFor(() => {
            expect(screen.getByText('NEW-BOX.csv')).toBeInTheDocument()
            expect(screen.getByText(/New box "NEW-BOX"/i)).toBeInTheDocument()
        })

        fireEvent.click(screen.getByRole('button', { name: /Next: Create Destination Boxes/i }))

        await waitFor(() => {
            expect(screen.getByRole('heading', { name: 'Create Destination Boxes' })).toBeInTheDocument()
        })
        expect(collectionsApi.resolveContainers).not.toHaveBeenCalled()

        fireEvent.click(screen.getByRole('button', { name: /Select location/i }))
        fireEvent.click(screen.getByRole('button', { name: /Create Boxes & Continue/i }))

        await waitFor(() => {
            expect(collectionsApi.createCryovialBox).toHaveBeenCalledWith({
                name: 'NEW-BOX',
                locationId: 99,
                barcode: undefined,
            })
            expect(screen.getByText('Resolved Cryovial Tubes')).toBeInTheDocument()
        })
    })
})
