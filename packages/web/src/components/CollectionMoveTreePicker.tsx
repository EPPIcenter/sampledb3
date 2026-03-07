 
import { useState, useMemo, useCallback, memo } from 'react'
import { type Location } from '../lib/api'
import { getRootLocations, getLocationChildren, getLocationLabel } from '../lib/location-tree'
import type { CollectionType } from '../pages/CollectionMove'

export interface Collection {
  id: number
  name: string
  type: 'micronix_plate' | 'cryovial_box' | 'box' | 'bag'
  itemCount: number
  locationId?: number | null
  location?: {
    id: number
    path: string
  } | null
  barcode?: string | null
}

interface CollectionMoveTreePickerProps {
  locations: Location[]
  collections: Collection[]
  selectedKeys: Set<string>
  onToggle: (id: number, type: CollectionType) => void
  onSelectAll?: () => void
  onDeselectAll?: () => void
  onSelectAllAtLocation?: (locationId: number) => void
  loading?: boolean
  filterEmptyLocations?: boolean
}

export default function CollectionMoveTreePicker({
  locations,
  collections,
  selectedKeys,
  onToggle,
  onSelectAll,
  onDeselectAll,
  onSelectAllAtLocation,
  loading = false,
  filterEmptyLocations = false,
}: CollectionMoveTreePickerProps) {
  const [search, setSearch] = useState('')
  const [expandedIds, setExpandedIds] = useState<Set<number>>(new Set())

  // Map collections by location ID (only those with a location; API can return null for unassigned)
  const collectionsByLocation = useMemo(() => {
    const map: Partial<Record<number, Collection[]>> = {}
    const withLocation = collections.filter((c): c is Collection & { locationId: number } =>
      c.locationId != null
    )
    withLocation.forEach((c) => {
      const lid = c.locationId
      if (!map[lid]) map[lid] = []
      map[lid]!.push(c)
    })
    return map
  }, [collections])

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

  // Pre-compute leaf locations (locations with no children)
  const leafLocations = useMemo(() => {
    const leafSet = new Set<number>()
    locations.forEach((loc) => {
      if (!locationChildrenMap.has(loc.id)) {
        leafSet.add(loc.id)
      }
    })
    return leafSet
  }, [locations, locationChildrenMap])

  // Pre-compute location map for O(1) lookup
  const locationMap = useMemo(() => {
    const map = new Map<number, Location>()
    locations.forEach((loc) => map.set(loc.id, loc))
    return map
  }, [locations])

  // Filter locations based on search and filterEmptyLocations
  const filteredLocations = useMemo(() => {
    let filtered = locations

    // Filter by collections if needed
    if (filterEmptyLocations) {
      filtered = filtered.filter((loc) => (collectionsByLocation[loc.id] ?? []).length > 0)
    }

    // Apply search filter
    if (search.trim()) {
      const term = search.toLowerCase()
      filtered = filtered.filter((loc) => {
        const locMatch =
          loc.name.toLowerCase().includes(term) ||
          (loc.path ?? '').toLowerCase().includes(term) ||
          (loc.description ?? '').toLowerCase().includes(term)

        const collectionsMatch = (collectionsByLocation[loc.id] ?? []).some(
          (c) =>
            c.name.toLowerCase().includes(term) ||
            (c.barcode ?? '').toLowerCase().includes(term)
        )

        return locMatch || collectionsMatch
      })
    }

    return filtered
  }, [locations, search, collectionsByLocation, filterEmptyLocations])

  // Pre-compute visible locations set when searching
  const visibleLocationIds = useMemo(() => {
    if (!search.trim()) {
      return new Set<number>() // Empty set means all are visible
    }
    const visible = new Set<number>()
    
    // Find all matching locations and their ancestors
    filteredLocations.forEach((loc) => {
      let current: Location | undefined = loc
      while (current) {
        visible.add(current.id)
         
        if (current.parentId !== null) {
          current = locationMap.get(current.parentId)
        } else {
          break
        }
         
      }
    })
    return visible
  }, [search, filteredLocations, locationMap])

  // When searching, show all matching nodes expanded; otherwise use user's expand/collapse state
  const effectiveExpandedIds = search.trim() ? visibleLocationIds : expandedIds

  // Pre-compute which locations should be visible when not searching (locations with collections or descendants with collections)
  const locationsWithCollections = useMemo(() => {
    const visible = new Set<number>()
    
    // First pass: mark locations that directly have collections
    locations.forEach((loc) => {
      if ((collectionsByLocation[loc.id] ?? []).length > 0) {
        visible.add(loc.id)
      }
    })
    
    // Second pass: mark all ancestors of locations with collections
    const markAncestors = (locationId: number) => {
      const loc = locationMap.get(locationId)
      if (!loc || loc.parentId === null) return
      visible.add(loc.parentId)
      markAncestors(loc.parentId)
    }
    
    visible.forEach((locId) => markAncestors(locId))
    
    return visible
  }, [locations, collectionsByLocation, locationMap])

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

  const getCollectionTypeLabel = useCallback((type: string) => {
    switch (type) {
      case 'micronix_plate':
        return 'PLATE'
      case 'cryovial_box':
        return 'CRYOVIAL'
      case 'box':
        return 'BOX'
      case 'bag':
        return 'BAG'
      default:
        return type.toUpperCase()
    }
  }, [])

  const getCollectionTypeBadgeColor = useCallback((type: string) => {
    switch (type) {
      case 'micronix_plate':
        return 'bg-app-accent-muted text-app-accent-hover'
      case 'cryovial_box':
        return 'bg-app-trend-up/10 text-app-trend-up'
      case 'box':
        return 'bg-purple-100 text-purple-800'
      case 'bag':
        return 'bg-orange-100 text-orange-800'
      default:
        return 'bg-app-surface text-app-text-muted'
    }
  }, [])

  // Handle select all at location
  const handleSelectAllAtLocation = useCallback((locationId: number) => {
    if (!onSelectAllAtLocation) return
    onSelectAllAtLocation(locationId)
  }, [onSelectAllAtLocation])

  // Memoized location node renderer
  const renderLocationNode = useCallback((loc: Location, depth: number = 0): React.ReactNode => {
    const children = locationChildrenMap.get(loc.id) || []
    const isExpanded = effectiveExpandedIds.has(loc.id)
    const locCollections = collectionsByLocation[loc.id] ?? []
    const hasCollections = locCollections.length > 0
    const isLeaf = leafLocations.has(loc.id)
    
    // Check if all collections at this location are selected (composite key type:id)
    const allSelectedAtLocation = hasCollections && locCollections.every((col) => selectedKeys.has(`${col.type}:${col.id}`))
    
    // Fast visibility check using pre-computed sets
    const isVisible = search.trim() 
      ? visibleLocationIds.has(loc.id)
      : locationsWithCollections.has(loc.id)

    if (!isVisible && depth > 0) return null

    const storageTypeLabel = loc.effectiveStorageTypeName || loc.storageTypeName
    const canExpand = children.length > 0 || hasCollections
    const expandAriaLabel = isExpanded
      ? `Collapse ${loc.name}`
      : `Expand ${loc.name}`

    return (
      <div key={loc.id} className="mb-2">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => toggleExpanded(loc.id)}
            disabled={!canExpand}
            aria-expanded={canExpand ? isExpanded : undefined}
            aria-label={canExpand ? expandAriaLabel : undefined}
            onKeyDown={(e) => {
              if (canExpand && (e.key === 'Enter' || e.key === ' ')) {
                e.preventDefault()
                toggleExpanded(loc.id)
              }
            }}
            className="storage-tree-picker-row flex-1 min-w-0 flex items-center gap-3 px-3 py-3 min-h-[44px] rounded-lg border border-transparent hover:bg-app-surface hover:border-app-border transition-colors text-left group cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-app-accent focus-visible:ring-offset-1 disabled:cursor-default disabled:hover:bg-transparent disabled:hover:border-transparent disabled:opacity-70"
          >
            {canExpand ? (
              <span className="flex-shrink-0 w-5 h-5 flex items-center justify-center text-app-text-muted group-hover:text-app-text" aria-hidden>
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
            ) : (
              <span className="w-5 flex-shrink-0" aria-hidden />
            )}
            <div className="flex-1 min-w-0">
              <span className="font-medium text-sm text-app-text group-hover:text-app-text">{loc.name}</span>
              {loc.path && loc.path !== loc.name && (
                <span className="text-xs text-app-text-muted ml-1">({loc.path})</span>
              )}
              {storageTypeLabel && (
                <span className="text-xs text-app-text-muted ml-1">({storageTypeLabel})</span>
              )}
              {hasCollections && (
                <span className="text-xs text-app-text-muted ml-1">
                  ({locCollections.length} collection{locCollections.length !== 1 ? 's' : ''})
                </span>
              )}
            </div>
          </button>
          {isLeaf && hasCollections && onSelectAllAtLocation && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation()
                handleSelectAllAtLocation(loc.id)
              }}
              className={`flex-shrink-0 text-xs px-3 py-2 min-h-[44px] rounded-lg font-medium transition-colors ${
                allSelectedAtLocation
                  ? 'bg-app-accent-muted text-app-accent-hover hover:bg-app-accent-muted/80'
                  : 'bg-app-surface text-app-text-muted hover:bg-app-border'
              }`}
            >
              {allSelectedAtLocation ? 'Deselect All' : 'Select All'}
            </button>
          )}
        </div>
        {loc.description && (
          <div className="ml-8 text-xs text-app-text-muted truncate max-w-full mt-0.5" title={loc.description}>
            {loc.description}
          </div>
        )}

        {hasCollections && isExpanded && (
          <div className="ml-6 mt-1 space-y-1 border-l-2 border-app-border pl-3">
            {locCollections.map((col) => (
              <label
                key={`${col.type}:${col.id}`}
                className="flex items-start gap-3 py-3 px-3 min-h-[44px] hover:bg-app-surface rounded-lg cursor-pointer border border-transparent hover:border-app-border transition-colors"
              >
                <input
                  type="checkbox"
                  checked={selectedKeys.has(`${col.type}:${col.id}`)}
                  onChange={() => onToggle(col.id, col.type)}
                  className="mt-0.5 rounded border-app-border text-app-accent focus:ring-app-accent flex-shrink-0"
                />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="font-medium dashboard-stat-value">{col.name}</span>
                    <span
                      className={`text-xs px-1.5 py-0.5 rounded font-medium ${getCollectionTypeBadgeColor(
                        col.type
                      )}`}
                    >
                      {getCollectionTypeLabel(col.type)}
                    </span>
                  </div>
                  <div className="flex items-center gap-3 text-xs dashboard-stat-muted">
                    <span>{col.itemCount} item{col.itemCount !== 1 ? 's' : ''}</span>
                    {col.barcode && (
                      <span className="font-mono">Barcode: {col.barcode}</span>
                    )}
                  </div>
                </div>
              </label>
            ))}
          </div>
        )}

        {children.length > 0 && isExpanded && (
          <div className="ml-6 mt-1">
            {children.map((child) => renderLocationNode(child, depth + 1))}
          </div>
        )}
      </div>
    )
  }, [
    locationChildrenMap,
    effectiveExpandedIds,
    collectionsByLocation,
    selectedKeys,
    leafLocations,
    search,
    visibleLocationIds,
    toggleExpanded,
    handleSelectAllAtLocation,
    onSelectAllAtLocation,
    onToggle,
    getCollectionTypeBadgeColor,
    getCollectionTypeLabel,
  ])

  const renderLocationTree = () => {
    const rootLocations = getRootLocations(locations)
    
    if (rootLocations.length === 0 && !loading) {
      return (
        <div className="p-4 text-center dashboard-stat-muted text-sm">
          No matching locations or collections found.
        </div>
      )
    }

    if (loading) {
      return <div className="p-4 text-center dashboard-stat-muted text-sm">Loading...</div>
    }

    return (
      <>
        {rootLocations.map((root) => renderLocationNode(root, 0))}
      </>
    )
  }

  return (
    <div className="flex flex-col space-y-4">
      <div className="relative">
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Filter by location or collection name..."
          className="w-full px-4 py-2 border border-app-border rounded-lg shadow-sm bg-app-card text-app-text focus:ring-app-accent focus:border-app-accent text-sm"
        />
        {search && (
          <button
            onClick={() => setSearch('')}
            className="absolute right-3 top-2.5 text-app-text-muted hover:text-app-text"
          >
            ×
          </button>
        )}
      </div>

      {selectedKeys.size > 0 && (
        <div className="flex items-center justify-between p-3 bg-app-accent-muted border border-app-accent rounded-lg">
          <span className="text-sm font-medium text-app-accent-hover">
            {selectedKeys.size} collection{selectedKeys.size !== 1 ? 's' : ''} selected
          </span>
          <div className="flex gap-2">
            {onSelectAll && (
              <button
                onClick={onSelectAll}
                className="text-xs text-app-accent-hover hover:text-app-accent-hover font-medium"
              >
                Select All
              </button>
            )}
            {onDeselectAll && (
              <button
                onClick={onDeselectAll}
                className="text-xs text-app-accent-hover hover:text-app-accent-hover font-medium"
              >
                Clear
              </button>
            )}
          </div>
        </div>
      )}

      <div className="border border-app-border rounded-lg overflow-y-auto max-h-[500px] p-2 bg-app-card">
        {renderLocationTree()}
      </div>
    </div>
  )
}

