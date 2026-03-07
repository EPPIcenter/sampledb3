import { useEffect, useMemo, useState, useRef, useCallback } from 'react'
import { Link, useNavigate } from 'react-router-dom'

import { locationsApi, searchApi, type LocationHierarchyStats, type CollectionSearchResult } from '../lib/api'
import { getRootLocations, getLocationChildren, getLocationDescendants, getLocationAncestors, getLocationLabel } from '../lib/location-tree'
import SkeletonCard from '../components/SkeletonCard'
import LocationDetailsSkeleton from '../components/LocationDetailsSkeleton'
import LocationForm from '../components/LocationForm'
import LocationHierarchyStatsDisplay from '../components/LocationHierarchyStats'
import ModalPortal from '../components/ModalPortal'
import LocationCapabilityBadge from '../components/LocationCapabilityBadge'
import { useUser } from '../contexts/UserContext'
import { useFocusSearchOnSlash } from '../hooks/useHotkey'
import { useClickOutside } from '../hooks/useClickOutside'
import '../styles/storage.css'

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
  micronixPlates?: Array<{ id: number; name: string; barcode?: string | null; locationId: number; itemCount?: number }>
  cryovialBoxes?: Array<{ id: number; name: string; barcode?: string | null; locationId: number; itemCount?: number }>
  boxes?: Array<{ id: number; name: string; locationId: number; itemCount?: number }>
  bags?: Array<{ id: number; name: string; locationId: number; itemCount?: number }>
}

interface SelectedNode {
  locationId: number
}


