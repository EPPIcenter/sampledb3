import { useState, useMemo } from 'react'
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

  const toggleExpanded = (locationId: number) => {
    setExpandedIds((prev) => {
      const next = new Set(prev)
      if (next.has(locationId)) {
        next.delete(locationId)
      } else {
        next.add(locationId)
      }
      return next
    })
  }

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

  // Automatically expand all nodes when searching
  useMemo(() => {
    if (search.trim()) {
      const all = new Set<number>()
      filteredLocations.forEach((loc) => {
        // Expand all ancestors to show matching locations
        let current: Location | undefined = loc
        while (current) {
          all.add(current.id)
          if (current.parentId !== null) {
            current = locations.find((l) => l.id === current!.parentId)
          } else {
            break
          }
        }
      })
      setExpandedIds(all)
    }
  }, [search, filteredLocations, locations])

  const getCollectionTypeLabel = (type: string) => {
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
  }

  const renderLocationNode = (loc: Location, depth: number = 0): React.ReactNode => {
    const children = getLocationChildren(locations, loc.id)
    const isExpanded = expandedIds.has(loc.id)
    const locCollections = collectionsByLocation[loc.id] || []
    const hasCollections = locCollections.length > 0
    const isVisible = filteredLocations.some((f) => {
      if (f.id === loc.id) return true
      // Check if any descendant is in filtered list
      const checkDescendants = (parentId: number | null): boolean => {
        const directChildren = locations.filter((l) => l.parentId === parentId)
        return directChildren.some((child) => {
          if (filteredLocations.some((f) => f.id === child.id)) return true
          return checkDescendants(child.id)
        })
      }
      return checkDescendants(loc.id)
    })

    if (!isVisible && depth > 0) return null

    return (
      <div key={loc.id} className="mb-1">
        <div className="flex items-center gap-2 py-1">
          <button
            type="button"
            onClick={() => toggleExpanded(loc.id)}
            className="flex items-center gap-1.5 text-sm text-gray-700 hover:text-gray-900"
            disabled={children.length === 0 && !hasCollections}
          >
            {children.length > 0 || hasCollections ? (
              <span className="text-gray-400">
                {isExpanded ? '▼' : '▶'}
              </span>
            ) : (
              <span className="w-3" />
            )}
            <span className="font-medium">{loc.name}</span>
            {loc.path && loc.path !== loc.name && (
              <span className="text-xs text-gray-500">({loc.path})</span>
            )}
          </button>
        </div>

        {hasCollections && isExpanded && (
          <div className="ml-6 mt-1 space-y-1">
            {locCollections.map((col) => (
              <label
                key={col.id}
                className="flex items-center gap-2 py-1 px-2 hover:bg-gray-50 rounded cursor-pointer"
              >
                <input
                  type="checkbox"
                  checked={selectedIds.has(col.id)}
                  onChange={() => onToggle(col.id)}
                  className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                />
                <div className="flex-1 text-sm">
                  <div className="font-medium text-gray-900">{col.name}</div>
                  <div className="text-xs text-gray-500">
                    {getCollectionTypeLabel(col.type)} • {col.itemCount} item{col.itemCount !== 1 ? 's' : ''}
                  </div>
                  {col.barcode && (
                    <div>Barcode: {col.barcode}</div>
                  )}
                  <div>
                    {col.itemCount} item{col.itemCount !== 1 ? 's' : ''}
                  </div>
                  {col.location?.path && (
                    <div className="text-gray-400">
                      {col.location.path}
                    </div>
                  )}
                </div>
              </label>
            ))}
          </div>
        )}

        {children.length > 0 && isExpanded && (
          <div className="mt-1">
            {children.map((child) => renderLocationNode(child, depth + 1))}
          </div>
        )}
      </div>
    )
  }

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

