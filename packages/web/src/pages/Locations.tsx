import { useEffect, useMemo, useState, useRef, useCallback } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { locationsApi, searchApi } from '../lib/api'
import { getRootLocations, getLocationChildren, getLocationDescendants, getLocationAncestors, getLocationLabel } from '../lib/location-tree'
import SkeletonCard from '../components/SkeletonCard'
import LocationForm from '../components/LocationForm'

interface Location {
  id: number
  parentId: number | null
  name: string
  storageTypeId: string | null
  storageTypeName?: string | null
  effectiveStorageTypeId?: string | null
  effectiveStorageTypeName?: string | null
  description?: string
  canContainCollections: boolean
  path?: string
  created: string
  lastUpdated: string
}

interface LocationContents {
  micronixPlates?: any[]
  cryovialBoxes?: any[]
  boxes?: any[]
  bags?: any[]
}

interface SelectedNode {
  locationId: number
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
  const treeRef = useRef<HTMLDivElement>(null)
  const selectedNodeRef = useRef<HTMLButtonElement>(null)

  const [locations, setLocations] = useState<Location[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [selectedNode, setSelectedNode] = useState<SelectedNode | null>(null)
  const [expandedIds, setExpandedIds] = useState<Set<number>>(new Set())

  const [locationDetailsCache, setLocationDetailsCache] = useState<
    Record<number, { location: Location; contents: LocationContents }>
  >({})
  const [loadingSelection, setLoadingSelection] = useState(false)
  
  // Collection search state
  const [collectionResults, setCollectionResults] = useState<CollectionSearchResult[]>([])
  const [searchLoading, setSearchLoading] = useState(false)
  const [isSearchOpen, setIsSearchOpen] = useState(false)

  // Location management state
  const [editingLocation, setEditingLocation] = useState<Location | null>(null)
  const [formParentId, setFormParentId] = useState<number | null>(null)
  const [formParentLocation, setFormParentLocation] = useState<Location | null>(null)
  const [showFormModal, setShowFormModal] = useState(false)
  const [deletingLocationId, setDeletingLocationId] = useState<number | null>(null)
  const [mutationLoading, setMutationLoading] = useState(false)
  const [successMessage, setSuccessMessage] = useState<string | null>(null)

  const loadLocations = useCallback(async (preserveState = true) => {
    try {
      setLoading(true)
      // Fetch all locations in a single request (no pagination params)
      const response = await locationsApi.list()
      const allLocations = response.data.locations as Location[]

      setLocations(allLocations)

      if (preserveState) {
        // Preserve expanded state
        setExpandedIds((prevExpandedIds) => {
          const preservedExpandedIds = new Set<number>()
          prevExpandedIds.forEach((id) => {
            if (allLocations.find((l) => l.id === id)) {
              preservedExpandedIds.add(id)
            }
          })
          return preservedExpandedIds
        })

        // Preserve selection if location still exists
        setSelectedNode((prevSelectedNode) => {
          if (prevSelectedNode) {
            const selectedLocation = allLocations.find((l) => l.id === prevSelectedNode.locationId)
            if (selectedLocation) {
              // Expand ancestors of the selected location
              const ancestors = getLocationAncestors(allLocations, prevSelectedNode.locationId)
              setExpandedIds((prev) => {
                const next = new Set(prev)
                ancestors.forEach((a) => next.add(a.id))
                return next
              })
              return prevSelectedNode
            } else {
              // Selected location was deleted, select first if available
              if (allLocations.length > 0) {
                const first = allLocations[0]
                const ancestors = getLocationAncestors(allLocations, first.id)
                setExpandedIds(new Set(ancestors.map((a) => a.id)))
                return { locationId: first.id }
              } else {
                return null
              }
            }
          }
          return prevSelectedNode
        })
      } else {
        // Initial load - select first location
        if (allLocations.length > 0) {
          const first = allLocations[0]
          const ancestors = getLocationAncestors(allLocations, first.id)
          setExpandedIds(new Set(ancestors.map((a) => a.id)))
          setSelectedNode({ locationId: first.id })
        }
      }
    } catch (error) {
      console.error('Failed to load locations:', error)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadLocations(false) // Initial load, don't preserve state
  }, [loadLocations])

  // Define ensureLocationLoaded before useEffects that use it
  const ensureLocationLoaded = useCallback(async (locationId: number) => {
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
  }, [locationDetailsCache])

  // Load details when a location is selected
  useEffect(() => {
    if (selectedNode) {
      ensureLocationLoaded(selectedNode.locationId)
    }
  }, [selectedNode, ensureLocationLoaded])

  // Scroll selected node into view when it changes
  useEffect(() => {
    if (selectedNodeRef.current && treeRef.current) {
      // Small delay to ensure DOM is updated
      setTimeout(() => {
        selectedNodeRef.current?.scrollIntoView({
          behavior: 'smooth',
          block: 'center',
          inline: 'nearest',
        })
      }, 100)
    }
  }, [selectedNode])

  
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
    const rootLocations = getRootLocations(locations)
    return {
      totalLocations,
      distinctRoots: rootLocations.length,
    }
  }, [locations])

