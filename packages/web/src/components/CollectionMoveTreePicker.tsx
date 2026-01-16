import { useState, useMemo, useCallback, memo, useEffect } from 'react'
import { type Location } from '../lib/api'
import { getRootLocations, getLocationChildren, getLocationLabel } from '../lib/location-tree'

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
  selectedIds: Set<number>
  onToggle: (id: number) => void
  onSelectAll?: () => void
  onDeselectAll?: () => void
  onSelectAllAtLocation?: (locationId: number) => void
  loading?: boolean
  filterEmptyLocations?: boolean
}

export default function CollectionMoveTreePicker({
  locations,
  collections,
  selectedIds,
  onToggle,
  onSelectAll,
  onDeselectAll,
  onSelectAllAtLocation,
  loading = false,
  filterEmptyLocations = false,
}: CollectionMoveTreePickerProps) {
  const [search, setSearch] = useState('')
  const [expandedIds, setExpandedIds] = useState<Set<number>>(new Set())

  // Map collections by location ID
  const collectionsByLocation = useMemo(() => {
    const map: Record<number, Collection[]> = {}
    collections.forEach((c) => {
      if (c.locationId) {
        if (!map[c.locationId]) map[c.locationId] = []
        map[c.locationId].push(c)
      }
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
      filtered = filtered.filter((loc) => {
        return (collectionsByLocation[loc.id] || []).length > 0
      })
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
          (c) =>
            c.name.toLowerCase().includes(term) ||
            (c.barcode || '').toLowerCase().includes(term)
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

  // Pre-compute which locations should be visible when not searching (locations with collections or descendants with collections)
  const locationsWithCollections = useMemo(() => {
    const visible = new Set<number>()
    
    // First pass: mark locations that directly have collections
    locations.forEach((loc) => {
      if ((collectionsByLocation[loc.id] || []).length > 0) {
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

  // Automatically expand all nodes when searching
  useEffect(() => {
    if (search.trim()) {
      setExpandedIds(visibleLocationIds)
    }
  }, [search, visibleLocationIds])

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
        return 'bg-blue-100 text-blue-800'
      case 'cryovial_box':
        return 'bg-green-100 text-green-800'
      case 'box':
        return 'bg-purple-100 text-purple-800'
      case 'bag':
        return 'bg-orange-100 text-orange-800'
      default:
        return 'bg-gray-100 text-gray-800'
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
    const isExpanded = expandedIds.has(loc.id)
    const locCollections = collectionsByLocation[loc.id] || []
    const hasCollections = locCollections.length > 0
    const isLeaf = leafLocations.has(loc.id)
    
    // Check if all collections at this location are selected
    const allSelectedAtLocation = hasCollections && locCollections.every((col) => selectedIds.has(col.id))
    
    // Fast visibility check using pre-computed sets
    const isVisible = search.trim() 
      ? visibleLocationIds.has(loc.id)
      : locationsWithCollections.has(loc.id)

    if (!isVisible && depth > 0) return null

    return (
      <div key={loc.id} className="mb-2">
        <div className="flex items-center gap-2 py-1.5">
          <button
            type="button"
            onClick={() => toggleExpanded(loc.id)}
            className="flex items-center gap-1.5 text-sm text-gray-700 hover:text-gray-900 flex-shrink-0"
            disabled={children.length === 0 && !hasCollections}
          >
            {children.length > 0 || hasCollections ? (
              <span className="text-gray-400 w-4 text-center">
                {isExpanded ? '▼' : '▶'}
              </span>
            ) : (
              <span className="w-4" />
            )}
            <span className="font-medium">{loc.name}</span>
            {loc.path && loc.path !== loc.name && (
              <span className="text-xs text-gray-500">({loc.path})</span>
            )}
            {hasCollections && (
              <span className="text-xs text-gray-400 ml-1">
                ({locCollections.length} collection{locCollections.length !== 1 ? 's' : ''})
              </span>
            )}
          </button>
          {isLeaf && hasCollections && onSelectAllAtLocation && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation()
                handleSelectAllAtLocation(loc.id)
              }}
              className={`ml-auto text-xs px-2 py-1 rounded ${
                allSelectedAtLocation
                  ? 'bg-blue-100 text-blue-700 hover:bg-blue-200'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              } transition-colors`}
            >
              {allSelectedAtLocation ? 'Deselect All' : 'Select All'}
            </button>
          )}
        </div>

        {hasCollections && isExpanded && (
          <div className="ml-6 mt-1 space-y-1 border-l-2 border-gray-200 pl-3">
            {locCollections.map((col) => (
              <label
                key={col.id}
                className="flex items-start gap-3 py-2 px-3 hover:bg-gray-50 rounded cursor-pointer border border-transparent hover:border-gray-200 transition-colors"
              >
                <input
                  type="checkbox"
                  checked={selectedIds.has(col.id)}
                  onChange={() => onToggle(col.id)}
                  className="mt-0.5 rounded border-gray-300 text-blue-600 focus:ring-blue-500 flex-shrink-0"
                />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="font-medium text-gray-900">{col.name}</span>
                    <span
                      className={`text-xs px-1.5 py-0.5 rounded font-medium ${getCollectionTypeBadgeColor(
                        col.type
                      )}`}
                    >
                      {getCollectionTypeLabel(col.type)}
                    </span>
                  </div>
                  <div className="flex items-center gap-3 text-xs text-gray-500">
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
    expandedIds,
    collectionsByLocation,
    selectedIds,
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
        <div className="p-4 text-center text-gray-500 text-sm">
          No matching locations or collections found.
        </div>
      )
    }

    if (loading) {
      return <div className="p-4 text-center text-gray-500 text-sm">Loading...</div>
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
          className="w-full px-4 py-2 border border-gray-100 rounded-lg shadow-sm focus:ring-blue-500 focus:border-blue-500 text-sm"
        />
        {search && (
          <button
            onClick={() => setSearch('')}
            className="absolute right-3 top-2.5 text-gray-400 hover:text-gray-600"
          >
            ×
          </button>
        )}
      </div>

      {selectedIds.size > 0 && (
        <div className="flex items-center justify-between p-3 bg-blue-50 border border-blue-200 rounded-lg">
          <span className="text-sm font-medium text-blue-900">
            {selectedIds.size} collection{selectedIds.size !== 1 ? 's' : ''} selected
          </span>
          <div className="flex gap-2">
            {onSelectAll && (
              <button
                onClick={onSelectAll}
                className="text-xs text-blue-600 hover:text-blue-800 font-medium"
              >
                Select All
              </button>
            )}
            {onDeselectAll && (
              <button
                onClick={onDeselectAll}
                className="text-xs text-blue-600 hover:text-blue-800 font-medium"
              >
                Clear
              </button>
            )}
          </div>
        </div>
      )}

      <div className="border border-gray-100 rounded-lg overflow-y-auto max-h-[500px] p-2 bg-white">
        {renderLocationTree()}
      </div>
    </div>
  )
}

