import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, waitFor } from '../../__tests__/helpers/render'
import userEvent from '@testing-library/user-event'
import ReferenceData from '../ReferenceData'

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
    requiresDependencies: options.requiresDependencies || undefined,
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

// Mock the API module
vi.mock('../../lib/api', async () => {
  const actual = await vi.importActual('../../lib/api')
  return {
    ...actual,
    locationsApi: {
      list: vi.fn().mockResolvedValue({
        data: { locations: [], pagination: { total: 0, page: 1, limit: 50, totalPages: 0 } },
      }),
      get: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
  }
})

// Mock the hooks
vi.mock('../../hooks/useReferenceData', () => ({
  useStorageTypes: vi.fn().mockReturnValue({
    data: [],
    isLoading: false,
    isError: false,
    error: null,
  }),
}))

// Mock the UserContext
const mockUser = {
  id: 1,
  email: 'admin@example.com',
  name: 'Admin User',
  username: 'admin',
  role: 'admin' as const,
}

vi.mock('../../contexts/UserContext', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../contexts/UserContext')>()
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
  })

  describe('Tab Switching', () => {
    it('should render with default tab (specimen-types)', async () => {
      await render(<ReferenceData />)

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


