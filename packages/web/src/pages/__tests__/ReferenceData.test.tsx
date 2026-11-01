import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, waitFor } from '../../__tests__/helpers/render'
import userEvent from '@testing-library/user-event'
import ReferenceData from '../ReferenceData'
import { getReferenceDataConfig } from '../../config/reference-data-config'
import { specimenTypeKeys, tagKeys } from '../../hooks/useReferenceData'
import { referenceDataPageKeys } from '../../hooks/useReferenceDataPage'
import { exportWorkflowKeys } from '../../hooks/useExportWorkflow'
import {
  createInvalidationTestClient,
  keysNotInvalidated,
  observeQuery,
  seedQueries,
} from '../../__tests__/helpers/query-invalidation'

const mockUseReferenceDataTab = vi.hoisted(() =>
  vi.fn(() => ({
    data: [],
    isPending: false,
    isLoading: false,
    isError: false,
    isSuccess: true,
    error: null,
    refetch: vi.fn(),
  }))
)

vi.mock('../../hooks/useReferenceDataPage', async () => {
  const actual = await vi.importActual<typeof import('../../hooks/useReferenceDataPage')>(
    '../../hooks/useReferenceDataPage'
  )
  return {
    ...actual,
    useReferenceDataTab: mockUseReferenceDataTab,
    useReferenceDataAllLocations: vi.fn(() => ({
      data: [],
      isPending: false,
      isError: false,
      isSuccess: true,
    })),
    useSpecimenTypeContainerTypes: vi.fn(() => ({
      relationships: {},
      usageInfo: {},
      isPending: false,
      isFetching: false,
      refetch: vi.fn(),
    })),
  }
})

// Mock the config module
vi.mock('../../config/reference-data-config', () => {
  const createMockConfig = (id: string, label: string, options: any = {}) => ({
    id,
    label,
    list: vi.fn().mockResolvedValue({
      data: { [options.dataKey || `${id.replace('-', '')}`]: [] },
      ...(options.pagination && { pagination: options.pagination }),
    }),
    get: vi.fn(),
    create: vi.fn().mockResolvedValue({}),
    update: vi.fn().mockResolvedValue({}),
    delete: vi.fn().mockResolvedValue({}),
    getDataKey: () => options.dataKey || `${id.replace('-', '')}`,
    getItemKey: () => options.itemKey || id.replace('-', ''),
    getColumns: vi.fn().mockReturnValue([]),
    getFormFields: vi.fn().mockReturnValue([]),
    requiresPagination: options.requiresPagination || false,
    requiresSearch: options.requiresSearch || false,
  })

  const mockSpecimenTypesConfig = createMockConfig('specimen-types', 'Specimen Types', {
    dataKey: 'specimenTypes',
  })
  const mockStatesConfig = createMockConfig('states', 'States', {
    dataKey: 'states',
  })
  const mockLocationsConfig = createMockConfig('locations', 'Locations', {
    dataKey: 'locations',
    requiresPagination: true,
    requiresSearch: true,
    pagination: { total: 0, page: 1, limit: 50, totalPages: 0 },
  })

  return {
    referenceDataConfigs: [
      mockSpecimenTypesConfig,
      mockStatesConfig,
      mockLocationsConfig,
    ],
    getReferenceDataConfig: (key: string) => {
      const configs: any = {
        'specimen-types': mockSpecimenTypesConfig,
        'states': mockStatesConfig,
        'locations': mockLocationsConfig,
      }
      return configs[key]
    },
  }
})

vi.mock('../../lib/api/locations', async () => {
  const { createMockedDomainModule } = await import('../../__tests__/helpers/mock-api')
  const { referenceDataLocationsMock } = await import('../../__tests__/helpers/mock-api-templates')
  return createMockedDomainModule('locations', referenceDataLocationsMock())
})

// Mock the hooks
vi.mock('../../hooks/useReferenceData', async () => {
  const actual = await vi.importActual<typeof import('../../hooks/useReferenceData')>(
    '../../hooks/useReferenceData'
  )
  return {
    ...actual,
    useStorageTypes: vi.fn().mockReturnValue({
      data: [],
      isLoading: false,
      isError: false,
      error: null,
    }),
  }
})

// Mock the UserContext
const mockUser = {
  id: 1,
  email: 'admin@example.com',
  name: 'Admin User',
  username: 'admin',
  role: 'admin' as const,
}

vi.mock('../../contexts/UserContext', async () => {
  const actual = await vi.importActual<typeof import('../../contexts/UserContext')>('../../contexts/UserContext')
  return {
    ...actual,
    useUser: () => ({
      user: mockUser,
      setUser: vi.fn(),
      refreshUser: vi.fn(),
      loading: false,
      error: null,
      canManageReferenceData: true,
    }),
  }
})