  const selectedDetails = useMemo(() => {
    if (!selectedNode) return null

    const cached = locationDetailsCache[selectedNode.locationId]
    if (cached) return { mode: 'location' as const, ...cached }
    const fallbackLocation = locations.find((l) => l.id === selectedNode.locationId) || null
    return { mode: 'location' as const, location: fallbackLocation, contents: null }
  }, [selectedNode, locationDetailsCache, locations])

  const handleSelectNode = async (node: SelectedNode) => {
    setSelectedNode(node)
    
    // Expand all ancestors of the selected location so it's visible
    const ancestors = getLocationAncestors(locations, node.locationId)
    setExpandedIds((prev) => {
      const next = new Set(prev)
      ancestors.forEach(a => next.add(a.id))
      // Also expand the selected location itself if it has children
      const selectedLocation = locations.find(l => l.id === node.locationId)
      if (selectedLocation) {
        const children = getLocationChildren(locations, selectedLocation.id)
        if (children.length > 0) {
          next.add(node.locationId)
        }
      }
      return next
    })
    
    await ensureLocationLoaded(node.locationId)
  }

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

  // Handle opening form for adding root location
  const handleAddRoot = () => {
    setEditingLocation(null)
    setFormParentId(null)
    setFormParentLocation(null)
    setShowFormModal(true)
  }

  // Handle opening form for adding child location
  const handleAddChild = (parentId: number, e: React.MouseEvent) => {
    e.stopPropagation()
    const parentLocation = locations.find(l => l.id === parentId) || null
    setEditingLocation(null)
    setFormParentId(parentId)
    setFormParentLocation(parentLocation)
    setShowFormModal(true)
  }

  // Handle opening form for editing location
  const handleEdit = (location: Location, e: React.MouseEvent) => {
    e.stopPropagation()
    const parentLocation = location.parentId ? locations.find(l => l.id === location.parentId) || null : null
    setEditingLocation(location)
    setFormParentId(location.parentId ?? null)
    setFormParentLocation(parentLocation)
    setShowFormModal(true)
  }

  // Handle delete confirmation
  const handleDeleteClick = async (location: Location, e: React.MouseEvent) => {
    e.stopPropagation()
    // Ensure location details are loaded for delete confirmation
    if (!locationDetailsCache[location.id]) {
      await ensureLocationLoaded(location.id)
    }
    setDeletingLocationId(location.id)
  }

  // Handle form save
  const handleFormSave = async (data: any) => {
    setMutationLoading(true)
    setSuccessMessage(null)
    try {
      if (editingLocation) {
        await locationsApi.update(editingLocation.id, data)
        setSuccessMessage('Location updated successfully')
      } else {
        await locationsApi.create(data)
        setSuccessMessage('Location created successfully')
      }
      setShowFormModal(false)
      setEditingLocation(null)
      setFormParentId(null)
      setFormParentLocation(null)
      // Clear location details cache to force refresh
      setLocationDetailsCache({})
      await loadLocations(true) // Preserve state after mutation
      // Clear success message after 3 seconds
      setTimeout(() => setSuccessMessage(null), 3000)
    } catch (error) {
      throw error // Re-throw to let form handle error display
    } finally {
      setMutationLoading(false)
    }
  }

  // Handle form cancel
  const handleFormCancel = () => {
    setShowFormModal(false)
    setEditingLocation(null)
    setFormParentId(null)
    setFormParentLocation(null)
  }

