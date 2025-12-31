import { useState, useMemo } from 'react'
import { type Location } from '../lib/api'
import { buildLocationTree, getLocationLabel } from '../lib/location-tree'

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
  const [expandedNodes, setExpandedNodes] = useState<Record<string, boolean>>({})

  const tree = useMemo(() => buildLocationTree(locations), [locations])

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

  const toggleNode = (id: string) => {
    setExpandedNodes((prev) => ({ ...prev, [id]: !prev[id] }))
  }

  const filteredTree = useMemo(() => {
    // First, filter tree to only include locations that have collections (if filterEmptyLocations is true)
    let baseTree = tree
    if (filterEmptyLocations) {
      const filteredByCollections: any = {}

      Object.entries(tree).forEach(([root, levelIGroup]) => {
        const filteredLevelI: any = {}
        let rootHasCollections = false

        Object.entries(levelIGroup).forEach(([levelI, locs]) => {
          const filteredLocs = locs.filter((loc) => {
            const hasCollections = (collectionsByLocation[loc.id] || []).length > 0
            return hasCollections
          })

          if (filteredLocs.length > 0) {
            filteredLevelI[levelI] = filteredLocs
            rootHasCollections = true
          }
        })

        if (rootHasCollections) {
          filteredByCollections[root] = filteredLevelI
        }
      })
      baseTree = filteredByCollections
    }

    // Then apply search filter if there's a search term
    if (!search.trim()) return baseTree

    const term = search.toLowerCase()
    const result: any = {}

    Object.entries(baseTree).forEach(([root, levelIGroup]) => {
      const filteredLevelI: any = {}
      let rootMatches = false

      Object.entries(levelIGroup).forEach(([levelI, locs]) => {
        const filteredLocs = (locs as Location[]).filter((loc) => {
          const locMatch =
            loc.locationRoot.toLowerCase().includes(term) ||
            loc.levelI.toLowerCase().includes(term) ||
            loc.levelII.toLowerCase().includes(term) ||
            (loc.levelIII || '').toLowerCase().includes(term) ||
            (loc.description || '').toLowerCase().includes(term)

          const collectionsMatch = (collectionsByLocation[loc.id] || []).some(
            (c) =>
              c.name.toLowerCase().includes(term) ||
              (c.barcode || '').toLowerCase().includes(term)
          )

          return locMatch || collectionsMatch
        })

        if (filteredLocs.length > 0) {
          filteredLevelI[levelI] = filteredLocs
          rootMatches = true
        }
      })

      if (rootMatches) {
        result[root] = filteredLevelI
      }
    })

    return result
  }, [tree, search, collectionsByLocation, filterEmptyLocations])

  // Automatically expand all nodes when searching
  useMemo(() => {
    if (search.trim()) {
      const all: Record<string, boolean> = {}
      Object.entries(filteredTree).forEach(([root, levelIGroup]) => {
        all[root] = true
        Object.keys(levelIGroup as any).forEach((levelI) => {
          all[`${root}-${levelI}`] = true
          ;(levelIGroup as any)[levelI].forEach((loc: Location) => {
            all[`loc-${loc.id}`] = true
          })
        })
      })
      setExpandedNodes(all)
    }
  }, [search, filteredTree])

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
        {Object.entries(filteredTree).map(([root, levelIGroup]) => {
          const rootId = root
          const isExpanded = expandedNodes[rootId] ?? false

          return (
            <div key={root} className="mb-2">
              <button
                onClick={() => toggleNode(rootId)}
                className="flex items-center w-full text-left font-semibold text-gray-800 hover:bg-gray-50 p-1 rounded"
              >
                <span className="w-4 text-gray-400 text-xs">
                  {isExpanded ? '▼' : '▶'}
                </span>
                {root}
              </button>

              {isExpanded && (
                <div className="ml-4 pl-2 border-l border-gray-100">
                  {Object.entries(levelIGroup as any).map(([levelI, locs]) => {
                    const l1Id = `${root}-${levelI}`
                    const isL1Expanded = expandedNodes[l1Id] ?? false

                    return (
                      <div key={levelI} className="mb-1">
                        <button
                          onClick={() => toggleNode(l1Id)}
                          className="flex items-center w-full text-left font-medium text-gray-700 hover:bg-gray-50 p-1 rounded text-sm"
                        >
                          <span className="w-4 text-gray-300 text-[10px]">
                            {isL1Expanded ? '▼' : '▶'}
                          </span>
                          {levelI}
                        </button>

                        {isL1Expanded && (
                          <div className="ml-4 pl-2 border-l border-gray-50">
                            {(locs as Location[]).map((loc) => {
                              const locId = `loc-${loc.id}`
                              const isLocExpanded = expandedNodes[locId] ?? false
                              const locCollections = collectionsByLocation[loc.id] || []
                              const hasCollections = locCollections.length > 0

                              return (
                                <div key={loc.id} className="mb-1">
                                  <button
                                    onClick={() => toggleNode(locId)}
                                    className={`flex items-center w-full text-left p-1 rounded text-sm ${
                                      hasCollections
                                        ? 'text-gray-600 hover:bg-gray-50'
                                        : 'text-gray-400 cursor-default'
                                    }`}
                                  >
                                    <span className="w-4 text-gray-300 text-[10px]">
                                      {hasCollections ? (isLocExpanded ? '▼' : '▶') : '•'}
                                    </span>
                                    {getLocationLabel(loc)}
                                    {loc.description && (
                                      <span className="ml-2 text-[10px] text-gray-400 italic truncate">
                                        ({loc.description})
                                      </span>
                                    )}
                                  </button>

                                  {isLocExpanded && hasCollections && (
                                    <div className="ml-4 space-y-1 mt-1">
                                      {locCollections.map((col) => {
                                        const isSelected = selectedIds.has(col.id)
                                        return (
                                          <div
                                            key={`${col.type}-${col.id}`}
                                            className={`w-full px-3 py-2 border rounded-lg transition-colors ${
                                              isSelected
                                                ? 'border-blue-500 bg-blue-50'
                                                : 'border-gray-100 hover:border-blue-300 hover:bg-blue-50'
                                            }`}
                                          >
                                            <label className="flex items-start cursor-pointer">
                                              <input
                                                type="checkbox"
                                                checked={isSelected}
                                                onChange={() => onToggle(col.id)}
                                                className="mt-1 mr-3 h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                                              />
                                              <div className="flex-1 min-w-0">
                                                <div className="flex items-center justify-between">
                                                  <span className="font-medium text-xs text-gray-900">
                                                    {col.name}
                                                  </span>
                                                  <span className="text-[10px] uppercase tracking-wider text-gray-400 px-1.5 py-0.5 bg-gray-100 rounded ml-2">
                                                    {getCollectionTypeLabel(col.type)}
                                                  </span>
                                                </div>
                                                <div className="text-[10px] text-gray-500 mt-0.5 space-y-0.5">
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
                                              </div>
                                            </label>
                                          </div>
                                        )
                                      })}
                                    </div>
                                  )}
                                </div>
                              )
                            })}
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          )
        })}
        {Object.keys(filteredTree).length === 0 && !loading && (
          <div className="p-4 text-center text-gray-500 text-sm">
            No matching locations or collections found.
          </div>
        )}
        {loading && (
          <div className="p-4 text-center text-gray-500 text-sm">Loading...</div>
        )}
      </div>
    </div>
  )
}

