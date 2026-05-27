import { useState, useMemo, useCallback } from 'react'
import type { Location } from '../lib/api/types';
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

  // Filter to only collection-capable locations
  const collectionLocations = useMemo(() => {
    return locations.filter(loc => loc.canContainCollections)
  }, [locations])

  // Map collections by location ID, and track collections without locations
  const collectionsByLocation = useMemo(() => {
    const map: Record<number, Collection[]> = {}
    collections.forEach((c) => {
      const lid = c.locationId as number | null | undefined
      if (lid != null) {
        // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- map key may be new
        if (!map[lid]) map[lid] = []
        map[lid].push(c)
      }
    })
    return map
  }, [collections])

  // Collections without a location, or with a location that doesn't support collections
  const unassignedCollections = useMemo(() => {
    const locationIds = new Set(collectionLocations.map(loc => loc.id))
    return collections.filter((c) => {
       
      const lid = c.locationId
      if (lid == null) return true
      return !locationIds.has(lid)
    })
  }, [collections, collectionLocations])

  const toggleExpanded = (locationId: number) => {
    setExpandedIds((prev) => {
      const next = new Set(prev)
      const wasExpanded = next.has(locationId)
      if (wasExpanded) {
        next.delete(locationId)
      } else {
        next.add(locationId)
      }
      return next
    })
  }

  // Filter locations based on search and filterEmptyLocations
  const filteredLocations = useMemo(() => {
    // Only include locations that are in collectionLocations AND have collections mapped to them
    const locationIdsWithCollections = new Set(Object.keys(collectionsByLocation).map(Number))
    let filtered = collectionLocations.filter((loc) => locationIdsWithCollections.has(loc.id))

    if (filterEmptyLocations) {
      filtered = filtered.filter((loc) => collectionsByLocation[loc.id].length > 0)
    }

    // Apply search filter
    if (search.trim()) {
      const term = search.toLowerCase()
      filtered = filtered.filter((loc) => {
        const locMatch =
          loc.name.toLowerCase().includes(term) ||
          (loc.path ?? '').toLowerCase().includes(term) ||
          (loc.description ?? '').toLowerCase().includes(term)

        const collectionsMatch = collectionsByLocation[loc.id].some(
          (c) => c.name.toLowerCase().includes(term)
        )

        return locMatch || collectionsMatch
      })
    }

    return filtered
  }, [collectionLocations, search, collectionsByLocation, filterEmptyLocations])

  // Build a set of all location IDs that should be visible
  // This includes filteredLocations and all their ancestors
  // We need to use ALL locations (not just collectionLocations) to find ancestors
  const visibleLocationIds = useMemo(() => {
    const visible = new Set<number>()
    const allLocationMap = new Map(locations.map(loc => [loc.id, loc]))

    filteredLocations.forEach(loc => visible.add(loc.id))

    filteredLocations.forEach(loc => {
      let current: Location | undefined = loc
      while (current) {
        visible.add(current.id)
        const pid = current.parentId
        if (pid !== null) {
          current = allLocationMap.get(pid)
        } else {
          break
        }
      }
    })

    return visible
  }, [filteredLocations, locations])
  
  // Get all locations that should be visible (filtered + ancestors)
  // Include both collectionLocations and any ancestors from all locations
  const visibleLocations = useMemo(() => {
    const visible = new Set<number>()
    const allLocationMap = new Map(locations.map(loc => [loc.id, loc]))
    
    // Add filtered locations
    filteredLocations.forEach(loc => visible.add(loc.id))
    
    filteredLocations.forEach(loc => {
      let current: Location | undefined = loc
      while (current) {
        visible.add(current.id)
        const pid = current.parentId
        if (pid != null) {
          current = allLocationMap.get(pid)
        } else {
          break
        }
      }
    })

    return locations.filter(loc => visible.has(loc.id))
  }, [filteredLocations, locations])

  if (search.trim() !== lastSearch.trim()) {
    setLastSearch(search)
    if (search.trim()) {
      const all = new Set<number>()
      const allLocationMap = new Map(locations.map(loc => [loc.id, loc]))
      filteredLocations.forEach((loc) => {
        let current: Location | undefined = loc
        while (current) {
          all.add(current.id)
          const pid = current.parentId
          if (pid != null) {
            current = allLocationMap.get(pid)
          } else {
            break
          }
        }
      })
      collections.forEach((col) => {
        if (col.name.toLowerCase().includes(search.toLowerCase()) && col.locationId) {
          let current: Location | undefined = allLocationMap.get(col.locationId)
          while (current) {
            all.add(current.id)
            const pid = current.parentId
            if (pid != null) {
              current = allLocationMap.get(pid)
            } else {
              break
            }
          }
        }
      })
      setExpandedIds((prev) => {
        const merged = new Set(prev)
        all.forEach(id => merged.add(id))
        return merged
      })
    }
  }

  const renderLocationNode = (loc: Location, depth: number = 0): React.ReactNode => {
    const allChildren = getLocationChildren(locations, loc.id)
    const visibleChildren = getLocationChildren(visibleLocations, loc.id)
    const isExpanded = expandedIds.has(loc.id)
    const locCollections = collectionsByLocation[loc.id] ?? []
    const hasCollections = locCollections.length > 0
    const isVisible = visibleLocationIds.has(loc.id)

    if (!isVisible && depth > 0) return null

    const hasAnyChildren = allChildren.length > 0

    const locationLabel = getLocationLabel(loc)
    const expandAriaLabel = isExpanded
      ? `Collapse ${locationLabel}`
      : `Expand ${locationLabel}`

    return (
      <div key={loc.id} className={depth > 0 ? 'ml-4 border-l border-app-border pl-2 mb-1' : 'mb-2'}>
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
              toggleExpanded(loc.id)
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault()
                toggleExpanded(loc.id)
              }
            }}
            onTouchStart={(e) => {
              e.stopPropagation()
            }}
            aria-expanded={isExpanded}
            aria-label={expandAriaLabel}
            className="storage-tree-picker-row w-full flex items-center gap-3 px-3 py-3 min-h-[44px] rounded-lg border border-transparent hover:bg-app-surface hover:border-app-border transition-colors text-left group relative cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-app-accent focus-visible:ring-offset-1"
            style={{ zIndex: 100, position: 'relative' }}
          >
            <div className="flex-shrink-0 w-5 h-5 flex items-center justify-center text-app-text-muted group-hover:text-app-text" aria-hidden>
              {isExpanded ? (
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              ) : (
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              )}
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-sm text-app-text font-medium group-hover:text-app-text">
                {locationLabel}
              </div>
              {loc.path && (
                <div className="text-[10px] text-app-text-muted font-mono truncate mt-0.5">
                  {loc.path}
                </div>
              )}
              {loc.description && (
                <div className="text-[10px] text-app-text-muted italic truncate mt-0.5">
                  {loc.description}
                </div>
              )}
            </div>
          </button>
        ) : (
          <div className="storage-tree-picker-row flex items-center gap-3 px-3 py-3 min-h-[44px] rounded-lg">
            <div className="w-5 flex-shrink-0" aria-hidden />
            <div className="flex-1 min-w-0">
              <div className="text-sm text-app-text font-medium">
                {getLocationLabel(loc)}
              </div>
              {loc.path && (
                <div className="text-[10px] text-app-text-muted font-mono truncate mt-0.5">
                  {loc.path}
                </div>
              )}
              {loc.description && (
                <div className="text-[10px] text-app-text-muted italic truncate mt-0.5">
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
               <div className="ml-4 text-xs text-app-text-muted italic">
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
                  className={`w-full text-left px-3 py-3 min-h-[44px] border border-app-border rounded-lg transition-colors ${
                    isDisabled
                      ? 'bg-app-surface text-app-text-muted cursor-not-allowed opacity-60'
                      : 'hover:border-app-accent/50 hover:bg-app-accent-muted/30 text-app-text'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="font-medium text-xs">{col.name}</span>
                    <span className="text-[10px] uppercase tracking-wider text-app-text-muted px-1.5 py-0.5 bg-app-surface rounded">
                      {col.type}
                    </span>
                  </div>
                  <div className="text-[10px] text-app-text-muted mt-0.5">
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
    if (unassignedCollections.length === 0) {
      return null
    }

    // Filter unassigned collections by search if applicable
    const filteredUnassigned = search.trim()
      ? unassignedCollections.filter((c) =>
          c.name.toLowerCase().includes(search.toLowerCase())
        )
      : unassignedCollections

    if (filteredUnassigned.length === 0) {
      return null
    }

    return (
      <div className="mb-4 pb-4 border-b border-app-border">
        <div className="text-xs font-semibold text-app-text-muted uppercase tracking-wide mb-2 px-1">
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
                className={`w-full text-left px-3 py-3 min-h-[44px] border border-app-border rounded-lg transition-colors ${
                  isDisabled
                    ? 'bg-app-surface text-app-text-muted cursor-not-allowed opacity-60'
                    : 'hover:border-app-accent/50 hover:bg-app-accent-muted/30 text-app-text'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="font-medium text-xs">{col.name}</span>
                  <span className="text-[10px] uppercase tracking-wider text-app-text-muted px-1.5 py-0.5 bg-app-surface rounded">
                    {col.type}
                  </span>
                </div>
                <div className="text-[10px] text-app-text-muted mt-0.5">
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
    
    if (rootLocations.length === 0 && unassignedCollections.length === 0 && !loading) {
      return (
        <div className="p-4 text-center text-app-text-muted text-sm">
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
          className="w-full px-4 py-2 border border-app-border rounded-lg shadow-sm bg-app-card text-app-text focus:ring-2 focus:ring-app-accent focus:border-app-accent text-sm"
        />
        {search && (
          <button
            onClick={() => setSearch('')}
            className="absolute right-3 top-2.5 text-app-text-muted hover:text-app-text z-10"
          >
            ×
          </button>
        )}
      </div>

      <div className="border border-app-border rounded-lg overflow-y-auto max-h-[500px] p-2 bg-app-card relative z-0">
        <div className="relative z-0">
          {renderUnassignedCollections()}
          {renderLocationTree()}
          {filteredLocations.length === 0 && unassignedCollections.length === 0 && !loading && (
            <div className="p-4 text-center text-app-text-muted text-sm">
              No matching locations or collections found.
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