  // Handle delete confirmation
  const handleDeleteConfirm = async () => {
    if (!deletingLocationId) return

    setMutationLoading(true)
    setSuccessMessage(null)
    try {
      await locationsApi.delete(deletingLocationId)
      setSuccessMessage('Location deleted successfully')
      setDeletingLocationId(null)
      // Clear location details cache
      setLocationDetailsCache({})
      // Clear selection if deleted location was selected
      if (selectedNode?.locationId === deletingLocationId) {
        setSelectedNode(null)
      }
      await loadLocations(true) // Preserve state after mutation
      // Clear success message after 3 seconds
      setTimeout(() => setSuccessMessage(null), 3000)
    } catch (error: any) {
      const errorMessage =
        error.response?.data?.error ||
        error.message ||
        'Failed to delete location'
      alert(errorMessage)
    } finally {
      setMutationLoading(false)
    }
  }

  // Handle delete cancel
  const handleDeleteCancel = () => {
    setDeletingLocationId(null)
  }


  const renderLocationNode = (loc: Location, depth: number = 0): React.ReactNode => {
    const children = getLocationChildren(locations, loc.id)
    const isExpanded = expandedIds.has(loc.id)
    const isSelected = selectedNode?.locationId === loc.id

    const handleNodeClick = () => {
      if (isSelected && children.length > 0) {
        // If already selected and has children, toggle expansion
        toggleExpanded(loc.id)
      } else {
        // Otherwise, select the node
        handleSelectNode({ locationId: loc.id })
      }
    }

    return (
      <div key={loc.id} className={depth > 0 ? 'ml-3 border-l border-gray-100 pl-2 mt-1' : 'mb-2'}>
        <div className="group flex items-center gap-0.5">
          <button
            ref={isSelected ? selectedNodeRef : null}
            type="button"
            onClick={handleNodeClick}
            className={`flex items-center flex-1 min-w-0 px-1.5 py-0.5 rounded text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 transition-colors ${
              isSelected
                ? 'bg-blue-50 border border-blue-200 shadow-sm'
                : 'hover:bg-gray-50 border border-transparent'
            }`}
          >
            <div className="flex items-center flex-1">
              {children.length > 0 && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation()
                    toggleExpanded(loc.id)
                  }}
                  className="w-3 h-3 mr-1.5 text-gray-500 flex-shrink-0 hover:text-gray-700"
                >
                  {isExpanded ? '▾' : '▸'}
                </button>
              )}
              {children.length === 0 && <span className="w-3 h-3 mr-1.5"></span>}
              <div className="text-left flex-1 min-w-0">
                <p className="text-gray-900 truncate">
                  {getLocationLabel(loc)}
                </p>
                {loc.description && (
                  <p className="text-[11px] text-gray-500 truncate">
                    {loc.description}
                  </p>
                )}
                {loc.path && (
                  <p className="text-[10px] text-gray-400 font-mono break-words">
                    {loc.path}
                  </p>
                )}
              </div>
            </div>
          </button>
          <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
            <button
              type="button"
              onClick={(e) => handleAddChild(loc.id, e)}
              className="p-0.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded"
              title="Add child location"
              disabled={mutationLoading}
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
            </button>
            <button
              type="button"
              onClick={(e) => handleEdit(loc, e)}
              className="p-0.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded"
              title="Edit location"
              disabled={mutationLoading}
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
              </svg>
            </button>
            <button
              type="button"
              onClick={(e) => handleDeleteClick(loc, e)}
              className="p-0.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded"
              title="Delete location"
              disabled={mutationLoading}
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
              </svg>
            </button>
          </div>
        </div>

        {children.length > 0 && isExpanded && (
          <div className="mt-1">
            {children.map((child) => renderLocationNode(child, depth + 1))}
          </div>
        )}
      </div>
    )
  }

  const renderTree = () => {
    const rootLocations = getRootLocations(locations)
    
    if (rootLocations.length === 0) {
      return <p className="text-xs text-gray-500">No locations available.</p>
    }

    return (
      <div className="text-sm">
        {rootLocations.map((root) => renderLocationNode(root, 0))}
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

    const displayPath = location.path || location.name

    return (
      <div className="space-y-4">
        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 className="text-xl font-semibold text-gray-900 mb-1">
                Location preview
              </h2>
              <p className="text-sm text-gray-600 font-mono">
                {displayPath}
              </p>
              <p className="mt-2 text-sm text-gray-700">
                Type:{' '}
                <span className="font-medium">
                  {location.effectiveStorageTypeName || location.storageTypeName || location.storageTypeId || 'N/A'}
                </span>
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
          <div ref={treeRef} className="bg-white rounded-lg shadow p-3 max-h-[640px] overflow-y-auto overflow-x-hidden">
            <div className="flex items-center justify-between mb-2">
              <h2 className="text-sm font-semibold text-gray-900">
                Storage tree
              </h2>
              <button
                type="button"
                onClick={handleAddRoot}
                disabled={mutationLoading}
                className="inline-flex items-center px-2 py-1 text-xs font-medium text-blue-600 bg-blue-50 rounded hover:bg-blue-100 disabled:opacity-50 disabled:cursor-not-allowed"
                title="Add root location"
              >
                <svg className="w-3 h-3 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
                Add Root
              </button>
            </div>
            {renderTree()}
          </div>

          <div className="lg:col-span-2 space-y-4">
            {renderSummaryAndPreview()}
          </div>
        </div>
      )}

      {/* Success Message */}
      {successMessage && (
        <div className="fixed bottom-4 right-4 bg-green-50 border border-green-200 text-green-800 px-4 py-3 rounded-lg shadow-lg z-50">
          <div className="flex items-center">
            <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
            {successMessage}
          </div>
        </div>
      )}

      {/* Form Modal */}
      {showFormModal && (
        <LocationForm
          location={editingLocation}
          parentId={formParentId}
          parentLocation={formParentLocation}
          onSave={handleFormSave}
          onCancel={handleFormCancel}
        />
      )}

      {/* Delete Confirmation Modal */}
      {deletingLocationId && (() => {
        const locationToDelete = locations.find((l) => l.id === deletingLocationId)
        const children = locationToDelete ? getLocationChildren(locations, locationToDelete.id) : []
        const hasChildren = children.length > 0
        const cachedDetails = locationToDelete ? locationDetailsCache[deletingLocationId] : null
        const hasContents = cachedDetails?.contents
          ? (cachedDetails.contents.micronixPlates?.length || 0) +
            (cachedDetails.contents.cryovialBoxes?.length || 0) +
            (cachedDetails.contents.boxes?.length || 0) +
            (cachedDetails.contents.bags?.length || 0) > 0
          : false

        return (
          <div
            className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50"
            onClick={handleDeleteCancel}
          >
            <div
              className="bg-white rounded-lg shadow-xl max-w-md w-full mx-4"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="p-6">
                <h2 className="text-xl font-semibold text-gray-900 mb-4">Delete Location</h2>
                <p className="text-sm text-gray-700 mb-4">
                  Are you sure you want to delete <strong>{locationToDelete?.name}</strong>?
                </p>
                {hasChildren && (
                  <div className="mb-4 bg-yellow-50 border border-yellow-200 text-yellow-800 px-4 py-3 rounded">
                    <p className="text-sm font-medium">Warning: This location has {children.length} child location(s).</p>
                    <p className="text-xs mt-1">You must delete all child locations first.</p>
                  </div>
                )}
                {hasContents && (
                  <div className="mb-4 bg-yellow-50 border border-yellow-200 text-yellow-800 px-4 py-3 rounded">
                    <p className="text-sm font-medium">Warning: This location contains storage containers.</p>
                    <p className="text-xs mt-1">You must move or remove all containers before deleting this location.</p>
                  </div>
                )}
                {!hasChildren && !hasContents && (
                  <p className="text-sm text-gray-600 mb-4">This action cannot be undone.</p>
                )}
                <div className="flex justify-end space-x-3">
                  <button
                    type="button"
                    onClick={handleDeleteCancel}
                    className="px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                    disabled={mutationLoading}
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={handleDeleteConfirm}
                    disabled={mutationLoading || hasChildren || hasContents}
                    className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {mutationLoading ? 'Deleting...' : 'Delete'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )
      })()}
    </div>
  )
}
