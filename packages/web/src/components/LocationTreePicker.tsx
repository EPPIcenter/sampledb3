import { useState, useEffect, useMemo, useCallback, useRef } from 'react'
import { locationsApi, type Location } from '../lib/api'
import { buildLocationTree, filterLocationTree, getLocationLabel, getRootLocations, getLocationChildren, getLocationAncestors } from '../lib/location-tree'

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

  // Pre-compute location children map for O(1) lookup
  const locationChildrenMap = useMemo(() => {
    const map = new Map<number, Location[]>()
    locations.forEach((loc) => {
      if (loc.parentId !== null) {
        if (!map.has(loc.parentId)) {
          map.set(loc.parentId, [])
        }
        map.get(loc.parentId)!.push(loc)
      }
    })
    // Sort children by name
    for (const children of map.values()) {
      children.sort((a, b) => a.name.localeCompare(b.name))
    }
    return map
  }, [locations])

  // Pre-compute location map for O(1) lookup
  const locationMap = useMemo(() => {
    const map = new Map<number, Location>()
    locations.forEach((loc) => map.set(loc.id, loc))
    return map
  }, [locations])

  const tree = useMemo(() => buildLocationTree(locations), [locations])
  const filteredTree = useMemo(
    () => (search.trim() ? filterLocationTree(tree, search) : tree),
    [tree, search]
  )

  // Auto-expand when selected, search, or locations change (adjust during render)
  const selectedKey = selected.map((s) => s.locationId).sort().join(',')
  const prevExpandedDepsRef = useRef({ selectedKey, search, locationsLength: locations.length })
  const expandedDeps = { selectedKey, search, locationsLength: locations.length }
  const expandedDepsChanged =
    prevExpandedDepsRef.current.selectedKey !== selectedKey ||
    prevExpandedDepsRef.current.search !== search ||
    prevExpandedDepsRef.current.locationsLength !== locations.length
  if (expandedDepsChanged && locations.length > 0) {
    prevExpandedDepsRef.current = expandedDeps
    setExpandedIds((prev) => {
      const next = new Set(prev)
      if (search.trim()) {
        locations.forEach((loc) => next.add(loc.id))
      }
      if (selected.length > 0) {
        selected.forEach((sel) => {
          const ancestors = getLocationAncestors(locations, sel.locationId)
          ancestors.forEach((a) => next.add(a.id))
          next.add(sel.locationId)
        })
      }
      return next
    })
  }

  const isSelected = useCallback((locationId: number): boolean => {
    return selected.some((s) => s.locationId === locationId)
  }, [selected])

  const toggleSelection = useCallback((loc: Location) => {
    const selection: LocationSelection = {
      locationId: loc.id,
      path: loc.path || loc.name,
      name: loc.name,
    }
    
    if (isSelected(loc.id)) {
      // Remove selection
      onChange(selected.filter((s) => s.locationId !== loc.id))
    } else {
      // Add selection
      onChange([...selected, selection])
    }
  }, [selected, onChange, isSelected])

  const removeSelection = (index: number) => {
    onChange(selected.filter((_, i) => i !== index))
  }

  const clearAll = () => {
    onChange([])
  }

  const toggleExpanded = useCallback((locationId: number) => {
    setExpandedIds((prev) => {
      const next = new Set(prev)
      if (next.has(locationId)) {
        next.delete(locationId)
      } else {
        next.add(locationId)
      }
      return next
    })
  }, [])

  // Highlight search term in text
  const highlightText = useCallback((text: string, searchTerm: string) => {
    if (!searchTerm.trim()) return text
    const parts = text.split(new RegExp(`(${searchTerm})`, 'gi'))
    return parts.map((part, i) =>
      part.toLowerCase() === searchTerm.toLowerCase() ? (
        <mark key={i} className="bg-yellow-200 px-0.5 rounded">
          {part}
        </mark>
      ) : (
        part
      )
    )
  }, [])

  const renderLocationNode = useCallback((loc: Location, depth: number = 0): React.ReactNode => {
    const children = locationChildrenMap.get(loc.id) || []
    const hasChildren = children.length > 0
    const isExpanded = expandedIds.has(loc.id)
    const locSelected = isSelected(loc.id)
    const canContainCollections = loc.canContainCollections

    return (
      <div key={loc.id} className={depth > 0 ? 'ml-4 border-l-2 border-gray-200 pl-3' : 'mb-1'}>
        <div
          className={`flex items-center justify-between w-full px-3 py-2 rounded-lg transition-colors ${
            locSelected
              ? 'bg-blue-50 border-2 border-blue-500 shadow-sm'
              : canContainCollections
              ? 'hover:bg-gray-50 border border-transparent hover:border-gray-200'
              : 'bg-gray-50 border border-gray-200 opacity-75 hover:bg-gray-100'
          }`}
        >
          <div className="flex items-center flex-1 min-w-0">
            {hasChildren ? (
              <button
                type="button"
                onClick={() => toggleExpanded(loc.id)}
                className="w-5 h-5 mr-2 text-gray-500 hover:text-gray-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 rounded flex-shrink-0 flex items-center justify-center"
                aria-label={isExpanded ? 'Collapse' : 'Expand'}
              >
                <span className="text-sm">{isExpanded ? '▼' : '▶'}</span>
              </button>
            ) : (
              <span className="w-5 mr-2" />
            )}
            <button
              type="button"
              onClick={() => toggleSelection(loc)}
              disabled={!canContainCollections}
              className="flex-1 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 rounded min-w-0 disabled:cursor-not-allowed"
            >
              <div className="flex items-center gap-2 flex-wrap">
                <span className={`font-medium ${locSelected ? 'text-blue-700' : canContainCollections ? 'text-gray-900' : 'text-gray-600'}`}>
                  {search.trim() ? highlightText(getLocationLabel(loc), search) : getLocationLabel(loc)}
                </span>
                {loc.path && loc.path !== loc.name && (
                  <span className={`text-xs font-mono truncate ${canContainCollections ? 'text-gray-500' : 'text-gray-400'}`}>
                    {search.trim() ? highlightText(loc.path, search) : loc.path}
                  </span>
                )}
                {!canContainCollections && (
                  <span className="text-xs text-gray-500 italic">(cannot contain collections)</span>
                )}
                {locSelected && (
                  <span className="inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium bg-blue-600 text-white">
                    Selected
                  </span>
                )}
              </div>
              {loc.description && (
                <div className={`text-xs mt-0.5 truncate ${canContainCollections ? 'text-gray-500' : 'text-gray-400'}`}>
                  {search.trim() ? highlightText(loc.description, search) : loc.description}
                </div>
              )}
            </button>
          </div>
          {canContainCollections && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation()
                toggleSelection(loc)
              }}
              className={`ml-3 px-3 py-1.5 text-sm font-medium rounded transition-colors flex-shrink-0 ${
                locSelected
                  ? 'bg-blue-600 text-white hover:bg-blue-700'
                  : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
              }`}
            >
              {locSelected ? 'Deselect' : 'Select'}
            </button>
          )}
        </div>
        {hasChildren && isExpanded && (
          <div className="mt-1 space-y-1">
            {children.map((child) => renderLocationNode(child, depth + 1))}
          </div>
        )}
      </div>
    )
  }, [expandedIds, isSelected, toggleSelection, toggleExpanded, locationChildrenMap, search, highlightText])

  const renderTree = useCallback(() => {
    const rootLocations = getRootLocations(locations)
    const displayRoots = search.trim()
      ? Array.from(filteredTree.get(null) || [])
      : rootLocations

    if (displayRoots.length === 0) {
      return (
        <div className="p-8 text-center">
          <p className="text-sm text-gray-500 mb-2">No locations match this filter.</p>
          {filterCollectionsOnly && (
            <p className="text-xs text-gray-400">Only locations that can contain collections are shown.</p>
          )}
        </div>
      )
    }

    return (
      <div className="text-sm space-y-1">
        {displayRoots.map((root) => renderLocationNode(root, 0))}
      </div>
    )
  }, [locations, search, filteredTree, filterCollectionsOnly, renderLocationNode])

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
              <div className="relative">
                <input
                  id="location-search"
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search by name, path, or description…"
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg shadow-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  autoFocus
                />
                {search && (
                  <button
                    type="button"
                    onClick={() => setSearch('')}
                    className="absolute right-3 top-2.5 text-gray-400 hover:text-gray-600"
                    aria-label="Clear search"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                )}
              </div>
              {filterCollectionsOnly && (
                <p className="mt-2 text-xs text-gray-500">
                  Only showing locations that can contain collections
                </p>
              )}
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

            <div className="border border-gray-200 rounded-lg overflow-y-auto flex-1 min-h-0 bg-gray-50 p-2">
              {loading ? (
                <div className="p-8 text-center">
                  <div className="inline-block animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600"></div>
                  <p className="mt-2 text-sm text-gray-500">Loading locations…</p>
                </div>
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
