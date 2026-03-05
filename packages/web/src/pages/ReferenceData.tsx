import { useState, useEffect, useRef } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useUser } from '../contexts/UserContext'
import ReferenceDataTable from '../components/ReferenceDataTable'
import ReferenceDataForm from '../components/ReferenceDataForm'
import {
  referenceDataConfigs,
  getReferenceDataConfig,
  type ReferenceDataType,
} from '../config/reference-data-config'
import { useStorageTypes } from '../hooks/useReferenceData'
import { locationsApi, specimenTypesApi, type Location, type SpecimenType } from '../lib/api'
import { useFocusSearchOnSlash } from '../hooks/useHotkey'
import '../styles/reference-data.css'

export default function ReferenceData() {
  const { canManageReferenceData } = useUser()
  const [searchParams, setSearchParams] = useSearchParams()
  // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- tab from URL may be missing or invalid
  const activeTab = (searchParams.get('tab') as ReferenceDataType) || 'specimen-types'
  // Keep isAdmin for backward compatibility in this file (used in multiple places)
  const isAdmin = canManageReferenceData

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

  // Client-side pagination state (for locations)
  const [page, setPage] = useState(1)
  const pageSize = 50

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

  // Reset pagination/search/editing when tab or search changes (adjust during render)
  const prevTabRef = useRef(activeTab)
  const prevSearchRef = useRef(search)
  const searchInputRef = useRef<HTMLInputElement>(null)
  useFocusSearchOnSlash(searchInputRef)
   
  if (prevTabRef.current !== activeTab) {
    prevTabRef.current = activeTab
    prevSearchRef.current = ''
    setPage(1)
    setSearch('')
    setEditingItem(null)
  }
  if (config.requiresSearch && prevSearchRef.current !== search) {
    prevSearchRef.current = search
    setPage(1)
  }

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
              } else if (
                // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- API can return object shape at runtime
                typeof data === 'object' && data !== null
              ) {
                // Nested structure: { data: { [key]: T[] } }; key may be missing at runtime
                deps[depConfig.getDataKey()] = ((data as Record<string, unknown>)[depConfig.getDataKey()] as unknown[] | undefined) ?? []
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
          setAllLocations(res.data.locations)
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
          relationships[st.id] = response.data.containerTypes
          usageInfo[st.id] = response.data.usageInfo ?? {}
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
        const current = prev[specimenTypeId] ?? []
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
  }, [activeTab, searchDebounced])

  const loadData = async () => {
    setLoading(true)
    try {
      if (config.requiresPagination || config.requiresSearch) {
        // Locations - load all (no pagination params = return all)
        const res = await locationsApi.list(undefined, undefined, searchDebounced)
        setData((res.data as any)[config.getDataKey()] || [])
        setPage(1) // Reset to first page when data changes
      } else {
        // Simple list
        // The API returns { data: [...] } or { data: { [key]: [...] } }
        const res = await config.list()
        const data = res.data
        if (Array.isArray(data)) {
          // Direct array: { data: T[] }
          setData(data)
          // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- API can return object shape at runtime
        } else if (typeof data === 'object' && data !== null) {
          // Nested structure: { data: { [key]: T[] } }; key may be missing at runtime
          setData(((data as Record<string, unknown>)[config.getDataKey()] as unknown[] | undefined) ?? [])
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
          deps[depConfig.getDataKey()] = (dependencies[depConfig.getDataKey()] as unknown[] | undefined) ?? []
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
    <div className="reference-data-page">
      <div className="container mx-auto px-4 py-8 relative z-10">
        <div className="mb-6 ref-data-reveal ref-data-reveal-1">
          <h1 className="text-3xl font-bold">Reference Data Management</h1>
          <p className="text-sm text-gray-600 mt-1 ref-data-description">
            Manage static lookup tables and reference data used throughout the system.
            {' '}
            <a href="/docs/guides/reference-data/overview/" className="text-blue-600 hover:text-blue-800 hover:underline">
              Reference data guide
            </a>
          </p>
        </div>

        <div className="ref-data-card ref-data-reveal ref-data-reveal-2">
          <div className="border-b border-gray-100">
            <nav className="flex -mb-px">
              {referenceDataConfigs.map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => {
                    setActiveTab(tab.id)
                    setEditingItem(null)
                  }}
                  className={`px-6 py-3 text-sm font-medium border-b-2 ref-data-tab ${activeTab === tab.id ? 'ref-data-tab-active border-b-2' : 'border-transparent'}`}
                >
                  {tab.label}
                </button>
              ))}
            </nav>
          </div>

          <div className="p-6">
            {!canManageReferenceData && (
              <div className="mb-4 rounded-md ref-data-notice p-3">
                <div className="flex items-center gap-2">
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <p className="text-sm font-medium">
                    Reference data is view-only. Contact an administrator to add or modify reference data.
                  </p>
                </div>
              </div>
            )}

          <div className="mb-4 flex justify-end">
            {canManageReferenceData && (
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
            readOnly={!canManageReferenceData}
            pagination={config.requiresPagination ? {
              page,
              pageSize,
              onPageChange: setPage,
              showPagination: true,
            } : undefined}
            searchInputRef={searchInputRef}
          />
          </div>
        </div>

        {editingItem !== null && canManageReferenceData && (
          <ReferenceDataForm
            key={editingItem?.id ?? 'new'}
            item={editingItem}
            fields={getFormFields()}
            onSave={handleSave}
            onCancel={() => setEditingItem(null)}
            title={getTitle()}
            modalClassName="reference-data-form-modal"
          />
        )}
      </div>
    </div>
  )
}

