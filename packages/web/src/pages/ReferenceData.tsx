import { useState, useEffect } from 'react'
import { useSearchParams } from 'react-router-dom'
import ReferenceDataTable from '../components/ReferenceDataTable'
import ReferenceDataForm from '../components/ReferenceDataForm'
import Pagination from '../components/Pagination'
import {
  specimenTypesApi,
  statesApi,
  storageTypesApi,
  sampleTypesApi,
  strainsApi,
  compositionsApi,
  locationsApi,
  type SpecimenType,
  type State,
  type StorageType,
  type SampleType,
  type Strain,
  type Composition,
  type Location,
} from '../lib/api'

type TabType =
  | 'specimen-types'
  | 'locations'
  | 'states'
  | 'storage-types'
  | 'sample-types'
  | 'strains'
  | 'compositions'

const tabs: Array<{ id: TabType; label: string }> = [
  { id: 'specimen-types', label: 'Specimen Types' },
  { id: 'locations', label: 'Locations' },
  { id: 'states', label: 'States' },
  { id: 'storage-types', label: 'Storage Types' },
  { id: 'sample-types', label: 'Sample Types' },
  { id: 'strains', label: 'Strains' },
  { id: 'compositions', label: 'Compositions' },
]

export default function ReferenceData() {
  const [searchParams, setSearchParams] = useSearchParams()
  const activeTab = (searchParams.get('tab') as TabType) || 'specimen-types'

  const setActiveTab = (tab: TabType) => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev)
      next.set('tab', tab)
      return next
    })
  }

  const [editingItem, setEditingItem] = useState<any>(null)
  const [loading, setLoading] = useState(false)

  // Data states
  const [specimenTypes, setSpecimenTypes] = useState<SpecimenType[]>([])
  const [locations, setLocations] = useState<Location[]>([])
  const [states, setStates] = useState<State[]>([])
  const [storageTypes, setStorageTypes] = useState<StorageType[]>([])
  const [sampleTypes, setSampleTypes] = useState<SampleType[]>([])
  const [strains, setStrains] = useState<Strain[]>([])
  const [compositions, setCompositions] = useState<Composition[]>([])

  // Pagination state for locations
  const [locationsPage, setLocationsPage] = useState(1)
  const [locationsTotalPages, setLocationsTotalPages] = useState(1)
  const [locationsTotal, setLocationsTotal] = useState(0)
  const locationsLimit = 50
  
  // Search state for locations (backend search)
  const [locationsSearch, setLocationsSearch] = useState('')
  const [locationsSearchDebounced, setLocationsSearchDebounced] = useState('')

  // Debounce search input (300ms delay, same as GlobalSearch)
  useEffect(() => {
    const timeoutId = setTimeout(() => {
      setLocationsSearchDebounced(locationsSearch)
    }, 300)

    return () => clearTimeout(timeoutId)
  }, [locationsSearch])

  useEffect(() => {
    loadData()
  }, [activeTab, locationsPage, locationsSearchDebounced])

  // Reset pagination when switching tabs
  useEffect(() => {
    setLocationsPage(1)
    setLocationsSearch('')
  }, [activeTab])
  
  // Reset to page 1 when search changes
  useEffect(() => {
    if (activeTab === 'locations') {
      setLocationsPage(1)
    }
  }, [locationsSearch, activeTab])

  const loadData = async () => {
    setLoading(true)
    try {
      switch (activeTab) {
        case 'specimen-types':
          const stRes = await specimenTypesApi.list()
          setSpecimenTypes(stRes.data.specimenTypes)
          break
        case 'locations':
          const locRes = await locationsApi.list(locationsPage, locationsLimit, locationsSearchDebounced)
          setLocations(locRes.data.locations)
          if (locRes.data.pagination) {
            setLocationsTotalPages(locRes.data.pagination.totalPages)
            setLocationsTotal(locRes.data.pagination.total)
          }
          // Also load storage types for lookup
          const locStTypesRes = await storageTypesApi.list()
          setStorageTypes(locStTypesRes.data.storageTypes)
          break
        case 'states':
          const statesRes = await statesApi.list()
          setStates(statesRes.data.states)
          break
        case 'storage-types':
          const stTypesRes = await storageTypesApi.list()
          setStorageTypes(stTypesRes.data.storageTypes)
          break
        case 'sample-types':
          const sampleTypesRes = await sampleTypesApi.list()
          setSampleTypes(sampleTypesRes.data.sampleTypes)
          break
        case 'strains':
          const strainsRes = await strainsApi.list()
          setStrains(strainsRes.data.strains)
          break
        case 'compositions':
          const compRes = await compositionsApi.list()
          setCompositions(compRes.data.compositions)
          break
      }
    } catch (error) {
      console.error('Failed to load data:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleSave = async (data: any) => {
    try {
      switch (activeTab) {
        case 'specimen-types':
          if (editingItem?.id) {
            await specimenTypesApi.update(editingItem.id, data)
          } else {
            await specimenTypesApi.create(data)
          }
          break
        case 'locations':
          if (editingItem?.id) {
            await locationsApi.update(editingItem.id, data)
          } else {
            await locationsApi.create(data)
          }
          break
        case 'states':
          if (editingItem?.id) {
            await statesApi.update(editingItem.id, data)
          } else {
            await statesApi.create(data)
          }
          break
        case 'storage-types':
          if (editingItem?.id) {
            await storageTypesApi.update(editingItem.id, data)
          } else {
            await storageTypesApi.create(data)
          }
          break
        case 'sample-types':
          if (editingItem?.id) {
            await sampleTypesApi.update(editingItem.id, data)
          } else {
            await sampleTypesApi.create(data)
          }
          break
        case 'strains':
          if (editingItem?.id) {
            await strainsApi.update(editingItem.id, data)
          } else {
            await strainsApi.create(data)
          }
          break
        case 'compositions':
          if (editingItem?.id) {
            await compositionsApi.update(editingItem.id, data)
          } else {
            await compositionsApi.create(data)
          }
          break
      }
      setEditingItem(null)
      await loadData()
    } catch (error: any) {
      throw error
    }
  }

  const handleDelete = async (id: number) => {
    switch (activeTab) {
      case 'specimen-types':
        await specimenTypesApi.delete(id)
        break
      case 'locations':
        await locationsApi.delete(id)
        break
      case 'states':
        await statesApi.delete(id)
        break
      case 'storage-types':
        await storageTypesApi.delete(id)
        break
      case 'sample-types':
        await sampleTypesApi.delete(id)
        break
      case 'strains':
        await strainsApi.delete(id)
        break
      case 'compositions':
        await compositionsApi.delete(id)
        break
    }
    await loadData()
  }

  const getCurrentData = () => {
    switch (activeTab) {
      case 'specimen-types':
        return specimenTypes
      case 'locations':
        return locations
      case 'states':
        return states
      case 'storage-types':
        return storageTypes
      case 'sample-types':
        return sampleTypes
      case 'strains':
        return strains
      case 'compositions':
        return compositions
      default:
        return []
    }
  }

  const getColumns = () => {
    switch (activeTab) {
      case 'specimen-types':
        return [
          { key: 'name' as const, label: 'Name' },
          {
            key: 'created' as const,
            label: 'Created',
            render: (value: string) => new Date(value).toLocaleDateString(),
          },
        ]
      case 'locations':
        return [
          { key: 'locationRoot' as const, label: 'Root' },
          { key: 'levelI' as const, label: 'Level I' },
          { key: 'levelII' as const, label: 'Level II' },
          { key: 'levelIII' as const, label: 'Level III' },
          { 
            key: 'storageTypeId' as const, 
            label: 'Storage Type',
            render: (value: string, item: Location) => {
              // storageTypeId is stored as text (name) in the database
              // Try to find matching storage type by name or ID
              const storageType = storageTypes.find((st) => 
                st.name === value || String(st.id) === value
              )
              if (storageType) {
                return storageType.description 
                  ? `${storageType.name} - ${storageType.description}`
                  : storageType.name
              }
              // Fallback to raw value if not found
              return value
            },
          },
          { key: 'description' as const, label: 'Description' },
        ]
      case 'states':
        return [
          { key: 'name' as const, label: 'Name' },
        ]
      case 'storage-types':
        return [
          { key: 'name' as const, label: 'Name' },
          { key: 'description' as const, label: 'Description' },
        ]
      case 'sample-types':
        return [
          { key: 'name' as const, label: 'Name' },
          { key: 'description' as const, label: 'Description' },
          { 
            key: 'parentId' as const, 
            label: 'Parent',
            render: (value: number | null | undefined, item: SampleType) => {
              if (!value) return 'None (Root)'
              const parent = sampleTypes.find((st) => st.id === value)
              return parent ? parent.name : `ID: ${value}`
            },
          },
        ]
      case 'strains':
        return [
          { key: 'name' as const, label: 'Name' },
          { key: 'description' as const, label: 'Description' },
        ]
      case 'compositions':
        return [
          { key: 'label' as const, label: 'Label' },
          { key: 'index' as const, label: 'Index' },
          { 
            key: 'legacy' as const, 
            label: 'Legacy',
            render: (value: number) => value ? 'Yes' : 'No',
          },
        ]
      default:
        return []
    }
  }

  const getFormFields = () => {
    switch (activeTab) {
      case 'specimen-types':
        return [{ key: 'name' as const, label: 'Name', required: true }]
      case 'locations':
        return [
          { key: 'locationRoot' as const, label: 'Location Root', required: true },
          { 
            key: 'storageTypeId' as const, 
            label: 'Storage Type', 
            required: true,
            loadOptions: async () => {
              const response = await storageTypesApi.list()
              return response.data.storageTypes.map((st: StorageType) => ({
                value: String(st.id), // Store ID as string since storageTypeId is text in DB
                label: st.description ? `${st.name} - ${st.description}` : st.name,
              }))
            },
          },
          { key: 'levelI' as const, label: 'Level I', required: true },
          { key: 'levelII' as const, label: 'Level II', required: true },
          { key: 'levelIII' as const, label: 'Level III' },
          { key: 'description' as const, label: 'Description', type: 'textarea' as const },
        ]
      case 'states':
        return [{ key: 'name' as const, label: 'Name', required: true }]
      case 'storage-types':
        return [
          { key: 'name' as const, label: 'Name', required: true },
          { key: 'description' as const, label: 'Description', type: 'textarea' as const },
        ]
      case 'sample-types':
        return [
          { key: 'name' as const, label: 'Name', required: true },
          { key: 'description' as const, label: 'Description', type: 'textarea' as const },
          { 
            key: 'parentId' as const, 
            label: 'Parent Sample Type', 
            type: 'number' as const,
            loadOptions: async () => {
              const response = await sampleTypesApi.list()
              const currentId = editingItem?.id
              const options = response.data.sampleTypes
                .filter((st: SampleType) => st.id !== currentId) // Exclude self to prevent circular references
                .map((st: SampleType) => ({
                  value: st.id,
                  label: st.description ? `${st.name} - ${st.description}` : st.name,
                }))
              return [{ value: '', label: 'None (Root)' }, ...options]
            },
          },
        ]
      case 'strains':
        return [
          { key: 'name' as const, label: 'Name', required: true },
          { key: 'description' as const, label: 'Description', type: 'textarea' as const },
        ]
      case 'compositions':
        return [
          { key: 'label' as const, label: 'Label', required: true },
          { key: 'index' as const, label: 'Index', type: 'number' as const },
          { key: 'legacy' as const, label: 'Legacy', type: 'number' as const, required: true },
        ]
      default:
        return []
    }
  }

  const getTitle = () => {
    const tab = tabs.find((t) => t.id === activeTab)
    return editingItem ? `Edit ${tab?.label || ''}` : `Add ${tab?.label || ''}`
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
            {tabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => {
                  setActiveTab(tab.id)
                  setEditingItem(null)
                }}
                className={`px-6 py-3 text-sm font-medium border-b-2 ${
                  activeTab === tab.id
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
            data={getCurrentData()}
            columns={getColumns()}
            onEdit={setEditingItem}
            onDelete={handleDelete}
            searchPlaceholder={`Search ${tabs.find((t) => t.id === activeTab)?.label || ''}...`}
            emptyMessage={`No ${tabs.find((t) => t.id === activeTab)?.label || 'items'} found`}
            search={activeTab === 'locations' ? locationsSearch : undefined}
            onSearchChange={activeTab === 'locations' ? setLocationsSearch : undefined}
            disableClientFilter={activeTab === 'locations'}
            loading={loading && activeTab === 'locations'}
          />
          
          {activeTab === 'locations' && locationsTotalPages > 1 && (
            <Pagination
              currentPage={locationsPage}
              totalPages={locationsTotalPages}
              totalItems={locationsTotal}
              itemsPerPage={locationsLimit}
              onPageChange={setLocationsPage}
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

