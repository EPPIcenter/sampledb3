import { useState, useEffect } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useUser } from '../contexts/UserContext'
import ReferenceDataTable from '../components/ReferenceDataTable'
import ReferenceDataForm from '../components/ReferenceDataForm'
import Pagination from '../components/Pagination'
import {
  referenceDataConfigs,
  getReferenceDataConfig,
  type ReferenceDataType,
} from '../config/reference-data-config'
import { useStorageTypes } from '../hooks/useReferenceData'
import { locationsApi, specimenTypesApi, type Location, type SpecimenType } from '../lib/api'

export default function ReferenceData() {
  const { user } = useUser()
  const isAdmin = user?.role === 'admin'
  const [searchParams, setSearchParams] = useSearchParams()
  const activeTab = (searchParams.get('tab') as ReferenceDataType) || 'specimen-types'

  const setActiveTab = (tab: ReferenceDataType) => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev)
      next.set('tab', tab)
      return next
    })
  }

  const config = getReferenceDataConfig(activeTab)
  if (!config) {
    return <div>Invalid tab</div>
  }

  const [editingItem, setEditingItem] = useState<any>(null)
  const [loading, setLoading] = useState(false)
  const [data, setData] = useState<any[]>([])

  // Pagination state (for locations)
  const [page, setPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const [total, setTotal] = useState(0)
  const limit = 50

  // Search state (for locations)
  const [search, setSearch] = useState('')
  const [searchDebounced, setSearchDebounced] = useState('')

  // All locations (without pagination) for parent name lookups
  const [allLocations, setAllLocations] = useState<Location[]>([])

  // Container type relationships for specimen types
  const [containerTypeRelationships, setContainerTypeRelationships] = useState<Record<number, string[]>>({})
  // Container type usage info (which types are in use and cannot be removed)
  const [containerTypeUsageInfo, setContainerTypeUsageInfo] = useState<Record<number, Record<string, boolean>>>({})

  // Load dependencies if needed
  const { data: storageTypes } = useStorageTypes()
  const [dependencies, setDependencies] = useState<Record<string, any[]>>({})

  // Debounce search input
  useEffect(() => {
    const timeoutId = setTimeout(() => {
      setSearchDebounced(search)
    }, 300)
    return () => clearTimeout(timeoutId)
  }, [search])

  // Reset pagination when switching tabs
  useEffect(() => {
    setPage(1)
    setSearch('')
    setEditingItem(null)
  }, [activeTab])

  // Reset to page 1 when search changes
  useEffect(() => {
    if (config.requiresSearch) {
      setPage(1)
    }
  }, [search, config.requiresSearch])

  // Load dependencies
  useEffect(() => {
    const loadDependencies = async () => {
      if (config.requiresDependencies) {
        const deps: Record<string, any[]> = {}
        for (const depType of config.requiresDependencies) {
          const depConfig = getReferenceDataConfig(depType)
          if (depConfig) {
            try {
              const res = await depConfig.list()
              // Handle both structures: { data: T[] } and { data: { [key]: T[] } }
              const data = res.data
              if (Array.isArray(data)) {
                // Direct array: { data: T[] }
                deps[depConfig.getDataKey()] = data
              } else if (typeof data === 'object' && data !== null) {
                // Nested structure: { data: { [key]: T[] } }
                deps[depConfig.getDataKey()] = (data as any)[depConfig.getDataKey()] || []
              } else {
                deps[depConfig.getDataKey()] = []
              }
            } catch (error) {
              console.error(`Failed to load dependency ${depType}:`, error)
            }
          }
        }
        setDependencies(deps)
      }
    }
    loadDependencies()
  }, [activeTab, config.requiresDependencies])

  // Load all locations (without pagination) for parent name lookups
  useEffect(() => {
    if ((activeTab as string) === 'locations') {
      const loadAllLocations = async () => {
        try {
          // Load all locations without pagination
          const res = await locationsApi.list()
          setAllLocations(res.data.locations || [])
        } catch (error) {
          console.error('Failed to load all locations:', error)
        }
      }
      loadAllLocations()
    } else {
      setAllLocations([])
    }
  }, [activeTab])

  // Load container type relationships for specimen types
  useEffect(() => {
    if (activeTab === 'specimen-types') {
      loadContainerTypeRelationships()
    } else {
      setContainerTypeRelationships({})
      setContainerTypeUsageInfo({})
    }
  }, [activeTab, data])

  const loadContainerTypeRelationships = async () => {
    if (activeTab !== 'specimen-types' || data.length === 0) return

    try {
      const relationships: Record<number, string[]> = {}
      const usageInfo: Record<number, Record<string, boolean>> = {}
      const specimenTypes = data as SpecimenType[]
      
      // Load container types for all specimen types in parallel
      const promises = specimenTypes.map(async (st) => {
        try {
          const response = await specimenTypesApi.getContainerTypes(st.id)
          relationships[st.id] = response.data.containerTypes || []
          // Store usage info if provided by API
          if (response.data.usageInfo) {
            usageInfo[st.id] = response.data.usageInfo
          } else {
            usageInfo[st.id] = {}
          }
        } catch (error) {
          console.error(`Failed to load container types for specimen type ${st.id}:`, error)
          relationships[st.id] = []
          usageInfo[st.id] = {}
        }
      })

      await Promise.all(promises)
      setContainerTypeRelationships(relationships)
      setContainerTypeUsageInfo(usageInfo)
    } catch (error) {
      console.error('Failed to load container type relationships:', error)
    }
  }

  const handleToggleContainerType = async (specimenTypeId: number, containerType: string, isAdding: boolean) => {
    // Block non-admin users from toggling
    if (!isAdmin) {
      return
    }

    try {
      // Optimistically update state
      setContainerTypeRelationships((prev) => {
        const current = prev[specimenTypeId] || []
        const updated = isAdding
          ? [...current, containerType]
          : current.filter((ct) => ct !== containerType)
        return { ...prev, [specimenTypeId]: updated }
      })

      // Make API call
      if (isAdding) {
        await specimenTypesApi.addContainerType(specimenTypeId, containerType)
      } else {
        await specimenTypesApi.removeContainerType(specimenTypeId, containerType)
      }

      // Refresh to ensure consistency
      await loadContainerTypeRelationships()
    } catch (error: any) {
      // Rollback on error
      await loadContainerTypeRelationships()
      const errorMessage = error.response?.data?.error || error.message || 'Failed to update container type'
      console.error('Failed to toggle container type:', errorMessage)
      throw error
    }
  }

  // Load data
  useEffect(() => {
    loadData()
  }, [activeTab, page, searchDebounced])

  const loadData = async () => {
    setLoading(true)
    try {
      if (config.requiresPagination || config.requiresSearch) {
        // Locations with pagination/search
        const res = await locationsApi.list(page, limit, searchDebounced)
        setData((res.data as any)[config.getDataKey()] || [])
        if (res.data.pagination) {
          setTotalPages(res.data.pagination.totalPages)
          setTotal(res.data.pagination.total)
        }
      } else {
        // Simple list
        // The API returns { data: [...] } or { data: { [key]: [...] } }
        const res = await config.list()
        const data = res.data
        if (Array.isArray(data)) {
          // Direct array: { data: T[] }
          setData(data)
        } else if (typeof data === 'object' && data !== null) {
          // Nested structure: { data: { [key]: T[] } }
          setData((data as any)[config.getDataKey()] || [])
        } else {
          setData([])
        }
      }
    } catch (error) {
      console.error('Failed to load data:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleSave = async (saveData: any) => {
    try {
      if (editingItem?.id) {
        if (config.update) {
          await config.update(editingItem.id, saveData)
        }
      } else {
        if (config.create) {
          await config.create(saveData)
        }
      }
      setEditingItem(null)
      await loadData()
      // Refresh container type relationships after save if on specimen types tab
      if (activeTab === 'specimen-types') {
        await loadContainerTypeRelationships()
      }
    } catch (error: any) {
      throw error
    }
  }

  const handleDelete = async (id: number) => {
    if (config.delete) {
      await config.delete(id)
      await loadData()
    }
  }

  const getColumns = () => {
    const deps: any = {}
    if (config.requiresDependencies) {
      for (const depType of config.requiresDependencies) {
        const depConfig = getReferenceDataConfig(depType)
        if (depConfig) {
          deps[depConfig.getDataKey()] = dependencies[depConfig.getDataKey()] || []
        }
      }
    }
    // Add storageTypes if needed (for locations)
    if (storageTypes) {
      deps.storageTypes = storageTypes
    }
    // Add all locations (without pagination) for parent name lookups
    if ((activeTab as string) === 'locations' && allLocations.length > 0) {
      deps.locations = allLocations
    }
    // Add container type relationships for specimen types
    if (activeTab === 'specimen-types') {
      deps.containerTypeRelationships = containerTypeRelationships
      deps.containerTypeUsageInfo = containerTypeUsageInfo
      deps.onToggleContainerType = isAdmin ? handleToggleContainerType : undefined
      deps.containerTypesDisabled = !isAdmin
    }
    return config.getColumns(deps)
  }

  const getFormFields = () => {
    // Pass editingItem as both the editing item and initial form data
    // The form component will manage its own formData state, but this gives
    // getFormFields the initial values to compute conditional fields
    const deps: any = {}
    if (activeTab === 'specimen-types') {
      deps.containerTypeRelationships = containerTypeRelationships
      deps.containerTypeUsageInfo = containerTypeUsageInfo
      deps.onToggleContainerType = isAdmin ? handleToggleContainerType : undefined
      deps.containerTypesDisabled = !isAdmin
    }
    return config.getFormFields(editingItem, editingItem, deps)
  }

  const getTitle = () => {
    return editingItem ? `Edit ${config.label}` : `Add ${config.label}`
  }

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="mb-6">
        <h1 className="text-3xl font-bold text-gray-900">Reference Data Management</h1>
        <p className="text-sm text-gray-600 mt-1">
          Manage static lookup tables and reference data used throughout the system
        </p>
      </div>

      <div className="bg-white rounded-lg shadow">
        <div className="border-b border-gray-100">
          <nav className="flex -mb-px">
            {referenceDataConfigs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => {
                  setActiveTab(tab.id)
                  setEditingItem(null)
                }}
                className={`px-6 py-3 text-sm font-medium border-b-2 ${activeTab === tab.id
                    ? 'border-blue-500 text-blue-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-200'
                  }`}
              >
                {tab.label}
              </button>
            ))}
          </nav>
        </div>

        <div className="p-6">
          {!isAdmin && (
            <div className="mb-4 rounded-md bg-blue-50 border border-blue-200 p-3">
              <div className="flex items-center gap-2">
                <svg className="w-5 h-5 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <p className="text-sm font-medium text-blue-800">
                  Reference data is view-only. Contact an administrator to add or modify reference data.
                </p>
              </div>
            </div>
          )}

          <div className="mb-4 flex justify-end">
            {isAdmin && (
              <button
                onClick={() => setEditingItem({})}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
              >
                Add New
              </button>
            )}
          </div>

          <ReferenceDataTable
            data={data}
            columns={getColumns()}
            onEdit={setEditingItem}
            onDelete={handleDelete}
            searchPlaceholder={`Search ${config.label}...`}
            emptyMessage={`No ${config.label} found`}
            search={config.requiresSearch ? search : undefined}
            onSearchChange={config.requiresSearch ? setSearch : undefined}
            disableClientFilter={config.requiresSearch}
            loading={loading && config.requiresSearch}
            readOnly={!isAdmin}
          />

          {config.requiresPagination && totalPages > 1 && (
            <Pagination
              currentPage={page}
              totalPages={totalPages}
              totalItems={total}
              itemsPerPage={limit}
              onPageChange={setPage}
            />
          )}
        </div>
      </div>

      {editingItem !== null && isAdmin && (
        <ReferenceDataForm
          item={editingItem}
          fields={getFormFields()}
          onSave={handleSave}
          onCancel={() => setEditingItem(null)}
          title={getTitle()}
        />
      )}
    </div>
  )
}

