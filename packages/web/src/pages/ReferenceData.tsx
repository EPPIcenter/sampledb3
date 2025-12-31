import { useState, useEffect } from 'react'
import { useSearchParams } from 'react-router-dom'
import ReferenceDataTable from '../components/ReferenceDataTable'
import ReferenceDataForm from '../components/ReferenceDataForm'
import Pagination from '../components/Pagination'
import {
  referenceDataConfigs,
  getReferenceDataConfig,
  type ReferenceDataType,
} from '../config/reference-data-config'
import { useStorageTypes } from '../hooks/useReferenceData'
import { locationsApi } from '../lib/api'

export default function ReferenceData() {
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
              deps[depConfig.getDataKey()] = res.data[depConfig.getDataKey()] || []
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
        const res = await config.list()
        setData(res.data[config.getDataKey()] || [])
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
        await config.update(editingItem.id, saveData)
      } else {
        await config.create(saveData)
      }
      setEditingItem(null)
      await loadData()
    } catch (error: any) {
      throw error
    }
  }

  const handleDelete = async (id: number) => {
    await config.delete(id)
    await loadData()
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
    return config.getColumns(deps)
  }

  const getFormFields = () => {
    return config.getFormFields(editingItem)
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
          <div className="mb-4 flex justify-end">
            <button
              onClick={() => setEditingItem({})}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
            >
              Add New
            </button>
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

      {editingItem !== null && (
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

