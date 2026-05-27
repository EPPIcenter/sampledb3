import { useState, useEffect, useMemo, useRef } from 'react'
import { locationsApi } from '../lib/api/locations';
import type { Location } from '../lib/api/types';
import { buildLocationTree, filterLocationTree, getLocationLabel, getRootLocations, getLocationChildren, getLocationAncestors } from '../lib/location-tree'
import ModalPortal from './ModalPortal'

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
      let allLocations = response.data.locations
      
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
    const locationLabel = getLocationLabel(loc)
    const expandAriaLabel = isExpanded ? `Collapse ${locationLabel}` : `Expand ${locationLabel}`

    return (
      <div key={loc.id} className={depth > 0 ? 'ml-4 border-l border-app-border pl-3 mt-1' : 'mb-2'}>
        <div className="flex items-center gap-2">
          {hasChildren ? (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation()
                toggleExpanded(loc.id)
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault()
                  toggleExpanded(loc.id)
                }
              }}
              aria-expanded={isExpanded}
              aria-label={expandAriaLabel}
              className="storage-tree-picker-row flex-1 min-w-0 flex items-center gap-3 px-3 py-3 min-h-[44px] rounded-lg border border-transparent hover:bg-app-surface hover:border-app-border transition-colors text-left cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-app-accent focus-visible:ring-offset-1"
            >
              <span className="flex-shrink-0 w-5 h-5 flex items-center justify-center text-app-text-muted" aria-hidden>
                {isExpanded ? (
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                ) : (
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                )}
              </span>
              <div className="flex-1 min-w-0">
                <p className={`truncate text-sm ${isSelected ? 'text-app-accent-hover font-medium' : 'text-app-text'}`}>
                  {locationLabel}
                </p>
                {loc.path && (
                  <p className="text-[10px] text-app-text-muted font-mono truncate mt-0.5">
                    {loc.path}
                  </p>
                )}
              </div>
            </button>
          ) : (
            <div className="storage-tree-picker-row flex-1 min-w-0 flex items-center gap-3 px-3 py-3 min-h-[44px] rounded-lg">
              <span className="w-5 flex-shrink-0" aria-hidden />
              <div className="flex-1 min-w-0">
                <p className={`truncate text-sm ${isSelected ? 'text-app-accent-hover font-medium' : 'text-app-text'}`}>
                  {getLocationLabel(loc)}
                </p>
                {loc.path && (
                  <p className="text-[10px] text-app-text-muted font-mono truncate mt-0.5">
                    {loc.path}
                  </p>
                )}
              </div>
            </div>
          )}
          {(!filterCollectionsOnly || loc.canContainCollections) && (
            <button
              type="button"
              onClick={() => onChange(loc.id)}
              className={`flex-shrink-0 px-3 py-2 min-h-[44px] text-sm font-medium rounded-lg transition-colors ${
                isSelected
                  ? 'bg-app-accent text-white hover:bg-app-accent-hover'
                  : 'bg-app-surface text-app-text-muted hover:bg-app-border'
              }`}
            >
              {isSelected ? 'Selected' : 'Select'}
            </button>
          )}
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
          <p className="text-sm text-app-text-muted">
            {search ? 'No locations match this search.' : 'No locations available.'}
          </p>
          {!search && locations.length === 0 && (
            <p className="text-xs text-app-text-muted mt-2">
              {filterCollectionsOnly 
                ? 'Try removing the collection filter or ensure locations have canContainCollections set to true.'
                : 'Please check that locations exist in the database.'}
            </p>
          )}
          {!search && locations.length > 0 && rootLocations.length === 0 && (
            <div className="text-xs text-app-text-muted mt-2 space-y-1 text-left max-w-md mx-auto">
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
        className={`w-full px-3 py-2 border border-app-border rounded-md shadow-sm bg-app-card text-app-text text-left focus:outline-none focus:ring-2 focus:ring-app-accent focus:border-app-accent ${
          disabled ? 'bg-app-surface cursor-not-allowed opacity-60' : ''
        }`}
      >
        {loading ? (
          <span className="text-app-text-muted">Loading locations...</span>
        ) : selectedLocation ? (
          <span className="text-app-text">{selectedLocation.path || selectedLocation.name}</span>
        ) : (
          <span className="text-app-text-muted">Select location...</span>
        )}
      </button>

      {open && (
        <ModalPortal>
          <div className="fixed inset-0 z-[100] flex items-center justify-center">
            <div
              className="fixed inset-0 bg-black/40 backdrop-blur-md"
              onClick={() => setOpen(false)}
            />
<div className="relative z-10 bg-app-card rounded-lg shadow-xl p-6 max-h-[90vh] flex flex-col w-full max-w-3xl mx-4 border border-app-border">
              <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-app-text">Select Location</h2>
              <button
                type="button"
                className="text-app-text-muted hover:text-app-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-app-accent rounded"
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
                placeholder="Name, path, or description, or a path: Bldg > floor > shelf (or Bldg/floor/shelf)"
                className="w-full form-input"
                autoFocus
              />
            </div>

            {selectedLocation && (
              <div className="mb-4 p-3 bg-app-accent-muted border border-app-accent/50 rounded-lg">
                <div className="text-sm">
                  <span className="font-medium text-app-text">Selected: </span>
                  <span className="text-app-text">{selectedLocation.path || selectedLocation.name}</span>
                </div>
              </div>
            )}

            <div className="border border-app-border rounded-md overflow-y-auto flex-1 min-h-0 bg-app-card">
              {loading ? (
                <div className="p-4 text-sm text-app-text-muted text-center">Loading locations…</div>
              ) : (
                renderTree()
              )}
            </div>

            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => onChange(null)}
                className="px-4 py-2 border border-app-border text-app-text rounded-lg hover:bg-app-surface font-medium"
              >
                Clear
              </button>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="px-4 py-2 bg-app-accent text-white rounded-lg hover:bg-app-accent-hover font-medium"
              >
                Done
              </button>
            </div>
          </div>
        </div>
        </ModalPortal>
      )}
    </>
  )
}