export default function Locations() {
  const navigate = useNavigate()
  const { canManageReferenceData } = useUser()
  const canEdit = canManageReferenceData
  const searchRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const treeRef = useRef<HTMLDivElement>(null)
  const selectedNodeRef = useRef<HTMLButtonElement>(null)
  useFocusSearchOnSlash(inputRef)

  const [locations, setLocations] = useState<Location[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [selectedNode, setSelectedNode] = useState<SelectedNode | null>(null)
  const [expandedIds, setExpandedIds] = useState<Set<number>>(new Set())

  const [locationDetailsCache, setLocationDetailsCache] = useState<
    Partial<Record<number, { location: Location; contents: LocationContents; hierarchyStats?: LocationHierarchyStats }>>
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
    // Skip fetch if we already have this location in cache (Record index can be undefined)
    if (locationDetailsCache[locationId]) return
    
    // Set loading state immediately to trigger skeleton
    setLoadingSelection(true)
    try {
      const response = await locationsApi.get(locationId)
      setLocationDetailsCache((prev) => ({
        ...prev,
          [locationId]: {
          location: response.data.location as Location,
          contents: response.data.contents as LocationContents,
          hierarchyStats: response.data.hierarchyStats as LocationHierarchyStats | undefined,
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
      // Set loading state immediately if not cached to show skeleton right away
      if (!locationDetailsCache[selectedNode.locationId]) {
        setLoadingSelection(true)
      }
      ensureLocationLoaded(selectedNode.locationId)
    }
  }, [selectedNode, ensureLocationLoaded, locationDetailsCache])

  // Scroll selected node into view when it changes
  useEffect(() => {
    const nodeRef = selectedNodeRef.current
    const tree = treeRef.current
    if (nodeRef && tree) {
      // Small delay to ensure DOM is updated
      setTimeout(() => {
        nodeRef.scrollIntoView({
          behavior: 'smooth',
          block: 'center',
          inline: 'nearest',
        })
      }, 100)
    }
  }, [selectedNode])

  useClickOutside(searchRef, () => setIsSearchOpen(false), isSearchOpen)

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
      // Filter to only collection types (micronix_plate, cryovial_box, box, bag)
      const collectionResults = response.data.results.filter(
        (r): r is CollectionSearchResult =>
          r.type === 'micronix_plate' || r.type === 'cryovial_box' || r.type === 'box' || r.type === 'bag'
      )
      setCollectionResults(collectionResults)
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
    if (cached) {
      // We have cached data, not loading
      return { mode: 'location' as const, ...cached, isLoading: false }
    }
    
    // No cached data - return null to trigger skeleton immediately
    // This prevents showing the previous location's data when switching
    return null
  }, [selectedNode, locationDetailsCache])

  const handleSelectNode = async (node: SelectedNode) => {
    // If switching to a different location that isn't cached, clear the cache entry
    // to force skeleton to show immediately
    if (selectedNode && selectedNode.locationId !== node.locationId) {
      if (!locationDetailsCache[node.locationId]) {
        // New location not cached - set loading state immediately
        setLoadingSelection(true)
      }
    }
    
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
    await ensureLocationLoaded(location.id)
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
      <div key={loc.id} className={depth > 0 ? 'ml-3 border-l pl-2 mt-1' : 'mb-2'} style={{ borderColor: 'rgb(var(--app-border))' }}>
        <div className="group flex items-center gap-0.5">
          <button
            ref={isSelected ? selectedNodeRef : null}
            type="button"
            onClick={handleNodeClick}
            className={`flex items-center flex-1 min-w-0 px-1.5 py-0.5 rounded text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[rgb(var(--app-accent))] transition-colors ${
              isSelected
                ? 'border shadow-sm'
                : 'border border-transparent hover:bg-[rgb(var(--app-surface))]'
            }`}
            style={isSelected ? { backgroundColor: 'rgb(var(--app-accent-muted))', borderColor: 'rgb(var(--app-accent) / 0.4)' } : undefined}
          >
            <div className="flex items-center flex-1">
              {children.length > 0 && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation()
                    toggleExpanded(loc.id)
                  }}
                  className="w-3 h-3 mr-1.5 flex-shrink-0 rounded hover:bg-[rgb(var(--app-accent)/0.15)]"
                  style={{ color: 'rgb(var(--app-text-muted))' }}
                >
                  {isExpanded ? '▾' : '▸'}
                </button>
              )}
              {children.length === 0 && <span className="w-3 h-3 mr-1.5"></span>}
              <div className="text-left flex-1 min-w-0">
                <div className="flex items-center gap-1.5">
                  <p className="truncate" style={{ color: 'rgb(var(--app-text))' }}>
                    {getLocationLabel(loc)}
                  </p>
                  {loc.canContainCollections && (
                    <LocationCapabilityBadge canContainCollections={true} size="sm" />
                  )}
                  {children.length > 0 && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded" style={{ color: 'rgb(var(--app-text-muted))', backgroundColor: 'rgb(var(--app-surface))' }}>
                      {children.length} child{children.length !== 1 ? 'ren' : ''}
                    </span>
                  )}
                </div>
                {loc.description && (
                  <p className="text-[11px] truncate" style={{ color: 'rgb(var(--app-text-muted))' }}>
                    {loc.description}
                  </p>
                )}
                {loc.path && (
                  <p className="text-[10px] font-mono break-words" style={{ color: 'rgb(var(--app-text-muted))' }}>
                    {loc.path}
                  </p>
                )}
                {/* Show cached container count if available */}
                {(() => {
                  const cached = locationDetailsCache[loc.id]
                  const stats = cached?.hierarchyStats
                  if (!stats) return null
                  const directTotal = stats.directContainers.micronix + stats.directContainers.cryovial + stats.directContainers.boxes + stats.directContainers.bags
                  if (directTotal > 0) {
                    return (
                      <p className="text-[10px] font-medium mt-0.5" style={{ color: 'rgb(var(--app-accent))' }}>
                        {directTotal} container{directTotal !== 1 ? 's' : ''}
                      </p>
                    )
                  }
                  return null
                })()}
              </div>
            </div>
          </button>
          {canEdit && (
            <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
              <button
                type="button"
                onClick={(e) => handleAddChild(loc.id, e)}
                className="p-0.5 rounded hover:bg-[rgb(var(--app-accent-muted))]"
                style={{ color: 'rgb(var(--app-text-muted))' }}
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
                className="p-0.5 rounded hover:bg-[rgb(var(--app-accent-muted))]"
                style={{ color: 'rgb(var(--app-text-muted))' }}
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
                className="p-0.5 text-app-text-muted hover:text-app-trend-down hover:bg-app-trend-down/10 rounded"
                title="Delete location"
                disabled={mutationLoading}
              >
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                </svg>
              </button>
            </div>
          )}
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
      return <p className="text-xs text-app-text-muted">No locations available.</p>
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
        <div className="text-center py-16" style={{ color: 'rgb(var(--app-text-muted))' }}>
          Select a location or node in the tree to see details.
        </div>
      )
    }

    if (!selectedDetails) {
      return <LocationDetailsSkeleton className="storage-skeleton" />
    }

    const { location, contents, hierarchyStats } = selectedDetails

    if (location.id !== selectedNode.locationId) {
      return <LocationDetailsSkeleton />
    }

    const c = contents
    const stats = {
      micronix: c.micronixPlates?.length || 0,
      cryovial: c.cryovialBoxes?.length || 0,
      boxes: c.boxes?.length || 0,
      bags: c.bags?.length || 0,
    }

    const displayPath = location.path || location.name

    const collectionCards: Array<{ type: 'micronix_plate' | 'cryovial_box' | 'box' | 'bag'; id: number; name: string; barcode?: string | null; itemCount?: number }> = []
    c.micronixPlates?.forEach((plate: { id: number; name: string; barcode?: string | null; itemCount?: number }) => {
      collectionCards.push({ type: 'micronix_plate', id: plate.id, name: plate.name, barcode: plate.barcode, itemCount: plate.itemCount })
    })
    c.cryovialBoxes?.forEach((box: { id: number; name: string; barcode?: string | null; itemCount?: number }) => {
      collectionCards.push({ type: 'cryovial_box', id: box.id, name: box.name, barcode: box.barcode, itemCount: box.itemCount })
    })
    c.boxes?.forEach((box: { id: number; name: string; itemCount?: number }) => {
      collectionCards.push({ type: 'box', id: box.id, name: box.name, itemCount: box.itemCount })
    })
    c.bags?.forEach((bag: { id: number; name: string; itemCount?: number }) => {
      collectionCards.push({ type: 'bag', id: bag.id, name: bag.name, itemCount: bag.itemCount })
    })

    const getCollectionUrl = (type: string, id: number) => {
      if (type === 'micronix_plate') return `/collections/micronix-plates/${id}`
      if (type === 'cryovial_box') return `/collections/cryovial-boxes/${id}`
      if (type === 'box') return `/collections/boxes/${id}`
      if (type === 'bag') return `/collections/bags/${id}`
      return '#'
    }

    const getBadgeClass = (type: string) => {
      if (type === 'micronix_plate') return 'storage-badge-plate'
      if (type === 'cryovial_box') return 'storage-badge-cryovial'
      if (type === 'box') return 'storage-badge-box'
      if (type === 'bag') return 'storage-badge-bag'
      return 'storage-badge-plate'
    }

    return (
      <div className="space-y-4">
        <div className="storage-card p-6">
          <div className="flex items-start justify-between gap-4">
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-1">
                <h2 className="text-xl font-semibold storage-section-title">
                  Location preview
                </h2>
                <LocationCapabilityBadge canContainCollections={location.canContainCollections} />
              </div>
              <p className="text-sm font-mono" style={{ color: 'rgb(var(--app-text-muted))' }}>
                {displayPath}
              </p>
              <p className="mt-2 text-sm" style={{ color: 'rgb(var(--app-text))' }}>
                Type:{' '}
                <span className="font-medium">
                  {location.effectiveStorageTypeName || location.storageTypeName || location.storageTypeId || 'N/A'}
                </span>
              </p>
              {location.description && (
                <p className="mt-1 text-xs" style={{ color: 'rgb(var(--app-text-muted))' }}>
                  {location.description}
                </p>
              )}
              <p className="mt-2 text-xs" style={{ color: 'rgb(var(--app-text-muted))' }}>
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
                className="storage-btn-primary inline-flex items-center px-3 py-2 text-sm font-medium"
              >
                Open full details
              </button>
            </div>
          </div>
        </div>

        {/* Hierarchy Statistics (optional from API) */}
        {hierarchyStats && (
          <LocationHierarchyStatsDisplay
            stats={hierarchyStats}
            locationName={location.name}
            canContainCollections={location.canContainCollections}
            className="storage-hierarchy-stats"
          />
        )}

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="storage-card p-4">
            <h3 className="text-sm font-medium mb-1" style={{ color: 'rgb(var(--app-text-muted))' }}>
              Storage units
            </h3>
            <p className="text-2xl font-bold" style={{ color: 'rgb(var(--app-accent))' }}>
              {(
                stats.micronix +
                stats.cryovial +
                stats.boxes +
                stats.bags
              ).toLocaleString()}
            </p>
            <p className="text-xs mt-1" style={{ color: 'rgb(var(--app-text-muted))' }}>
              Plates, boxes and bags
            </p>
          </div>

          <div className="storage-card p-4">
            <h3 className="text-sm font-medium mb-1" style={{ color: 'rgb(var(--app-text-muted))' }}>
              Container types
            </h3>
            <ul className="text-xs space-y-1" style={{ color: 'rgb(var(--app-text))' }}>
              <li>Micronix plates: {stats.micronix}</li>
              <li>Cryovial boxes: {stats.cryovial}</li>
              <li>Boxes: {stats.boxes}</li>
              <li>Bags: {stats.bags}</li>
            </ul>
          </div>

          <div className="storage-card p-4">
            <h3 className="text-sm font-medium mb-1" style={{ color: 'rgb(var(--app-text-muted))' }}>
              Status
            </h3>
            <p className="text-sm" style={{ color: 'rgb(var(--app-text))' }}>
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

        <div className="storage-card p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold storage-section-title">
              Contents preview
            </h3>
          </div>

          {collectionCards.length === 0 ? (
            <div className="text-center py-8" style={{ color: 'rgb(var(--app-text-muted))' }}>
              No contents found for this location.
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {collectionCards.map((item) => (
                <Link
                  key={`${item.type}-${item.id}`}
                  to={getCollectionUrl(item.type, item.id)}
                  className="storage-card block p-4 hover:no-underline transition-colors"
                >
                  <span className={getBadgeClass(item.type)}>
                    {item.type.replace('_', ' ')}
                  </span>
                  <p className="font-medium mt-1.5 truncate" style={{ color: 'rgb(var(--app-text))' }}>
                    {item.name}
                  </p>
                  {item.barcode && (
                    <p className="text-xs font-mono mt-0.5" style={{ color: 'rgb(var(--app-text-muted))' }}>
                      {item.barcode}
                    </p>
                  )}
                  {item.itemCount != null && (
                    <p className="text-xs mt-0.5" style={{ color: 'rgb(var(--app-text-muted))' }}>
                      {item.itemCount} item{item.itemCount !== 1 ? 's' : ''}
                    </p>
                  )}
                </Link>
              ))}
            </div>
          )}
        </div>
      </div>
    )
  }

  return (
    <div className="storage-page">
      <div className="container mx-auto px-4 py-8 relative z-10">
      <div className="mb-6 flex flex-col md:flex-row md:items-center md:justify-between gap-4 storage-reveal storage-reveal-1">
        <div>
          <h1 className="text-3xl font-bold">Storage Locations</h1>
          <p className="text-sm mt-1" style={{ color: 'rgb(var(--app-text-muted))' }}>
            Browse all storage roots, levels, and locations. Select a node to see an information-dense preview of its contents.
          </p>
        </div>
        <div className="flex gap-3">
          <div className="storage-card px-4 py-3 text-right">
            <div className="text-[11px]" style={{ color: 'rgb(var(--app-text-muted))' }}>Locations</div>
            <div className="text-lg font-semibold" style={{ color: 'rgb(var(--app-accent))' }}>
              {globalStats.totalLocations.toLocaleString()}
            </div>
          </div>
          <div className="storage-card px-4 py-3 text-right">
            <div className="text-[11px]" style={{ color: 'rgb(var(--app-text-muted))' }}>Storage roots</div>
            <div className="text-lg font-semibold" style={{ color: 'rgb(var(--app-accent))' }}>
              {globalStats.distinctRoots.toLocaleString()}
            </div>
          </div>
        </div>
      </div>

      {/* Collection Search Bar */}
      <div className="relative z-20">
        <div className="mb-6 storage-reveal storage-reveal-2">
          <div className="storage-card p-4">
          <label htmlFor="locations-search" className="block text-sm font-medium mb-2" style={{ color: 'rgb(var(--app-text))' }}>
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
                className="absolute left-4 top-4 h-5 w-5"
                style={{ color: 'rgb(var(--app-text-muted))' }}
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
                  <div className="animate-spin rounded-full h-5 w-5 border-2 border-transparent border-t-current" style={{ borderTopColor: 'rgb(var(--app-accent))' }}></div>
                </div>
              )}
              {isSearchOpen && collectionResults.length > 0 && (
                <div
                  id="collection-search-results"
                  role="listbox"
                  aria-label="Collection search results"
                  className="absolute z-[9999] w-full top-full mt-1 storage-card max-h-96 overflow-y-auto"
                >
                  {collectionResults.map((result, index) => (
                    <button
                      key={`${result.type}-${result.id}-${index}`}
                      onClick={() => handleSelectCollection(result)}
                      className="w-full px-4 py-3 text-left hover:bg-[rgb(var(--app-surface))] focus:outline-none focus-visible:ring-2 focus-visible:ring-[rgb(var(--app-accent))] border-b last:border-b-0"
                      style={{ borderColor: 'rgb(var(--app-border))' }}
                      role="option"
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex-1">
                          <div className="flex items-center space-x-2">
                            <span className={
                              result.type === 'micronix_plate' ? 'storage-badge-plate' :
                              result.type === 'cryovial_box' ? 'storage-badge-cryovial' :
                              result.type === 'box' ? 'storage-badge-box' :
                              'storage-badge-bag'
                            }>
                              {result.type.replace('_', ' ')}
                            </span>
                            <p className="font-medium" style={{ color: 'rgb(var(--app-text))' }}>{result.title}</p>
                          </div>
                          <p className="text-sm mt-1" style={{ color: 'rgb(var(--app-text-muted))' }}>{result.subtitle}</p>
                        </div>
                        <svg
                          className="h-5 w-5"
                          style={{ color: 'rgb(var(--app-text-muted))' }}
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
                <div className="absolute z-[9999] w-full top-full mt-1 storage-card p-4 text-center" style={{ color: 'rgb(var(--app-text-muted))' }}>
                  No collections found
                </div>
              )}
            </div>
          </div>
        </div>
        </div>
      </div>

      {loading ? (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 storage-reveal storage-reveal-3">
          <div className="storage-card p-4">
            <div className="h-6 rounded w-32 mb-4 animate-pulse" style={{ backgroundColor: 'rgb(var(--app-border))' }}></div>
            <div className="space-y-2">
              {Array.from({ length: 8 }).map((_, i) => (
                <div key={i} className="h-8 rounded animate-pulse" style={{ backgroundColor: 'rgb(var(--app-border))' }}></div>
              ))}
            </div>
          </div>
          <div className="lg:col-span-2 space-y-4">
            <SkeletonCard height="h-48" className="storage-card" />
            <SkeletonCard height="h-24" className="storage-card" />
          </div>
        </div>
      ) : locations.length === 0 ? (
        <div className="storage-card p-8 text-center">
          <p className="mb-6" style={{ color: 'rgb(var(--app-text-muted))' }}>
            No locations have been configured yet.
          </p>
          {canEdit && (
            <button
              type="button"
              onClick={handleAddRoot}
              disabled={mutationLoading}
              className="storage-btn-primary inline-flex items-center px-6 py-3 text-base font-medium disabled:opacity-50 disabled:cursor-not-allowed"
              title="Create first location"
            >
              <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              Create first location
            </button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 storage-reveal storage-reveal-3">
          <div ref={treeRef} className="storage-card p-3 max-h-[640px] overflow-y-auto overflow-x-hidden">
            <div className="flex items-center justify-between mb-2">
              <h2 className="text-sm font-semibold storage-section-title">
                Storage tree
              </h2>
              {canEdit && (
                <button
                  type="button"
                  onClick={handleAddRoot}
                  disabled={mutationLoading}
                  className="storage-btn-secondary inline-flex items-center px-2 py-1 text-xs font-medium disabled:opacity-50 disabled:cursor-not-allowed"
                  title="Add root location"
                >
                  <svg className="w-3 h-3 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                  </svg>
                  Add Root
                </button>
              )}
            </div>
            {renderTree()}
          </div>

          <div className="lg:col-span-2 space-y-4" key={selectedNode?.locationId || 'no-selection'}>
            {renderSummaryAndPreview()}
          </div>
        </div>
      )}

      {/* Success Message */}
      {successMessage && (
        <div className="fixed bottom-4 right-4 bg-app-trend-up/10 border border-app-trend-up/30 text-app-trend-up px-4 py-3 rounded-lg shadow-lg z-50">
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
          <ModalPortal>
            <div className="fixed inset-0 z-[100] overflow-y-auto">
              <div className="flex items-center justify-center min-h-screen px-4 pt-4 pb-20 text-center sm:block sm:p-0">
                {/* Background overlay */}
                <div
                  className="fixed inset-0 bg-black/40 backdrop-blur-md"
                  onClick={handleDeleteCancel}
                />
              
              {/* Modal panel */}
              <div className="relative z-10 inline-block align-bottom bg-app-card rounded-lg text-left overflow-hidden shadow-xl transform transition-all sm:my-8 sm:align-middle sm:max-w-md sm:w-full" onClick={(e) => e.stopPropagation()}>
                <div className="bg-app-card px-4 pt-5 pb-4 sm:p-6 sm:pb-4">
                <h2 className="text-xl font-semibold text-app-text mb-4">Delete Location</h2>
                <p className="text-sm text-app-text mb-4">
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
                  <p className="text-sm text-app-text-muted mb-4">This action cannot be undone.</p>
                )}
                <div className="flex justify-end space-x-3">
                  <button
                    type="button"
                    onClick={handleDeleteCancel}
                    className="px-4 py-2 border border-app-border rounded-lg text-app-text hover:bg-app-surface disabled:opacity-50"
                    disabled={mutationLoading}
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={handleDeleteConfirm}
                    disabled={mutationLoading || hasChildren || hasContents}
                    className="px-4 py-2 bg-app-trend-down text-white rounded-lg hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {mutationLoading ? 'Deleting...' : 'Delete'}
                  </button>
                </div>
                </div>
              </div>
            </div>
          </div>
          </ModalPortal>
        )
      })()}
      </div>
    </div>
  )
}