describe('ReferenceData Page', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockUseReferenceDataTab.mockReturnValue({
      data: [],
      isPending: false,
      isLoading: false,
      isError: false,
      isSuccess: true,
      error: null,
      refetch: vi.fn(),
    })
  })

  describe('Tab Switching', () => {
    it('should render with default tab (specimen-types)', async () => {
      await render(<ReferenceData />, { initialEntries: ['/reference-data?tab=specimen-types'] })

      await waitFor(() => {
        expect(screen.getByText('Reference Data Management')).toBeInTheDocument()
      })
      expect(screen.getByText('Specimen Types')).toBeInTheDocument()
    })

    it('should switch tabs when tab button is clicked', async () => {
      const user = userEvent.setup()
      
      await render(<ReferenceData />)

      const statesTab = screen.getByText('States')
      await user.click(statesTab)

      // Tab should be active (check for active styling or content)
      expect(statesTab).toBeInTheDocument()
    })
  })

  describe('Data Loading', () => {
    it('renders specimen-types tab with Reference Data Management heading', async () => {
      await render(<ReferenceData />)
      await waitFor(() => {
        expect(screen.getByText('Reference Data Management')).toBeInTheDocument()
      })
    })

    it('shows PageError with retry when tab load fails', async () => {
      mockUseReferenceDataTab.mockReturnValue({
        data: undefined,
        isPending: false,
        isLoading: false,
        isError: true,
        isSuccess: false,
        error: new Error('fail'),
        refetch: vi.fn(),
      } as unknown as ReturnType<typeof mockUseReferenceDataTab>)
      await render(<ReferenceData />, { initialEntries: ['/reference-data?tab=specimen-types'] })
      await waitFor(() => {
        expect(screen.getByRole('alert')).toBeInTheDocument()
        expect(screen.getByText(/Could not load specimen types/i)).toBeInTheDocument()
        expect(screen.getByRole('button', { name: /try again/i })).toBeInTheDocument()
      })
    })
  })

  describe('Form Operations', () => {
    it('should open form when Add New button is clicked', async () => {
      const user = userEvent.setup()
      
      await render(<ReferenceData />)

      const addButton = screen.getByText('Add New')
      await user.click(addButton)

      // Form should be visible - simplified check
      await waitFor(() => {
        const cancelButton = screen.queryByText('Cancel')
        expect(cancelButton).toBeInTheDocument()
      })
    })

    it('should close form when cancel is clicked', async () => {
      const user = userEvent.setup()
      
      await render(<ReferenceData />)

      const addButton = screen.getByText('Add New')
      await user.click(addButton)

      await waitFor(() => {
        expect(screen.getByText('Cancel')).toBeInTheDocument()
      })

      const cancelButton = screen.getByText('Cancel')
      await user.click(cancelButton)

      await waitFor(() => {
        expect(screen.queryByText('Cancel')).not.toBeInTheDocument()
      })
    })
  })

  describe('Refreshing other pages', () => {
    /** Pages outside Reference Data that list Reference data: the export Tag filter and the Specimen form's specimen types. */
    const otherPages = [
      [...exportWorkflowKeys.referenceData(), 'tags'],
      specimenTypeKeys.list(),
      tagKeys.list(),
    ]

    it('invalidates the export Tag filter and Specimen form after saving a new item', async () => {
      const user = userEvent.setup()
      const queryClient = createInvalidationTestClient()
      seedQueries(queryClient, otherPages)
      await render(<ReferenceData />, { queryClient, initialEntries: ['/reference-data?tab=specimen-types'] })

      await user.click(screen.getByText('Add New'))
      // The add form labels its submit button Update, since the page passes it an empty item.
      await user.click(await screen.findByRole('button', { name: /^(Create|Update)$/ }))

      await waitFor(() => expect(getReferenceDataConfig('specimen-types')?.create).toHaveBeenCalled())
      await waitFor(() => expect(keysNotInvalidated(queryClient, otherPages)).toEqual([]))
    })

    it("invalidates other pages after a delete without refetching the deleted item's queries", async () => {
      const user = userEvent.setup()
      vi.spyOn(window, 'confirm').mockReturnValue(true)
      mockUseReferenceDataTab.mockReturnValue({
        data: [{ id: 3, name: 'Plasma' }],
        isPending: false,
        isLoading: false,
        isError: false,
        isSuccess: true,
        error: null,
        refetch: vi.fn(),
      } as unknown as ReturnType<typeof mockUseReferenceDataTab>)
      const queryClient = createInvalidationTestClient()
      const tags = await observeQuery(queryClient, tagKeys.list())
      const deletedDetail = await observeQuery(queryClient, specimenTypeKeys.detail(3))
      const deletedContainerTypes = await observeQuery(queryClient, referenceDataPageKeys.containerTypes(3))
      await render(<ReferenceData />, { queryClient, initialEntries: ['/reference-data?tab=specimen-types'] })

      await user.click(screen.getByRole('button', { name: 'Delete' }))

      await waitFor(() => expect(getReferenceDataConfig('specimen-types')?.delete).toHaveBeenCalledWith(3))
      await waitFor(() => expect(tags.queryFn).toHaveBeenCalledTimes(2))
      expect(deletedDetail.queryFn).toHaveBeenCalledTimes(1)
      expect(deletedContainerTypes.queryFn).toHaveBeenCalledTimes(1)
      expect(queryClient.getQueryState(specimenTypeKeys.detail(3))?.isInvalidated).toBe(true)
      for (const observed of [tags, deletedDetail, deletedContainerTypes]) observed.unsubscribe()
    })
  })

  describe('Locations Tab', () => {
    it('renders locations tab when clicked', async () => {
      const user = userEvent.setup()
      await render(<ReferenceData />)
      const locationsTab = screen.getByText('Locations')
      await user.click(locationsTab)
      expect(locationsTab).toBeInTheDocument()
    })
  })
})


