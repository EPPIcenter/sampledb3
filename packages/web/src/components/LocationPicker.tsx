import { useState, useEffect, useMemo, useRef } from 'react'
import { locationsApi, type Location } from '../lib/api'
import { buildLocationTree, filterLocationTree, getLocationLabel, getRootLocations, getLocationChildren, getLocationAncestors } from '../lib/location-tree'

interface LocationPickerProps {
  value: number | null
  onChange: (locationId: number | null) => void
  filterCollectionsOnly?: boolean  // Only show locations that can contain collections
  disabled?: boolean  // Disable the location picker
}

export default function LocationPicker({ value, onChange, filterCollectionsOnly = false, disabled = false }: LocationPickerProps) {
  const [open, setOpen] = useState(false)
  const [locations, setLocations] = useState<Location[]>([])
  const [loading, setLoading] = useState(false)
  const [search, setSearch] = useState('')
  const [expandedIds, setExpandedIds] = useState<Set<number>>(new Set())

  useEffect(() => {
    loadLocations()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filterCollectionsOnly])

  // Auto-expand when search or value/locations change (adjust during render)
  const prevExpandedDepsRef = useRef({ search, value, locationsLength: locations.length })
  const expandedDeps = { search, value, locationsLength: locations.length }
  const depsChanged =
    prevExpandedDepsRef.current.search !== search ||
    prevExpandedDepsRef.current.value !== value ||
    prevExpandedDepsRef.current.locationsLength !== locations.length
  if (depsChanged && locations.length > 0) {
    prevExpandedDepsRef.current = expandedDeps
    setExpandedIds((prev) => {
      const next = new Set(prev)
      if (search.trim()) {
        locations.forEach((loc) => next.add(loc.id))
      }
      if (value) {
        const ancestors = getLocationAncestors(locations, value)
        ancestors.forEach((a) => next.add(a.id))
        next.add(value)
      }
      return next
    })
  }

  const loadLocations = async () => {
    try {
      setLoading(true)
      // Call without pagination params to get all locations
      // The API returns all locations when page/limit are not provided
      const response = await locationsApi.list()
      let allLocations = response.data.locations || []
      
      // Filter to collection-capable locations if requested
      // Include locations that can contain collections AND their ancestors (so we can navigate to them)
      if (filterCollectionsOnly) {
        const collectionCapable = allLocations.filter(loc => loc.canContainCollections)
        
        if (collectionCapable.length === 0) {
          // No collection-capable locations found - show all locations with a note
          console.warn('No locations with canContainCollections=true found. Showing all locations.')
        } else {
          const collectionCapableIds = new Set(collectionCapable.map(loc => loc.id))
          
          // Include all ancestors of collection-capable locations
          const locationMap = new Map(allLocations.map(loc => [loc.id, loc]))
          const locationsToInclude = new Set(collectionCapableIds)
          
          // Recursively add all ancestors up to root
          for (const locId of collectionCapableIds) {
            let current = locationMap.get(locId)
            while (current && current.parentId !== null) {
              const parent = locationMap.get(current.parentId)
              if (parent) {
                locationsToInclude.add(parent.id)
                current = parent
              } else {
                break
              }
            }
          }
          
          allLocations = allLocations.filter(loc => locationsToInclude.has(loc.id))
        }
      }
      
      setLocations(allLocations)
    } catch (error) {
      console.error('Failed to load locations:', error)
      // Set empty array on error so UI shows appropriate message
      setLocations([])
    } finally {
      setLoading(false)
    }
  }

  const tree = useMemo(() => buildLocationTree(locations), [locations])
  const filteredTree = useMemo(
    () => (search.trim() ? filterLocationTree(tree, search) : tree),
    [tree, search]
  )

  const selectedLocation = locations.find(loc => loc.id === value)

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
    // When searching, use filtered tree to get children; otherwise use all locations
    const children = search.trim() 
      ? Array.from(filteredTree.get(loc.id) || [])
      : getLocationChildren(locations, loc.id)
    const hasChildren = children.length > 0
    const isExpanded = expandedIds.has(loc.id)
    const isSelected = value === loc.id

    const handleNodeClick = () => {
      if (isSelected && hasChildren) {
        // If already selected and has children, toggle expansion
        toggleExpanded(loc.id)
      } else {
        // Otherwise, select the node (but don't close modal - let user click Done)
        onChange(loc.id)
      }
    }

    return (
      <div key={loc.id} className={depth > 0 ? 'ml-4 border-l border-gray-100 pl-3 mt-1' : 'mb-2'}>
        <div className="flex items-center">
          {hasChildren ? (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation()
                toggleExpanded(loc.id)
              }}
              className="w-3 h-3 mr-2 text-gray-500 flex-shrink-0 hover:text-gray-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 rounded"
              aria-label={isExpanded ? 'Collapse' : 'Expand'}
            >
              {isExpanded ? '▾' : '▸'}
            </button>
          ) : (
            <span className="w-3 h-3 mr-2"></span>
          )}
          <button
            type="button"
            onClick={handleNodeClick}
            className={`flex items-center justify-between flex-1 px-2 py-1 rounded text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 transition-colors ${
              isSelected
                ? 'bg-blue-50 border border-blue-200 shadow-sm'
                : 'hover:bg-gray-50 border border-transparent'
            }`}
          >
            <div className="text-left flex-1 min-w-0">
              <p className={`truncate ${isSelected ? 'text-blue-900 font-medium' : 'text-gray-900'}`}>
                {getLocationLabel(loc)}
              </p>
              {loc.path && (
                <p className="text-[10px] text-gray-400 font-mono truncate">
                  {loc.path}
                </p>
              )}
            </div>
            {isSelected && (
              <span className="text-[10px] font-mono text-blue-700 ml-2 flex-shrink-0">
                selected
              </span>
            )}
          </button>
        </div>

        {hasChildren && isExpanded && (
          <div className="mt-1">
            {children.map((child) => renderLocationNode(child, depth + 1))}
          </div>
        )}
      </div>
    )
  }

  const renderTree = () => {
    const rootLocations = getRootLocations(locations)
    let displayRoots = search.trim()
      ? Array.from(filteredTree.get(null) || [])
      : rootLocations

    // Fallback: if no root locations but we have locations, find "effective roots"
    // (locations whose parent is not in the current set)
    if (displayRoots.length === 0 && locations.length > 0) {
      const locationIds = new Set(locations.map(loc => loc.id))
      displayRoots = locations.filter(loc => 
        loc.parentId === null || !locationIds.has(loc.parentId)
      )
    }

    if (displayRoots.length === 0) {
      return (
        <div className="p-4 text-center">
          <p className="text-sm text-gray-500">
            {search ? 'No locations match this search.' : 'No locations available.'}
          </p>
          {!search && locations.length === 0 && (
            <p className="text-xs text-gray-400 mt-2">
              {filterCollectionsOnly 
                ? 'Try removing the collection filter or ensure locations have canContainCollections set to true.'
                : 'Please check that locations exist in the database.'}
            </p>
          )}
          {!search && locations.length > 0 && rootLocations.length === 0 && (
            <div className="text-xs text-gray-400 mt-2 space-y-1 text-left max-w-md mx-auto">
              <p className="font-medium">No root locations found (locations with parentId === null).</p>
              <p className="mt-1">This may indicate that:</p>
              <ul className="list-disc list-inside mt-1 space-y-0.5">
                <li>All locations have a parent set (no root locations exist)</li>
                <li>The location hierarchy needs to be fixed in the database</li>
                {filterCollectionsOnly && (
                  <li>Root locations were filtered out - try removing the collection filter</li>
                )}
              </ul>
            </div>
          )}
        </div>
      )
    }

    return (
      <div className="text-sm p-2">
        {displayRoots.map((root) => renderLocationNode(root, 0))}
      </div>
    )
  }

  return (
    <>
      <button
        type="button"
        onClick={() => !disabled && setOpen(true)}
        disabled={disabled}
        className={`w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm bg-white text-left focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 ${
          disabled ? 'bg-gray-50 cursor-not-allowed opacity-60' : ''
        }`}
      >
        {loading ? (
          <span className="text-gray-400">Loading locations...</span>
        ) : selectedLocation ? (
          <span className="text-gray-900">{selectedLocation.path || selectedLocation.name}</span>
        ) : (
          <span className="text-gray-400">Select location...</span>
        )}
      </button>

      {open && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center">
          <div
            className="fixed inset-0 transition-opacity bg-gray-900/40 backdrop-blur-md"
            onClick={() => setOpen(false)}
          />
          <div className="relative z-10 bg-white rounded-lg shadow-xl p-6 max-h-[90vh] flex flex-col w-full max-w-3xl mx-4">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-gray-900">Select Location</h2>
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

            {selectedLocation && (
              <div className="mb-4 p-3 bg-blue-50 border border-blue-200 rounded-lg">
                <div className="text-sm">
                  <span className="font-medium text-gray-700">Selected: </span>
                  <span className="text-gray-900">{selectedLocation.path || selectedLocation.name}</span>
                </div>
              </div>
            )}

            <div className="border border-gray-200 rounded-md overflow-y-auto flex-1 min-h-0 bg-white">
              {loading ? (
                <div className="p-4 text-sm text-gray-500 text-center">Loading locations…</div>
              ) : (
                renderTree()
              )}
            </div>

            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => onChange(null)}
                className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 font-medium"
              >
                Clear
              </button>
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
