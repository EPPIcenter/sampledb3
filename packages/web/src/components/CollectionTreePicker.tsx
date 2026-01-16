import { useState, useMemo, useEffect, useCallback } from 'react'
import { type Location } from '../lib/api'
import { getRootLocations, getLocationChildren, getLocationLabel } from '../lib/location-tree'

export interface Collection {
  id: number
  name: string
  type: 'box' | 'bag'
  itemCount: number
  locationId?: number | null
}

interface CollectionTreePickerProps {
  locations: Location[]
  collections: Collection[]
  onSelect: (type: 'box' | 'bag', id: number, name: string) => void
  disabledId?: number
  disabledType?: 'box' | 'bag'
  loading?: boolean
  filterEmptyLocations?: boolean // If true, only show locations that contain collections
}

export default function CollectionTreePicker({
  locations,
  collections,
  onSelect,
  disabledId,
  disabledType,
  loading = false,
  filterEmptyLocations = false,
}: CollectionTreePickerProps) {
  const [search, setSearch] = useState('')
  const [expandedIds, setExpandedIds] = useState<Set<number>>(new Set())
  const [lastSearch, setLastSearch] = useState('')
  
  // Debug: Log when expandedIds changes
  useEffect(() => {
    console.log('[CollectionTreePicker] expandedIds changed:', Array.from(expandedIds))
  }, [expandedIds])

  // Filter to only collection-capable locations
  const collectionLocations = useMemo(() => {
    const filtered = locations.filter(loc => loc.canContainCollections)
    console.log('[CollectionTreePicker] collectionLocations:', filtered.length, filtered)
    return filtered
  }, [locations])

  // Map collections by location ID, and track collections without locations
  const collectionsByLocation = useMemo(() => {
    const map: Record<number, Collection[]> = {}
    collections.forEach((c) => {
      if (c.locationId) {
        if (!map[c.locationId]) map[c.locationId] = []
        map[c.locationId].push(c)
      }
    })
    console.log('[CollectionTreePicker] collectionsByLocation:', Object.keys(map).length, 'locations with collections', map)
    return map
  }, [collections])

  // Collections without a location, or with a location that doesn't support collections
  const unassignedCollections = useMemo(() => {
    const locationIds = new Set(collectionLocations.map(loc => loc.id))
    const unassigned = collections.filter((c) => {
      // Include collections without locationId
      if (!c.locationId) return true
      // Include collections whose location doesn't support collections
      if (c.locationId && !locationIds.has(c.locationId)) return true
      return false
    })
    console.log('[CollectionTreePicker] unassignedCollections:', unassigned.length, unassigned)
    console.log('[CollectionTreePicker] locationIds that support collections:', Array.from(locationIds))
    return unassigned
  }, [collections, collectionLocations])

  const toggleExpanded = (locationId: number) => {
    setExpandedIds((prev) => {
      const next = new Set(prev)
      const wasExpanded = next.has(locationId)
      if (wasExpanded) {
        next.delete(locationId)
        console.log('Collapsing location:', locationId, 'New expandedIds:', Array.from(next))
      } else {
        next.add(locationId)
        console.log('Expanding location:', locationId, 'New expandedIds:', Array.from(next))
      }
      return next
    })
  }

  // Filter locations based on search and filterEmptyLocations
  const filteredLocations = useMemo(() => {
    // Only include locations that are in collectionLocations AND have collections mapped to them
    const locationIdsWithCollections = new Set(Object.keys(collectionsByLocation).map(Number))
    let filtered = collectionLocations.filter((loc) => {
      // Only show locations that have collections mapped to them
      return locationIdsWithCollections.has(loc.id)
    })

    // Filter by collections if needed (this is now redundant but kept for clarity)
    if (filterEmptyLocations) {
      filtered = filtered.filter((loc) => {
        return (collectionsByLocation[loc.id] || []).length > 0
      })
      console.log('[CollectionTreePicker] After filterEmptyLocations:', filtered.length, 'locations with collections')
    }

    // Apply search filter
    if (search.trim()) {
      const term = search.toLowerCase()
      filtered = filtered.filter((loc) => {
        const locMatch =
          loc.name.toLowerCase().includes(term) ||
          (loc.path || '').toLowerCase().includes(term) ||
          (loc.description || '').toLowerCase().includes(term)

        const collectionsMatch = (collectionsByLocation[loc.id] || []).some(
          (c) => c.name.toLowerCase().includes(term)
        )

        return locMatch || collectionsMatch
      })
    }

    console.log('[CollectionTreePicker] filteredLocations:', filtered.length, filtered)
    return filtered
  }, [collectionLocations, search, collectionsByLocation, filterEmptyLocations])

  // Build a set of all location IDs that should be visible
  // This includes filteredLocations and all their ancestors
  // We need to use ALL locations (not just collectionLocations) to find ancestors
  const visibleLocationIds = useMemo(() => {
    const visible = new Set<number>()
    // Use all locations to build the map, not just collectionLocations
    const allLocationMap = new Map(locations.map(loc => [loc.id, loc]))
    
    // Add all filtered locations
    filteredLocations.forEach(loc => visible.add(loc.id))
    
    // Add all ancestors of filtered locations (walking up the tree)
    filteredLocations.forEach(loc => {
      let current: Location | undefined = loc
      while (current) {
        visible.add(current.id)
        if (current.parentId !== null) {
          current = allLocationMap.get(current.parentId)
        } else {
          break
        }
      }
    })
    
    console.log('[CollectionTreePicker] visibleLocationIds:', visible.size, Array.from(visible))
    return visible
  }, [filteredLocations, locations])
  
  // Get all locations that should be visible (filtered + ancestors)
  // Include both collectionLocations and any ancestors from all locations
  const visibleLocations = useMemo(() => {
    const visible = new Set<number>()
    const allLocationMap = new Map(locations.map(loc => [loc.id, loc]))
    
    // Add filtered locations
    filteredLocations.forEach(loc => visible.add(loc.id))
    
    // Add all ancestors
    filteredLocations.forEach(loc => {
      let current: Location | undefined = loc
      while (current) {
        visible.add(current.id)
        if (current.parentId !== null) {
          current = allLocationMap.get(current.parentId)
        } else {
          break
        }
      }
    })
    
    // Return locations from all locations that are visible
    const result = locations.filter(loc => visible.has(loc.id))
    console.log('[CollectionTreePicker] visibleLocations:', result.length, result)
    return result
  }, [filteredLocations, locations])

  // Automatically expand all nodes when searching
  // Only run when search text actually changes, not when other dependencies change
  useEffect(() => {
    // Only auto-expand if search text changed (not on every render)
    if (search.trim() !== lastSearch.trim()) {
      setLastSearch(search)
      
      if (search.trim()) {
        const all = new Set<number>()
        const allLocationMap = new Map(locations.map(loc => [loc.id, loc]))
        
        // Expand all matching locations and their ancestors
        filteredLocations.forEach((loc) => {
          let current: Location | undefined = loc
          while (current) {
            all.add(current.id)
            if (current.parentId !== null) {
              current = allLocationMap.get(current.parentId)
            } else {
              break
            }
          }
        })
        
        // Also expand locations that have matching collections
        collections.forEach((col) => {
          if (col.name.toLowerCase().includes(search.toLowerCase()) && col.locationId) {
            let current: Location | undefined = allLocationMap.get(col.locationId)
            while (current) {
              all.add(current.id)
              if (current.parentId !== null) {
                current = allLocationMap.get(current.parentId)
              } else {
                break
              }
            }
          }
        })
        
        // Merge with existing expandedIds to preserve manual expansions
        setExpandedIds((prev) => {
          const merged = new Set(prev)
          all.forEach(id => merged.add(id))
          return merged
        })
      }
      // Don't clear expanded state when search is cleared - let users keep their manual expansions
    }
  }, [search, lastSearch, filteredLocations, collections, locations])

  const renderLocationNode = (loc: Location, depth: number = 0): React.ReactNode => {
    // Check for children in ALL locations (to determine if expandable)
    // But only render children that are in visibleLocations
    const allChildren = getLocationChildren(locations, loc.id)
    const visibleChildren = getLocationChildren(visibleLocations, loc.id)
    const isExpanded = expandedIds.has(loc.id)
    const locCollections = collectionsByLocation[loc.id] || []
    const hasCollections = locCollections.length > 0
    // Location is visible if it's in the visibleLocations set
    const isVisible = visibleLocationIds.has(loc.id)

    if (!isVisible && depth > 0) return null
    
    // Show expand/collapse button if location has any children (even if not all are visible)
    const hasAnyChildren = allChildren.length > 0
    
    // Debug logging
    if (hasAnyChildren && depth === 0) {
      console.log(`Location ${loc.id} (${loc.name}): isExpanded=${isExpanded}, allChildren=${allChildren.length}, visibleChildren=${visibleChildren.length}, expandedIds=`, Array.from(expandedIds))
    }

    return (
      <div key={loc.id} className={depth > 0 ? 'ml-4 border-l border-gray-100 pl-2 mb-1' : 'mb-2'}>
        {hasAnyChildren ? (
          <button
            type="button"
            onMouseDown={(e) => {
              e.preventDefault()
              e.stopPropagation()
            }}
            onClick={(e) => {
              e.preventDefault()
              e.stopPropagation()
              console.log('Button clicked for location:', loc.id, loc.name)
              toggleExpanded(loc.id)
            }}
            onTouchStart={(e) => {
              e.stopPropagation()
            }}
            className="w-full flex items-center gap-2 px-2 py-1.5 rounded hover:bg-gray-50 transition-colors text-left group relative cursor-pointer"
            style={{ zIndex: 100, position: 'relative' }}
          >
            <div className="flex-shrink-0 w-5 h-5 flex items-center justify-center text-gray-500 group-hover:text-gray-700">
              {isExpanded ? (
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              ) : (
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              )}
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-sm text-gray-800 font-medium group-hover:text-gray-900">
                {getLocationLabel(loc)}
              </div>
              {loc.path && (
                <div className="text-[10px] text-gray-400 font-mono truncate">
                  {loc.path}
                </div>
              )}
              {loc.description && (
                <div className="text-[10px] text-gray-500 italic truncate">
                  {loc.description}
                </div>
              )}
            </div>
          </button>
        ) : (
          <div className="flex items-center px-2 py-1.5">
            <div className="w-5 flex-shrink-0"></div>
            <div className="flex-1 min-w-0">
              <div className="text-sm text-gray-800 font-medium">
                {getLocationLabel(loc)}
              </div>
              {loc.path && (
                <div className="text-[10px] text-gray-400 font-mono truncate">
                  {loc.path}
                </div>
              )}
              {loc.description && (
                <div className="text-[10px] text-gray-500 italic truncate">
                  {loc.description}
                </div>
              )}
            </div>
          </div>
        )}

         {hasAnyChildren && isExpanded && (
           <div className="mt-1">
             {visibleChildren.length > 0 ? (
               visibleChildren.map((child) => renderLocationNode(child, depth + 1))
             ) : (
               <div className="ml-4 text-xs text-gray-400 italic">
                 (No visible children)
               </div>
             )}
           </div>
         )}

        {hasCollections && (
          <div className="ml-4 space-y-1 mt-1">
            {locCollections.map((col) => {
              const isDisabled = col.id === disabledId && col.type === disabledType
              return (
                <button
                  key={`${col.type}-${col.id}`}
                  disabled={isDisabled}
                  onClick={() => onSelect(col.type, col.id, col.name)}
                  className={`w-full text-left px-3 py-2 border border-gray-100 rounded-lg transition-colors ${
                    isDisabled
                      ? 'bg-gray-50 text-gray-400 cursor-not-allowed opacity-60'
                      : 'hover:border-blue-300 hover:bg-blue-50 text-gray-900'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="font-medium text-xs">{col.name}</span>
                    <span className="text-[10px] uppercase tracking-wider text-gray-400 px-1.5 py-0.5 bg-gray-100 rounded">
                      {col.type}
                    </span>
                  </div>
                  <div className="text-[10px] text-gray-500 mt-0.5">
                    {col.itemCount} item{col.itemCount !== 1 ? 's' : ''}
                    {isDisabled && ' (current)'}
                  </div>
                </button>
              )
            })}
          </div>
        )}
      </div>
    )
  }

  const renderUnassignedCollections = () => {
    console.log('[CollectionTreePicker] renderUnassignedCollections - unassignedCollections:', unassignedCollections.length)
    if (unassignedCollections.length === 0) {
      console.log('[CollectionTreePicker] renderUnassignedCollections - returning null (no unassigned collections)')
      return null
    }

    // Filter unassigned collections by search if applicable
    const filteredUnassigned = search.trim()
      ? unassignedCollections.filter((c) =>
          c.name.toLowerCase().includes(search.toLowerCase())
        )
      : unassignedCollections

    console.log('[CollectionTreePicker] renderUnassignedCollections - filteredUnassigned:', filteredUnassigned.length)
    if (filteredUnassigned.length === 0) {
      console.log('[CollectionTreePicker] renderUnassignedCollections - returning null (filtered out by search)')
      return null
    }

    console.log('[CollectionTreePicker] renderUnassignedCollections - rendering', filteredUnassigned.length, 'collections')
    return (
      <div className="mb-4 pb-4 border-b border-gray-200">
        <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2 px-1">
          Unassigned Collections
        </div>
        <div className="space-y-1">
          {filteredUnassigned.map((col) => {
            const isDisabled = col.id === disabledId && col.type === disabledType
            return (
              <button
                key={`${col.type}-${col.id}`}
                disabled={isDisabled}
                onClick={() => onSelect(col.type, col.id, col.name)}
                className={`w-full text-left px-3 py-2 border border-gray-100 rounded-lg transition-colors ${
                  isDisabled
                    ? 'bg-gray-50 text-gray-400 cursor-not-allowed opacity-60'
                    : 'hover:border-blue-300 hover:bg-blue-50 text-gray-900'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="font-medium text-xs">{col.name}</span>
                  <span className="text-[10px] uppercase tracking-wider text-gray-400 px-1.5 py-0.5 bg-gray-100 rounded">
                    {col.type}
                  </span>
                </div>
                <div className="text-[10px] text-gray-500 mt-0.5">
                  {col.itemCount} item{col.itemCount !== 1 ? 's' : ''}
                  {isDisabled && ' (current)'}
                </div>
              </button>
            )
          })}
        </div>
      </div>
    )
  }

  const renderLocationTree = () => {
    // Get root locations from visible locations
    const rootLocations = getRootLocations(visibleLocations)
    console.log('[CollectionTreePicker] renderLocationTree - filteredLocations:', filteredLocations.length)
    console.log('[CollectionTreePicker] renderLocationTree - visibleLocations:', visibleLocations.length)
    console.log('[CollectionTreePicker] renderLocationTree - rootLocations:', rootLocations.length, rootLocations)
    console.log('[CollectionTreePicker] renderLocationTree - unassignedCollections:', unassignedCollections.length)
    console.log('[CollectionTreePicker] renderLocationTree - loading:', loading)
    
    if (rootLocations.length === 0 && unassignedCollections.length === 0 && !loading) {
      return (
        <div className="p-4 text-center text-gray-500 text-sm">
          No matching locations or collections found.
        </div>
      )
    }

    return (
      <>
        {rootLocations.map((root) => renderLocationNode(root, 0))}
      </>
    )
  }

  return (
    <div className="flex flex-col space-y-4 relative z-0">
      <div className="relative z-0">
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Filter by location or collection name..."
          className="w-full px-4 py-2 border border-gray-100 rounded-lg shadow-sm focus:ring-blue-500 focus:border-blue-500 text-sm"
        />
        {search && (
          <button
            onClick={() => setSearch('')}
            className="absolute right-3 top-2.5 text-gray-400 hover:text-gray-600 z-10"
          >
            ×
          </button>
        )}
      </div>

      <div className="border border-gray-100 rounded-lg overflow-y-auto max-h-[500px] p-2 bg-white relative z-0">
        <div className="relative z-0">
          {renderUnassignedCollections()}
          {renderLocationTree()}
          {filteredLocations.length === 0 && unassignedCollections.length === 0 && !loading && (
            <div className="p-4 text-center text-gray-500 text-sm">
              No matching locations or collections found.
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

