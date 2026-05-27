import { useState, useEffect, useRef } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { useUser } from '../contexts/UserContext'
import ReferenceDataTable from '../components/ReferenceDataTable'
import ReferenceDataForm from '../components/ReferenceDataForm'
import {
  referenceDataConfigs,
  getReferenceDataConfig,
  type ReferenceDataType,
} from '../config/reference-data-config'
import { useStorageTypes } from '../hooks/useReferenceData'
import {
  referenceDataPageKeys,
  useReferenceDataAllLocations,
  useReferenceDataTab,
  useSpecimenTypeContainerTypes,
} from '../hooks/useReferenceDataPage'
import { specimenTypesApi } from '../lib/api/reference-data'
import type { Location, SpecimenType } from '../lib/api/types'
import { useFocusSearchOnSlash } from '../hooks/useHotkey'
import { PageError, fromQuery, getQueryErrorMessage } from '../ui'
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

  const queryClient = useQueryClient()
  const [editingItem, setEditingItem] = useState<any>(null)

  // Client-side pagination state (for locations)
  const [page, setPage] = useState(1)
  const pageSize = 50

  // Search state (for locations)
  const [search, setSearch] = useState('')
  const [searchDebounced, setSearchDebounced] = useState('')

  const tabQuery = useReferenceDataTab(activeTab, searchDebounced)
  const tabStatus = fromQuery(tabQuery)
  const data = (tabQuery.data ?? []) as unknown[]

  const allLocationsQuery = useReferenceDataAllLocations((activeTab as string) === 'locations')
  const allLocations = (allLocationsQuery.data ?? []) as Location[]

  const specimenTypeIds =
    activeTab === 'specimen-types'
      ? (data as SpecimenType[]).map((st) => st.id)
      : []
  const containerTypesQuery = useSpecimenTypeContainerTypes(
    specimenTypeIds,
    activeTab === 'specimen-types' && tabQuery.isSuccess && specimenTypeIds.length > 0
  )
  const containerTypeRelationships = containerTypesQuery.relationships
  const containerTypeUsageInfo = containerTypesQuery.usageInfo

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

  const refreshTabData = () => {
    void queryClient.invalidateQueries({
      queryKey: referenceDataPageKeys.tab(activeTab, searchDebounced),
    })
  }

  const refreshContainerTypeRelationships = () => {
    void containerTypesQuery.refetch()
  }

  const handleToggleContainerType = async (specimenTypeId: number, containerType: string, isAdding: boolean) => {
    // Block non-admin users from toggling
    if (!isAdmin) {
      return
    }

    if (isAdding) {
      await specimenTypesApi.addContainerType(specimenTypeId, containerType)
    } else {
      await specimenTypesApi.removeContainerType(specimenTypeId, containerType)
    }
    refreshContainerTypeRelationships()
  }

  useEffect(() => {
    if (tabQuery.isSuccess) {
      setPage(1)
    }
  }, [activeTab, searchDebounced, tabQuery.isSuccess])

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
      refreshTabData()
      if (activeTab === 'specimen-types') {
        refreshContainerTypeRelationships()
      }
    } catch (error: any) {
      throw error
    }
  }

  const handleDelete = async (id: number) => {
    if (config.delete) {
      await config.delete(id)
      refreshTabData()
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
          <p className="text-sm text-app-text-muted mt-1 ref-data-description">
            Manage static lookup tables and reference data used throughout the system.
            {' '}
            <a href="/docs/guides/reference-data/overview/" className="text-app-accent hover:text-app-accent-hover hover:underline">
              Reference data guide
            </a>
          </p>
        </div>

        <div className="ref-data-card ref-data-reveal ref-data-reveal-2">
          <div className="border-b border-app-border">
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
            {tabStatus === 'error' && (
              <PageError
                title={`Could not load ${config.label}`}
                message={getQueryErrorMessage(tabQuery.error, 'Failed to load reference data')}
                onRetry={() => void tabQuery.refetch()}
              />
            )}

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
                className="px-4 py-2 bg-app-accent text-white rounded-lg hover:bg-app-accent-hover"
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
            loading={tabQuery.isPending && config.requiresSearch}
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

