import { useEffect, useMemo, useState, useRef } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { locationsApi, searchApi } from '../lib/api'
import { buildLocationTree, getLocationLabel } from '../lib/location-tree'
import SkeletonCard from '../components/SkeletonCard'

interface Location {
  id: number
  locationRoot: string
  storageTypeId: string
  description?: string
  levelI: string
  levelII: string
  levelIII?: string
  created: string
  lastUpdated: string
}

interface LocationContents {
  micronixPlates?: any[]
  cryovialBoxes?: any[]
  boxes?: any[]
  bags?: any[]
}

type TreeNodeType = 'root' | 'levelI' | 'levelII' | 'location'

interface SelectedNode {
  type: TreeNodeType
  root: string
  levelI?: string
  levelII?: string
  locationId?: number
}

interface CollectionSearchResult {
  type: string
  id: number
  title: string
  subtitle: string
  url: string
  data: any
}

export default function Locations() {
  const navigate = useNavigate()
  const searchRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const [locations, setLocations] = useState<Location[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [selectedNode, setSelectedNode] = useState<SelectedNode | null>(null)
  const [expandedRoots, setExpandedRoots] = useState<Record<string, boolean>>({})
  const [expandedLevelI, setExpandedLevelI] = useState<
    Record<string, Record<string, boolean>>
  >({})

  const [locationDetailsCache, setLocationDetailsCache] = useState<
    Record<number, { location: Location; contents: LocationContents }>
  >({})
  const [loadingSelection, setLoadingSelection] = useState(false)
  
  // Collection search state
  const [collectionResults, setCollectionResults] = useState<CollectionSearchResult[]>([])
  const [searchLoading, setSearchLoading] = useState(false)
  const [isSearchOpen, setIsSearchOpen] = useState(false)

  useEffect(() => {
    const loadLocations = async () => {
      try {
        // Fetch all locations in a single request (no pagination params)
        const response = await locationsApi.list()
        const allLocations = response.data.locations as Location[]

        setLocations(allLocations)

        // Default selection: first location if any
        if (allLocations.length > 0) {
          const first = allLocations[0]
          setSelectedNode({
            type: 'location',
            root: first.locationRoot,
            levelI: first.levelI,
            levelII: first.levelII,
            locationId: first.id,
          })
        }
      } catch (error) {
        console.error('Failed to load locations:', error)
      } finally {
        setLoading(false)
      }
    }

    loadLocations()
  }, [])

  const tree = useMemo(() => buildLocationTree(locations), [locations])
  
  // Collection search effect
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (searchRef.current && !searchRef.current.contains(event.target as Node)) {
        setIsSearchOpen(false)
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  useEffect(() => {
    if (search.length >= 1) {
      const timeoutId = setTimeout(() => {
        performCollectionSearch(search)
      }, 300) // Debounce 300ms

      return () => clearTimeout(timeoutId)
    } else {
      setCollectionResults([])
      setIsSearchOpen(false)
    }
  }, [search])

  const performCollectionSearch = async (searchQuery: string) => {
    try {
      setSearchLoading(true)
      const response = await searchApi.search(searchQuery, 'collection')
      setCollectionResults(response.data.results || [])
      setIsSearchOpen(true)
    } catch (error) {
      console.error('Collection search failed:', error)
      setCollectionResults([])
    } finally {
      setSearchLoading(false)
    }
  }

  const handleSelectCollection = (result: CollectionSearchResult) => {
    navigate(result.url)
    setSearch('')
    setIsSearchOpen(false)
    inputRef.current?.blur()
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && collectionResults.length > 0) {
      handleSelectCollection(collectionResults[0])
    } else if (e.key === 'Escape') {
      setIsSearchOpen(false)
      inputRef.current?.blur()
    }
  }

  const globalStats = useMemo(() => {
    const totalLocations = locations.length
    const distinctRoots = new Set(locations.map((l) => l.locationRoot)).size
    return {
      totalLocations,
      distinctRoots,
    }
  }, [locations])

  const selectedDetails = useMemo(() => {
    if (!selectedNode) return null

    if (selectedNode.type === 'location' && selectedNode.locationId) {
      const cached = locationDetailsCache[selectedNode.locationId]
      if (cached) return { mode: 'location' as const, ...cached }
      const fallbackLocation = locations.find((l) => l.id === selectedNode.locationId) || null
      return { mode: 'location' as const, location: fallbackLocation, contents: null }
    }

    // Aggregate selection: compute subtree locations
    const matches: Location[] = []
    locations.forEach((loc) => {
      if (loc.locationRoot !== selectedNode.root) return
      if (
        selectedNode.type === 'levelI' &&
        loc.levelI === selectedNode.levelI
      ) {
        matches.push(loc)
      } else if (
        selectedNode.type === 'levelII' &&
        loc.levelI === selectedNode.levelI &&
        loc.levelII === selectedNode.levelII
      ) {
        matches.push(loc)
      } else if (selectedNode.type === 'root') {
        matches.push(loc)
      }
    })

    return { mode: 'aggregate' as const, locations: matches }
  }, [selectedNode, locationDetailsCache, locations])

  const ensureLocationLoaded = async (locationId: number) => {
    if (locationDetailsCache[locationId]) return
    setLoadingSelection(true)
    try {
      const response = await locationsApi.get(locationId)
      setLocationDetailsCache((prev) => ({
        ...prev,
        [locationId]: {
          location: response.data.location as Location,
          contents: (response.data.contents || {}) as LocationContents,
        },
      }))
    } catch (error) {
      console.error('Failed to load location details:', error)
    } finally {
      setLoadingSelection(false)
    }
  }

  const handleSelectNode = async (node: SelectedNode) => {
    setSelectedNode(node)
    if (node.type === 'location' && node.locationId) {
      await ensureLocationLoaded(node.locationId)
    }
  }

  const toggleRoot = (root: string) => {
    setExpandedRoots((prev) => ({ ...prev, [root]: !prev[root] }))
  }

  const toggleLevelI = (root: string, levelI: string) => {
    setExpandedLevelI((prev) => ({
      ...prev,
      [root]: {
        ...(prev[root] || {}),
        [levelI]: !(prev[root]?.[levelI]),
      },
    }))
  }


  const renderTree = () => {
    if (Object.keys(tree).length === 0) {
      return <p className="text-xs text-gray-500">No locations available.</p>
    }

    return (
      <div className="text-sm">
        {Object.entries(tree).map(([root, levelIGroup]) => {
          const rootExpanded = expandedRoots[root] ?? false
          return (
            <div key={root} className="mb-2">
              <button
                type="button"
                onClick={() => toggleRoot(root)}
                className="flex items-center justify-between w-full px-2 py-1 rounded hover:bg-gray-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
              >
                <div className="flex items-center">
                  <span className="w-3 h-3 mr-2 text-gray-500">
                    {rootExpanded ? '▾' : '▸'}
                  </span>
                  <span className="font-semibold text-gray-800">{root}</span>
                </div>
                <span className="text-[11px] text-gray-500">
                  {Object.values(levelIGroup).reduce(
                    (sum, locs) => sum + locs.length,
                    0
                  )}{' '}
                  locations
                </span>
              </button>

              {rootExpanded && (
                <div className="ml-4 border-l border-gray-100 pl-3 mt-1">
                  {Object.entries(levelIGroup).map(([levelI, locs]) => {
                    const l1Expanded =
                      expandedLevelI[root]?.[levelI] ??
                      false
                    return (
                      <div key={levelI} className="mb-1">
                        <button
                          type="button"
                          onClick={() => toggleLevelI(root, levelI)}
                          className="flex items-center justify-between w-full px-1 py-1 rounded hover:bg-gray-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
                        >
                          <div className="flex items-center">
                            <span className="w-3 h-3 mr-2 text-gray-400">
                              {l1Expanded ? '▾' : '▸'}
                            </span>
                            <span className="text-gray-800">{levelI}</span>
                          </div>
                        </button>

                        {l1Expanded && (
                          <div className="ml-4 border-l border-gray-100 pl-3 mt-1 space-y-1">
                            {locs.map((loc) => {
                              const isSelected =
                                selectedNode?.type ===
                                  'location' &&
                                selectedNode.locationId ===
                                  loc.id
                              return (
                                <button
                                  key={loc.id}
                                  type="button"
                                  onClick={() =>
                                    handleSelectNode({
                                      type: 'location',
                                      root,
                                      levelI,
                                      levelII: loc.levelII,
                                      locationId: loc.id,
                                    })
                                  }
                                  className={`flex items-center justify-between w-full px-2 py-1 rounded text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${
                                    isSelected
                                      ? 'bg-blue-50 border border-blue-200'
                                      : 'hover:bg-gray-50 border border-transparent'
                                  }`}
                                >
                                  <div className="text-left">
                                    <p className="text-gray-900">
                                      {getLocationLabel(loc)}
                                    </p>
                                    {loc.description && (
                                      <p className="text-[11px] text-gray-500 truncate">
                                        {loc.description}
                                      </p>
                                    )}
                                  </div>
                                  {isSelected && (
                                    <span className="text-[10px] font-mono text-blue-700">
                                      selected
                                    </span>
                                  )}
                                </button>
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
    )
  }

  const renderSummaryAndPreview = () => {
    if (!selectedNode) {
      return (
        <div className="text-gray-500 text-center py-16">
          Select a location or node in the tree to see details.
        </div>
      )
    }

    if (!selectedDetails) {
      return (
        <div className="text-gray-500 text-center py-16">No details available.</div>
      )
    }

    if (selectedDetails.mode === 'aggregate') {
      const count = selectedDetails.locations.length
      return (
        <div className="space-y-4">
          <div className="bg-white rounded-lg shadow p-6">
            <h2 className="text-xl font-semibold text-gray-900 mb-2">
              Selection Summary
            </h2>
            <p className="text-sm text-gray-600 mb-2">
              {selectedNode.type === 'root' && (
                <>
                  Storage root{' '}
                  <span className="font-mono text-gray-800">
                    {selectedNode.root}
                  </span>
                </>
              )}
              {selectedNode.type === 'levelI' && (
                <>
                  Level I{' '}
                  <span className="font-mono text-gray-800">
                    {selectedNode.levelI}
                  </span>{' '}
                  in root{' '}
                  <span className="font-mono text-gray-800">
                    {selectedNode.root}
                  </span>
                </>
              )}
              {selectedNode.type === 'levelII' && (
                <>
                  Level II{' '}
                  <span className="font-mono text-gray-800">
                    {selectedNode.levelII}
                  </span>{' '}
                  under{' '}
                  <span className="font-mono text-gray-800">
                    {selectedNode.levelI}
                  </span>{' '}
                  in root{' '}
                  <span className="font-mono text-gray-800">
                    {selectedNode.root}
                  </span>
                </>
              )}
            </p>
            <p className="text-3xl font-bold text-blue-600 mb-1">
              {count.toLocaleString()}
            </p>
            <p className="text-sm text-gray-600">locations in this subtree</p>
          </div>

          <div className="bg-white rounded-lg shadow p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-3">
              Locations
            </h3>
            <div className="max-h-64 overflow-y-auto divide-y divide-gray-100">
              {selectedDetails.locations.map((loc) => (
                <button
                  key={loc.id}
                  type="button"
                  onClick={() =>
                    handleSelectNode({
                      type: 'location',
                      root: loc.locationRoot,
                      levelI: loc.levelI,
                      levelII: loc.levelII,
                      locationId: loc.id,
                    })
                  }
                  className="w-full text-left px-2 py-2 hover:bg-gray-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 rounded"
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-gray-900">
                        {loc.levelIII || `Location #${loc.id}`}
                      </p>
                      <p className="text-xs text-gray-500 font-mono">
                        {loc.locationRoot} → {loc.levelI} → {loc.levelII}
                        {loc.levelIII && ` → ${loc.levelIII}`}
                      </p>
                      {loc.description && (
                        <p className="text-xs text-gray-500 truncate">
                          {loc.description}
                        </p>
                      )}
                    </div>
                    <span className="text-[11px] text-blue-600">
                      View preview
                    </span>
                  </div>
                </button>
              ))}
            </div>
          </div>
        </div>
      )
    }

    const { location, contents } = selectedDetails
    if (!location) {
      return (
        <div className="text-gray-500 text-center py-16">
          Location not found for this selection.
        </div>
      )
    }

    const c = contents || {}
    const stats = {
      micronix: c.micronixPlates?.length || 0,
      cryovial: c.cryovialBoxes?.length || 0,
      boxes: c.boxes?.length || 0,
      bags: c.bags?.length || 0,
    }

    const pathParts = [
      location.locationRoot,
      location.levelI,
      location.levelII,
      location.levelIII,
    ].filter(Boolean)

    return (
      <div className="space-y-4">
        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 className="text-xl font-semibold text-gray-900 mb-1">
                Location preview
              </h2>
              <p className="text-sm text-gray-600 font-mono">
                {pathParts.join(' → ')}
              </p>
              <p className="mt-2 text-sm text-gray-700">
                Type:{' '}
                <span className="font-medium">{location.storageTypeId}</span>
              </p>
              {location.description && (
                <p className="mt-1 text-xs text-gray-500">
                  {location.description}
                </p>
              )}
              <p className="mt-2 text-xs text-gray-500">
                Created{' '}
                {new Date(location.created).toLocaleDateString()} • Last
                updated{' '}
                {new Date(location.lastUpdated).toLocaleDateString()}
              </p>
            </div>
            <div className="flex flex-col items-end gap-2">
              <button
                type="button"
                onClick={() => navigate(`/locations/${location.id}`)}
                className="inline-flex items-center px-3 py-2 rounded-md bg-blue-600 text-white text-sm font-medium hover:bg-blue-700"
              >
                Open full details
              </button>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="bg-white rounded-lg shadow p-4">
            <h3 className="text-sm font-medium text-gray-500 mb-1">
              Storage units
            </h3>
            <p className="text-2xl font-bold text-blue-600">
              {(
                stats.micronix +
                stats.cryovial +
                stats.boxes +
                stats.bags
              ).toLocaleString()}
            </p>
            <p className="text-xs text-gray-500 mt-1">
              Plates, boxes and bags
            </p>
          </div>

          <div className="bg-white rounded-lg shadow p-4">
            <h3 className="text-sm font-medium text-gray-500 mb-1">
              Container types
            </h3>
            <ul className="text-xs text-gray-700 space-y-1">
              <li>Micronix plates: {stats.micronix}</li>
              <li>Cryovial boxes: {stats.cryovial}</li>
              <li>Boxes: {stats.boxes}</li>
              <li>Bags: {stats.bags}</li>
            </ul>
          </div>

          <div className="bg-white rounded-lg shadow p-4">
            <h3 className="text-sm font-medium text-gray-500 mb-1">
              Status
            </h3>
            <p className="text-sm text-gray-700">
              {stats.micronix +
                stats.cryovial +
                stats.boxes +
                stats.bags >
              0
                ? 'Contains inventory'
                : 'No contents recorded'}
            </p>
          </div>
        </div>

        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-gray-900">
              Contents preview
            </h3>
            {loadingSelection && (
              <span className="text-xs text-gray-500">Refreshing…</span>
            )}
          </div>

          {Object.values(stats).every((v) => v === 0) ? (
            <div className="text-gray-500 text-center py-8">
              No contents found for this location.
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
              {stats.micronix > 0 && (
                <div>
                  <h4 className="font-semibold text-gray-900 mb-1">
                    Micronix plates ({stats.micronix})
                  </h4>
                  <ul className="space-y-1 text-gray-700">
                    {c.micronixPlates?.slice(0, 5).map((plate: any) => (
                      <li key={plate.id}>
                        {plate.name}{' '}
                        {plate.barcode && (
                          <span className="text-xs text-gray-500">
                            ({plate.barcode})
                          </span>
                        )}
                      </li>
                    ))}
                    {stats.micronix > 5 && (
                      <li className="text-xs text-gray-500">
                        +{stats.micronix - 5} more
                      </li>
                    )}
                  </ul>
                </div>
              )}

              {stats.cryovial > 0 && (
                <div>
                  <h4 className="font-semibold text-gray-900 mb-1">
                    Cryovial boxes ({stats.cryovial})
                  </h4>
                  <ul className="space-y-1 text-gray-700">
                    {c.cryovialBoxes?.slice(0, 5).map((box: any) => (
                      <li key={box.id}>
                        {box.name}{' '}
                        {box.barcode && (
                          <span className="text-xs text-gray-500">
                            ({box.barcode})
                          </span>
                        )}
                      </li>
                    ))}
                    {stats.cryovial > 5 && (
                      <li className="text-xs text-gray-500">
                        +{stats.cryovial - 5} more
                      </li>
                    )}
                  </ul>
                </div>
              )}

              {stats.boxes > 0 && (
                <div>
                  <h4 className="font-semibold text-gray-900 mb-1">
                    Boxes ({stats.boxes})
                  </h4>
                  <ul className="space-y-1 text-gray-700">
                    {c.boxes?.slice(0, 5).map((box: any) => (
                      <li key={box.id}>{box.name}</li>
                    ))}
                    {stats.boxes > 5 && (
                      <li className="text-xs text-gray-500">
                        +{stats.boxes - 5} more
                      </li>
                    )}
                  </ul>
                </div>
              )}

              {stats.bags > 0 && (
                <div>
                  <h4 className="font-semibold text-gray-900 mb-1">
                    Bags ({stats.bags})
                  </h4>
                  <ul className="space-y-1 text-gray-700">
                    {c.bags?.slice(0, 5).map((bag: any) => (
                      <li key={bag.id}>{bag.name}</li>
                    ))}
                    {stats.bags > 5 && (
                      <li className="text-xs text-gray-500">
                        +{stats.bags - 5} more
                      </li>
                    )}
                  </ul>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    )
  }

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="mb-6 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Storage Locations</h1>
          <p className="text-sm text-gray-600 mt-1">
            Browse all storage roots, levels, and locations. Select a node to see an
            information-dense preview of its contents.
          </p>
        </div>
        <div className="flex gap-3">
          <div className="bg-white rounded-lg shadow px-3 py-2 text-right">
            <div className="text-[11px] text-gray-500">Locations</div>
            <div className="text-lg font-semibold text-blue-600">
              {globalStats.totalLocations.toLocaleString()}
            </div>
          </div>
          <div className="bg-white rounded-lg shadow px-3 py-2 text-right">
            <div className="text-[11px] text-gray-500">Storage roots</div>
            <div className="text-lg font-semibold text-green-600">
              {globalStats.distinctRoots.toLocaleString()}
            </div>
          </div>
        </div>
      </div>

      {/* Collection Search Bar */}
      <div className="mb-6">
        <div className="bg-white rounded-lg shadow p-4">
          <label htmlFor="locations-search" className="block text-sm font-medium text-gray-700 mb-2">
            Search Collections
          </label>
          <div ref={searchRef} className="relative w-full">
            <div className="relative">
              <input
                ref={inputRef}
                id="locations-search"
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                onFocus={() => search.length >= 1 && setIsSearchOpen(true)}
                onKeyDown={handleKeyDown}
                placeholder="Search collections by name or barcode..."
                className="form-input w-full pl-12 pr-10 py-3 text-base"
                role="combobox"
                aria-autocomplete="list"
                aria-expanded={isSearchOpen}
                aria-controls="collection-search-results"
              />
              <svg
                className="absolute left-4 top-4 h-5 w-5 text-gray-400"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
                />
              </svg>
              {searchLoading && (
                <div className="absolute right-4 top-4">
                  <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-blue-600"></div>
                </div>
              )}
              {isSearchOpen && collectionResults.length > 0 && (
                <div
                  id="collection-search-results"
                  role="listbox"
                  aria-label="Collection search results"
                  className="absolute z-[9999] w-full top-full mt-1 bg-white border border-gray-100 rounded-lg shadow-lg max-h-96 overflow-y-auto"
                >
                  {collectionResults.map((result, index) => (
                    <button
                      key={`${result.type}-${result.id}-${index}`}
                      onClick={() => handleSelectCollection(result)}
                      className="w-full px-4 py-3 text-left hover:bg-gray-50 focus:bg-gray-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 border-b border-gray-100 last:border-b-0"
                      role="option"
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex-1">
                          <div className="flex items-center space-x-2">
                            <span className={`px-2 py-0.5 text-xs font-medium rounded ${
                              result.type === 'micronix_plate' ? 'bg-blue-100 text-blue-800' :
                              result.type === 'cryovial_box' ? 'bg-purple-100 text-purple-800' :
                              result.type === 'box' ? 'bg-green-100 text-green-800' :
                              result.type === 'bag' ? 'bg-yellow-100 text-yellow-800' :
                              'bg-gray-100 text-gray-800'
                            }`}>
                              {result.type.replace('_', ' ')}
                            </span>
                            <p className="font-medium text-gray-900">{result.title}</p>
                          </div>
                          <p className="text-sm text-gray-500 mt-1">{result.subtitle}</p>
                        </div>
                        <svg
                          className="h-5 w-5 text-gray-400"
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M9 5l7 7-7 7"
                          />
                        </svg>
                      </div>
                    </button>
                  ))}
                </div>
              )}

              {isSearchOpen && search.length >= 1 && !searchLoading && collectionResults.length === 0 && (
                <div className="absolute z-[9999] w-full top-full mt-1 bg-white border border-gray-100 rounded-lg shadow-lg p-4 text-center text-gray-500">
                  No collections found
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {loading ? (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="bg-white rounded-lg shadow p-4">
            <div className="h-6 bg-gray-200 rounded w-32 mb-4 animate-pulse"></div>
            <div className="space-y-2">
              {Array.from({ length: 8 }).map((_, i) => (
                <div key={i} className="h-8 bg-gray-200 rounded animate-pulse"></div>
              ))}
            </div>
          </div>
          <div className="lg:col-span-2 space-y-4">
            <SkeletonCard height="h-48" />
            <SkeletonCard height="h-24" />
          </div>
        </div>
      ) : locations.length === 0 ? (
        <div className="bg-white rounded-lg shadow p-8 text-center text-gray-500">
          No locations have been configured yet.
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="bg-white rounded-lg shadow p-4 max-h-[640px] overflow-y-auto">
            <div className="flex items-center justify-between mb  -2">
              <h2 className="text-sm font-semibold text-gray-900">
                Storage tree
              </h2>
            </div>
            {renderTree()}
          </div>

          <div className="lg:col-span-2 space-y-4">
            {renderSummaryAndPreview()}

            <div className="bg-white rounded-lg shadow p-4 flex flex-wrap items-center justify-between gap-3 text-xs text-gray-600">
              <span>
                For a full breakdown of a single location, open details and use the
                dedicated Location page.
              </span>
              <Link
                to="/locations"
                className="inline-flex items-center text-blue-600 hover:underline"
              >
                Refresh locations
              </Link>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
