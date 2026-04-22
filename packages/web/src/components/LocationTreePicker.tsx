import { useState, useEffect, useMemo, useCallback, useRef } from 'react'
import { locationsApi, type Location } from '../lib/api'
import { buildLocationTree, filterLocationTree, getLocationLabel, getRootLocations, getLocationChildren, getLocationAncestors } from '../lib/location-tree'
import ModalPortal from './ModalPortal'

export interface LocationSelection {
  locationId: number
  path: string
  name: string
  effectiveStorageTypeName?: string | null
}

interface LocationTreePickerProps {
  selected: LocationSelection[]
  onChange: (selections: LocationSelection[]) => void
  filterCollectionsOnly?: boolean  // Only show locations that can contain collections
}

export default function LocationTreePicker({ selected, onChange, filterCollectionsOnly = false }: LocationTreePickerProps) {
  const [open, setOpen] = useState(false)
  const [locations, setLocations] = useState<Location[]>([])
  const [loading, setLoading] = useState(false)
  const [search, setSearch] = useState('')
  const [expandedIds, setExpandedIds] = useState<Set<number>>(new Set())

  useEffect(() => {
    if (open) {
      loadLocations()
    }
  }, [open])

  const loadLocations = async () => {
    try {
      setLoading(true)
      // Fetch all locations in a single request (no pagination params)
      const response = await locationsApi.list()
      const allLocations = response.data.locations

      if (filterCollectionsOnly) {
        // Show collection-capable locations plus all their ancestors so the tree has roots
        // and users can navigate to selectable targets (roots may have canContainCollections=false)
        const collectionCapable = allLocations.filter((loc) => loc.canContainCollections)
        const byId = new Map<number, Location>()
        for (const loc of collectionCapable) {
          byId.set(loc.id, loc)
          for (const ancestor of getLocationAncestors(allLocations, loc.id)) {
            byId.set(ancestor.id, ancestor)
          }
        }
        setLocations(Array.from(byId.values()))
      } else {
        setLocations(allLocations)
      }
    } catch (error) {
      console.error('Failed to load locations:', error)
    } finally {
      setLoading(false)
    }
  }

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

  // Pre-compute location map for O(1) lookup
  const locationMap = useMemo(() => {
    const map = new Map<number, Location>()
    locations.forEach((loc) => map.set(loc.id, loc))
    return map
  }, [locations])

  const tree = useMemo(() => buildLocationTree(locations), [locations])
  const filteredTree = useMemo(
    () => (search.trim() ? filterLocationTree(tree, search) : tree),
    [tree, search]
  )

  // Auto-expand when selected, search, or locations change (adjust during render)
  const selectedKey = selected.map((s) => s.locationId).sort().join(',')
  const prevExpandedDepsRef = useRef({ selectedKey, search, locationsLength: locations.length })
  const expandedDeps = { selectedKey, search, locationsLength: locations.length }
  const expandedDepsChanged =
    prevExpandedDepsRef.current.selectedKey !== selectedKey ||
    prevExpandedDepsRef.current.search !== search ||
    prevExpandedDepsRef.current.locationsLength !== locations.length
  if (expandedDepsChanged && locations.length > 0) {
    prevExpandedDepsRef.current = expandedDeps
    setExpandedIds((prev) => {
      const next = new Set(prev)
      if (search.trim()) {
        locations.forEach((loc) => next.add(loc.id))
      }
      if (selected.length > 0) {
        selected.forEach((sel) => {
          const ancestors = getLocationAncestors(locations, sel.locationId)
          ancestors.forEach((a) => next.add(a.id))
          next.add(sel.locationId)
        })
      }
      return next
    })
  }

  const isSelected = useCallback((locationId: number): boolean => {
    return selected.some((s) => s.locationId === locationId)
  }, [selected])

  const toggleSelection = useCallback((loc: Location) => {
    const selection: LocationSelection = {
      locationId: loc.id,
      path: loc.path || loc.name,
      name: loc.name,
      effectiveStorageTypeName: loc.effectiveStorageTypeName ?? null,
    }
    
    if (isSelected(loc.id)) {
      // Remove selection
      onChange(selected.filter((s) => s.locationId !== loc.id))
    } else {
      // Add selection
      onChange([...selected, selection])
    }
  }, [selected, onChange, isSelected])

  const removeSelection = (index: number) => {
    onChange(selected.filter((_, i) => i !== index))
  }

  const clearAll = () => {
    onChange([])
  }

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

  // Highlight search term in text
  const highlightText = useCallback((text: string, searchTerm: string) => {
    if (!searchTerm.trim()) return text
    const parts = text.split(new RegExp(`(${searchTerm})`, 'gi'))
    return parts.map((part, i) =>
      part.toLowerCase() === searchTerm.toLowerCase() ? (
        <mark key={i} className="rounded px-0.5 bg-app-accent-muted text-app-accent-on-tint">
          {part}
        </mark>
      ) : (
        part
      )
    )
  }, [])

  const renderLocationNode = useCallback((loc: Location, depth: number = 0): React.ReactNode => {
    const children = locationChildrenMap.get(loc.id) || []
    const hasChildren = children.length > 0
    const isExpanded = expandedIds.has(loc.id)
    const locSelected = isSelected(loc.id)
    const canContainCollections = loc.canContainCollections
    const locationLabel = getLocationLabel(loc)
    const expandAriaLabel = isExpanded ? `Collapse ${locationLabel}` : `Expand ${locationLabel}`

    return (
      <div key={loc.id} className={depth > 0 ? 'ml-4 border-l-2 border-app-border pl-3' : 'mb-1'}>
        <div
          className={`flex items-center gap-2 w-full rounded-lg transition-colors ${
            locSelected
              ? 'bg-app-accent-muted border-2 border-app-accent shadow-sm'
              : canContainCollections
              ? 'border border-transparent hover:border-app-border'
              : 'bg-app-surface border border-app-border opacity-75'
          }`}
        >
          {hasChildren ? (
            <button
              type="button"
              onClick={() => toggleExpanded(loc.id)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault()
                  toggleExpanded(loc.id)
                }
              }}
              aria-expanded={isExpanded}
              aria-label={expandAriaLabel}
              className="storage-tree-picker-row flex-1 min-w-0 flex items-center gap-3 px-3 py-3 min-h-[44px] rounded-lg border-0 bg-transparent text-left cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-app-accent focus-visible:ring-offset-1 hover:bg-app-surface"
            >
              <span className="flex-shrink-0 w-5 h-5 flex items-center justify-center text-app-text-muted" aria-hidden>
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
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className={`font-medium ${locSelected ? 'text-app-accent-hover' : canContainCollections ? 'text-app-text' : 'text-app-text-muted'}`}>
                    {search.trim() ? highlightText(locationLabel, search) : locationLabel}
                  </span>
                  {loc.path && loc.path !== loc.name && (
                    <span className={`text-xs font-mono truncate ${canContainCollections ? 'text-app-text-muted' : 'text-app-text-muted'}`}>
                      {search.trim() ? highlightText(loc.path, search) : loc.path}
                    </span>
                  )}
                  {(loc.effectiveStorageTypeName || loc.storageTypeName) && (
                    <span className={`text-xs font-normal ${canContainCollections ? 'text-app-text-muted' : 'text-app-text-muted'}`}>
                      ({loc.effectiveStorageTypeName || loc.storageTypeName})
                    </span>
                  )}
                  {!canContainCollections && (
                    <span className="text-xs text-app-text-muted italic">(cannot contain collections)</span>
                  )}
                  {locSelected && (
                    <span className="inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium bg-app-accent text-white">
                      Selected
                    </span>
                  )}
                </div>
                {loc.description && (
                  <div className={`text-xs mt-0.5 truncate ${canContainCollections ? 'text-app-text-muted' : 'text-app-text-muted'}`}>
                    {search.trim() ? highlightText(loc.description, search) : loc.description}
                  </div>
                )}
              </div>
            </button>
          ) : (
            <div className="storage-tree-picker-row flex-1 min-w-0 flex items-center gap-3 px-3 py-3 min-h-[44px] rounded-lg">
              <span className="w-5 flex-shrink-0" aria-hidden />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className={`font-medium ${locSelected ? 'text-app-accent-hover' : canContainCollections ? 'text-app-text' : 'text-app-text-muted'}`}>
                    {search.trim() ? highlightText(locationLabel, search) : locationLabel}
                  </span>
                  {loc.path && loc.path !== loc.name && (
                    <span className={`text-xs font-mono truncate ${canContainCollections ? 'text-app-text-muted' : 'text-app-text-muted'}`}>
                      {search.trim() ? highlightText(loc.path, search) : loc.path}
                    </span>
                  )}
                  {(loc.effectiveStorageTypeName || loc.storageTypeName) && (
                    <span className={`text-xs font-normal ${canContainCollections ? 'text-app-text-muted' : 'text-app-text-muted'}`}>
                      ({loc.effectiveStorageTypeName || loc.storageTypeName})
                    </span>
                  )}
                  {!canContainCollections && (
                    <span className="text-xs text-app-text-muted italic">(cannot contain collections)</span>
                  )}
                  {locSelected && (
                    <span className="inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium bg-app-accent text-white">
                      Selected
                    </span>
                  )}
                </div>
                {loc.description && (
                  <div className={`text-xs mt-0.5 truncate ${canContainCollections ? 'text-app-text-muted' : 'text-app-text-muted'}`}>
                    {search.trim() ? highlightText(loc.description, search) : loc.description}
                  </div>
                )}
              </div>
            </div>
          )}
          {canContainCollections && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation()
                toggleSelection(loc)
              }}
              className={`flex-shrink-0 px-3 py-2 min-h-[44px] text-sm font-medium rounded-lg transition-colors ${
                locSelected
                  ? 'bg-app-accent text-white hover:bg-app-accent-hover'
                  : 'bg-app-surface text-app-text-muted hover:bg-app-border'
              }`}
            >
              {locSelected ? 'Deselect' : 'Select'}
            </button>
          )}
        </div>
        {hasChildren && isExpanded && (
          <div className="mt-1 space-y-1">
            {children.map((child) => renderLocationNode(child, depth + 1))}
          </div>
        )}
      </div>
    )
  }, [expandedIds, isSelected, toggleSelection, toggleExpanded, locationChildrenMap, search, highlightText])

  const renderTree = useCallback(() => {
    const rootLocations = getRootLocations(locations)
    const displayRoots = search.trim()
      ? Array.from(filteredTree.get(null) || [])
      : rootLocations

    if (displayRoots.length === 0) {
      return (
        <div className="p-8 text-center">
          <p className="text-sm text-app-text-muted mb-2">No locations match this filter.</p>
          {filterCollectionsOnly && (
            <p className="text-xs text-app-text-muted">Only locations that can contain collections are shown.</p>
          )}
        </div>
      )
    }

    return (
      <div className="text-sm space-y-1">
        {displayRoots.map((root) => renderLocationNode(root, 0))}
      </div>
    )
  }, [locations, search, filteredTree, filterCollectionsOnly, renderLocationNode])

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="w-full px-3 py-2 border border-app-border rounded-md shadow-sm bg-app-card text-app-text text-left focus:outline-none focus:ring-2 focus:ring-app-accent focus:border-app-accent"
      >
        {selected.length > 0 ? (
          <div className="space-y-1">
            {selected.map((sel, index) => (
              <div key={index} className="text-sm text-app-text truncate">
                {sel.path}
                {sel.effectiveStorageTypeName ? ` (${sel.effectiveStorageTypeName})` : ''}
              </div>
            ))}
          </div>
        ) : (
          <span className="text-app-text-muted">Select locations...</span>
        )}
      </button>

      {open && (
        <ModalPortal>
          <div className="fixed inset-0 z-[100] flex items-center justify-center">
            <div
              className="fixed inset-0 bg-black/40 backdrop-blur-md"
              onClick={() => setOpen(false)}
            />
<div className="relative z-10 w-full max-w-4xl mx-4 bg-app-card rounded-lg shadow-xl p-6 max-h-[90vh] flex flex-col border border-app-border">
              <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-app-text">Select Locations</h2>
              <button
                type="button"
                className="text-app-text-muted hover:text-app-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-app-accent rounded"
                onClick={() => setOpen(false)}
                aria-label="Close location selection dialog"
              >
                <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="mb-4">
              <label htmlFor="location-search" className="sr-only">
                Search locations
              </label>
              <div className="relative">
                <input
                  id="location-search"
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search by name, path, or description…"
                  className="w-full px-4 py-2 border border-app-border rounded-lg shadow-sm bg-app-card text-app-text focus:ring-2 focus:ring-app-accent focus:border-app-accent"
                  autoFocus
                />
                {search && (
                  <button
                    type="button"
                    onClick={() => setSearch('')}
                    className="absolute right-3 top-2.5 text-app-text-muted hover:text-app-text"
                    aria-label="Clear search"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                )}
              </div>
              {filterCollectionsOnly && (
                <p className="mt-2 text-xs text-app-text-muted">
                  Only showing locations that can contain collections
                </p>
              )}
            </div>

            {selected.length > 0 && (
              <div className="mb-4 p-3 bg-app-surface rounded-lg">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-medium text-app-text">
                    Selected ({selected.length}):
                  </span>
                  <button
                    type="button"
                    onClick={clearAll}
                    className="text-xs text-app-accent hover:text-app-accent-hover"
                  >
                    Clear all
                  </button>
                </div>
                <div className="flex flex-wrap gap-2">
                  {selected.map((sel, index) => (
                    <span
                      key={index}
                      className="inline-flex items-center px-2 py-1 rounded-md bg-app-accent-muted text-app-accent-hover text-xs font-medium"
                    >
                      {sel.path}
                      {sel.effectiveStorageTypeName ? ` (${sel.effectiveStorageTypeName})` : ''}
                      <button
                        type="button"
                        onClick={() => removeSelection(index)}
                        className="ml-1 text-app-accent hover:text-app-accent-hover"
                        aria-label={`Remove ${sel.path}`}
                      >
                        <svg className="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </button>
                    </span>
                  ))}
                </div>
              </div>
            )}

            <div className="border border-app-border rounded-lg overflow-y-auto flex-1 min-h-0 bg-app-surface p-2">
              {loading ? (
                <div className="p-8 text-center">
                  <div className="inline-block animate-spin rounded-full h-6 w-6 border-b-2 border-app-accent"></div>
                  <p className="mt-2 text-sm text-app-text-muted">Loading locations…</p>
                </div>
              ) : (
                renderTree()
              )}
            </div>

            <div className="mt-4 flex justify-end">
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="px-4 py-2 bg-app-accent text-white rounded-lg hover:bg-app-accent-hover font-medium"
              >
                Done
              </button>
            </div>
          </div>
        </div>
        </ModalPortal>
      )}
    </>
  )
}
