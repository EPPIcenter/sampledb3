import { useState, useMemo } from 'react'
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

  // Filter to only collection-capable locations
  const collectionLocations = useMemo(() => {
    return locations.filter(loc => loc.canContainCollections)
  }, [locations])

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
    let filtered = collectionLocations

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
          (c) => c.name.toLowerCase().includes(term)
        )

        return locMatch || collectionsMatch
      })
    }

    return filtered
  }, [collectionLocations, search, collectionsByLocation, filterEmptyLocations])

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
            current = collectionLocations.find((l) => l.id === current!.parentId)
          } else {
            break
          }
        }
      })
      setExpandedIds(all)
    }
  }, [search, filteredLocations, collectionLocations])

  const renderLocationNode = (loc: Location, depth: number = 0): React.ReactNode => {
    const children = getLocationChildren(collectionLocations, loc.id)
    const isExpanded = expandedIds.has(loc.id)
    const locCollections = collectionsByLocation[loc.id] || []
    const hasCollections = locCollections.length > 0
    const isVisible = filteredLocations.some((f) => {
      // Include if location matches or any descendant matches
      if (f.id === loc.id) return true
      // Check if any descendant is in filtered list
      const checkDescendants = (parentId: number | null): boolean => {
        const directChildren = collectionLocations.filter((l) => l.parentId === parentId)
        return directChildren.some((child) => {
          if (filteredLocations.some((f) => f.id === child.id)) return true
          return checkDescendants(child.id)
        })
      }
      return checkDescendants(loc.id)
    })

    if (!isVisible && depth > 0) return null

    return (
      <div key={loc.id} className={depth > 0 ? 'ml-4 border-l border-gray-100 pl-2 mb-1' : 'mb-2'}>
        <div className="flex items-center">
          {children.length > 0 && (
            <button
              type="button"
              onClick={() => toggleExpanded(loc.id)}
              className="w-4 text-gray-400 text-xs flex-shrink-0"
            >
              {isExpanded ? '▼' : '▶'}
            </button>
          )}
          {children.length === 0 && <span className="w-4"></span>}
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

        {children.length > 0 && isExpanded && (
          <div className="mt-1">
            {children.map((child) => renderLocationNode(child, depth + 1))}
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

  const renderLocationTree = () => {
    const rootLocations = getRootLocations(collectionLocations)
    
    if (rootLocations.length === 0 && !loading) {
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

      <div className="border border-gray-100 rounded-lg overflow-y-auto max-h-[500px] p-2 bg-white">
        {renderLocationTree()}
        {filteredLocations.length === 0 && !loading && (
          <div className="p-4 text-center text-gray-500 text-sm">
            No matching locations or collections found.
          </div>
        )}
      </div>
    </div>
  )
}

