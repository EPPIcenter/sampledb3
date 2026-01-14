import { useState, useEffect, useMemo } from 'react'
import { locationsApi, type Location } from '../lib/api'
import { buildLocationTree, filterLocationTree, getLocationLabel, getRootLocations, getLocationChildren } from '../lib/location-tree'

export interface LocationSelection {
  locationId: number
  path: string
  name: string
}

interface LocationTreePickerProps {
  selected: LocationSelection[]
  onChange: (selections: LocationSelection[]) => void
  filterCollectionsOnly?: boolean  // Only show locations that can contain collections
}

export default function LocationTreePicker({ selected, onChange, filterCollectionsOnly = false }: LocationTreePickerProps) {
  const [open, setOpen] = useState(false)
  const [locations, setLocations] = useState<Location[]>([])
  const [loading, setLoading] = useState(false)
  const [search, setSearch] = useState('')
  const [expandedIds, setExpandedIds] = useState<Set<number>>(new Set())

  useEffect(() => {
    if (open) {
      loadLocations()
    }
  }, [open])

  const loadLocations = async () => {
    try {
      setLoading(true)
      // Fetch all locations in a single request (no pagination params)
      const response = await locationsApi.list()
      let allLocations = response.data.locations || []
      
      // Filter to collection-capable locations if requested
      if (filterCollectionsOnly) {
        allLocations = allLocations.filter(loc => loc.canContainCollections)
      }
      
      setLocations(allLocations)
    } catch (error) {
      console.error('Failed to load locations:', error)
    } finally {
      setLoading(false)
    }
  }

  const tree = useMemo(() => buildLocationTree(locations), [locations])
  const filteredTree = useMemo(
    () => (search.trim() ? filterLocationTree(tree, search) : tree),
    [tree, search]
  )

  const isSelected = (locationId: number): boolean => {
    return selected.some(s => s.locationId === locationId)
  }

  const toggleSelection = (loc: Location) => {
    const selection: LocationSelection = {
      locationId: loc.id,
      path: loc.path || loc.name,
      name: loc.name,
    }
    
    if (isSelected(loc.id)) {
      // Remove selection
      onChange(selected.filter(s => s.locationId !== loc.id))
    } else {
      // Add selection
      onChange([...selected, selection])
    }
  }

  const removeSelection = (index: number) => {
    onChange(selected.filter((_, i) => i !== index))
  }

  const clearAll = () => {
    onChange([])
  }

  const toggleExpanded = (locationId: number) => {
    setExpandedIds(prev => {
      const next = new Set(prev)
      if (next.has(locationId)) {
        next.delete(locationId)
      } else {
        next.add(locationId)
      }
      return next
    })
  }

  const renderLocationNode = (loc: Location, depth: number = 0): React.ReactNode => {
    const children = getLocationChildren(locations, loc.id)
    const hasChildren = children.length > 0
    const isExpanded = expandedIds.has(loc.id)
    const locSelected = isSelected(loc.id)

    return (
      <div key={loc.id} className={depth > 0 ? 'ml-4 border-l border-gray-100 pl-3' : 'mb-1'}>
        <div
          className={`flex items-center justify-between w-full px-2 py-1.5 rounded hover:bg-gray-50 ${
            locSelected ? 'bg-blue-50 border border-blue-200' : ''
          }`}
        >
          <div className="flex items-center flex-1">
            {hasChildren ? (
              <button
                type="button"
                onClick={() => toggleExpanded(loc.id)}
                className="w-3 h-3 mr-2 text-gray-500 focus-visible:outline-none"
              >
                {isExpanded ? '▾' : '▸'}
              </button>
            ) : (
              <span className="w-3 h-3 mr-2" />
            )}
            <button
              type="button"
              onClick={() => toggleSelection(loc)}
              className="flex-1 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
            >
              <span className={`font-medium ${locSelected ? 'text-blue-700' : 'text-gray-800'}`}>
                {getLocationLabel(loc)}
              </span>
              {loc.path && (
                <span className="ml-2 text-xs text-gray-500 font-mono">
                  ({loc.path})
                </span>
              )}
              {locSelected && (
                <span className="ml-2 text-xs text-blue-600">(selected)</span>
              )}
            </button>
          </div>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation()
              toggleSelection(loc)
            }}
            className={`ml-2 px-2 py-0.5 text-xs rounded ${
              locSelected
                ? 'bg-blue-600 text-white'
                : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
            }`}
          >
            {locSelected ? 'Deselect' : 'Select'}
          </button>
        </div>
        {hasChildren && isExpanded && (
          <div className="mt-1 space-y-1">
            {children.map(child => renderLocationNode(child, depth + 1))}
          </div>
        )}
      </div>
    )
  }

  const renderTree = () => {
    const rootLocations = getRootLocations(locations)
    const displayRoots = search.trim()
      ? Array.from(filteredTree.get(null) || [])
      : rootLocations

    if (displayRoots.length === 0) {
      return <p className="text-sm text-gray-500 p-4">No locations match this filter.</p>
    }

    return (
      <div className="text-sm">
        {displayRoots.map((root) => renderLocationNode(root, 0))}
      </div>
    )
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="w-full px-3 py-2 border border-gray-100 rounded-md shadow-sm bg-white text-left focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
      >
        {selected.length > 0 ? (
          <div className="space-y-1">
            {selected.map((sel, index) => (
              <div key={index} className="text-sm text-gray-900 truncate">
                {sel.path}
              </div>
            ))}
          </div>
        ) : (
          <span className="text-gray-400">Select locations...</span>
        )}
      </button>

      {open && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center">
          <div
            className="fixed inset-0 transition-opacity bg-gray-900/40 backdrop-blur-md"
            onClick={() => setOpen(false)}
          />
          <div className="relative z-10 w-full max-w-4xl mx-4 bg-white rounded-lg shadow-xl p-6 max-h-[90vh] flex flex-col">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-gray-900">Select Locations</h2>
              <button
                type="button"
                className="text-gray-500 hover:text-gray-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 rounded"
                onClick={() => setOpen(false)}
                aria-label="Close location selection dialog"
              >
                <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="mb-4">
              <label htmlFor="location-search" className="sr-only">
                Search locations
              </label>
              <input
                id="location-search"
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search by name, path, or description…"
                className="w-full form-input"
                autoFocus
              />
            </div>

            {selected.length > 0 && (
              <div className="mb-4 p-3 bg-gray-50 rounded-lg">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-medium text-gray-700">
                    Selected ({selected.length}):
                  </span>
                  <button
                    type="button"
                    onClick={clearAll}
                    className="text-xs text-blue-600 hover:text-blue-800"
                  >
                    Clear all
                  </button>
                </div>
                <div className="flex flex-wrap gap-2">
                  {selected.map((sel, index) => (
                    <span
                      key={index}
                      className="inline-flex items-center px-2 py-1 rounded-md bg-blue-100 text-blue-800 text-xs font-medium"
                    >
                      {sel.path}
                      <button
                        type="button"
                        onClick={() => removeSelection(index)}
                        className="ml-1 text-blue-600 hover:text-blue-800"
                        aria-label={`Remove ${sel.path}`}
                      >
                        <svg className="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </button>
                    </span>
                  ))}
                </div>
              </div>
            )}

            <div className="border border-gray-100 rounded-md overflow-y-auto flex-1 min-h-0">
              {loading ? (
                <div className="p-4 text-sm text-gray-500">Loading locations…</div>
              ) : (
                renderTree()
              )}
            </div>

            <div className="mt-4 flex justify-end">
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
