import { useState, useMemo, useEffect } from 'react'
import type { Location } from '../lib/api/types';
import { getRootLocations, getLocationChildren, getLocationLabel, locationParentId } from '../lib/location-tree'
import type { PlateCandidate } from '../lib/plate-filename-match'
import { useDebouncedValue } from '../hooks/useDebouncedValue'
import { Modal } from '../ui'

const SEARCH_DEBOUNCE_MS = 250

export type DestinationCollectionKind = 'plate' | 'box'

const KIND_LABELS = {
  plate: {
    containsMatch: 'Plate name contains scan text',
    reverseContainsMatch: 'Scan text contains plate name',
    modalTitle: 'Select Micronix Plate',
    searchPlaceholder: 'Search by location, plate name, or barcode...',
    loading: 'Loading plates...',
    unlocated: 'Unlocated Plates',
    inLocationList: 'Plates in location',
    unlocatedList: 'Unlocated plates',
    matching: 'Matching plates',
    matchingList: 'Plate list',
    suggestedList: 'Suggested plates from scan',
    createFromSearch: (name: string) => `Create new plate: ${name}`,
    createSection: 'Create new plate',
    createHint: 'Use any name — even when the scan filename matches an existing plate.',
    namePlaceholder: 'Plate name',
    alreadyExists: (name: string) =>
      `A plate named "${name}" already exists — select it above.`,
    selectTarget: 'Select target plate...',
    destinationAria: (name: string, isNew: boolean) =>
      isNew ? `Destination plate: ${name} (new plate)` : `Destination plate: ${name}`,
    selectTargetAria: 'Select target plate',
    newBadge: 'New plate',
    noLocations: 'No locations with plates found.',
  },
  box: {
    containsMatch: 'Box name contains scan text',
    reverseContainsMatch: 'Scan text contains box name',
    modalTitle: 'Select Cryovial Box',
    searchPlaceholder: 'Search by location, box name, or barcode...',
    loading: 'Loading boxes...',
    unlocated: 'Unlocated Boxes',
    inLocationList: 'Boxes in location',
    unlocatedList: 'Unlocated boxes',
    matching: 'Matching boxes',
    matchingList: 'Box list',
    suggestedList: 'Suggested boxes from scan',
    createFromSearch: (name: string) => `Create new box: ${name}`,
    createSection: 'Create new box',
    createHint: 'Use any name — even when the scan filename matches an existing box.',
    namePlaceholder: 'Box name',
    alreadyExists: (name: string) =>
      `A box named "${name}" already exists — select it above.`,
    selectTarget: 'Select target box...',
    destinationAria: (name: string, isNew: boolean) =>
      isNew ? `Destination box: ${name} (new box)` : `Destination box: ${name}`,
    selectTargetAria: 'Select target box',
    newBadge: 'New box',
    noLocations: 'No locations with boxes found.',
  },
} as const satisfies Record<
  DestinationCollectionKind,
  {
    containsMatch: string
    reverseContainsMatch: string
    modalTitle: string
    searchPlaceholder: string
    loading: string
    unlocated: string
    inLocationList: string
    unlocatedList: string
    matching: string
    matchingList: string
    suggestedList: string
    createFromSearch: (name: string) => string
    createSection: string
    createHint: string
    namePlaceholder: string
    alreadyExists: (name: string) => string
    selectTarget: string
    destinationAria: (name: string, isNew: boolean) => string
    selectTargetAria: string
    newBadge: string
    noLocations: string
  }
>

export interface DestinationCollection {
  id: number
  name: string
  barcode?: string | null
  locationId?: number | null
  itemCount: number
  locationPath?: string | null
}

interface CollectionDestinationPickerProps {
  kind: DestinationCollectionKind
  locations: Location[]
  collections: DestinationCollection[]
  value?: string
  onChange: (name: string) => void
  disabled?: boolean
  loading?: boolean
  suggestedCollections?: PlateCandidate[]
  allowCreateNew?: boolean
  suggestedNewName?: string | null
}

export default function CollectionDestinationPicker({
  kind,
  locations,
  collections,
  value,
  onChange,
  disabled = false,
  loading = false,
  suggestedCollections,
  allowCreateNew = false,
  suggestedNewName,
}: CollectionDestinationPickerProps) {
  const labels = KIND_LABELS[kind]
  const matchTypeLabels: Record<PlateCandidate['matchType'], string> = {
    exact: 'Exact match',
    contains: labels.containsMatch,
    reverse_contains: labels.reverseContainsMatch,
  }
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  const debouncedSearch = useDebouncedValue(search, SEARCH_DEBOUNCE_MS)
  const [newCustomName, setNewCustomName] = useState('')
  const [expandedIds, setExpandedIds] = useState<Set<number>>(new Set())

  const suggestedRows = useMemo(() => {
    if (!suggestedCollections?.length) return []
    const byId = new Map(collections.map((c) => [c.id, c]))
    const seen = new Set<number>()
    const out: Array<{ collection: DestinationCollection; matchType: PlateCandidate['matchType'] }> = []
    for (const s of suggestedCollections) {
      if (seen.has(s.id)) continue
      const c = byId.get(s.id)
      if (c) {
        seen.add(s.id)
        out.push({ collection: c, matchType: s.matchType })
      }
    }
    return out
  }, [suggestedCollections, collections])

  const showSuggestedSection =
    suggestedRows.length > 0 && (!value || (suggestedCollections?.length ?? 0) > 1)

  const suggestionRank = useMemo(() => {
    const m = new Map<number, number>()
    suggestedCollections?.forEach((s, i) => {
      if (!m.has(s.id)) m.set(s.id, i)
    })
    return m
  }, [suggestedCollections])

  const collectionsByLocation = useMemo(() => {
    const map: Record<number, DestinationCollection[]> = { 0: [] }
    collections.forEach((c) => {
      const lid = c.locationId as number | null | undefined
      if (lid != null) {
        (map[lid] ??= []).push(c)
      } else {
        map[0].push(c)
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

  const filteredLocations = useMemo(() => {
    const locationsWithBoxes = new Set(
      collections
        .map((b) => b.locationId)
        .filter((id): id is number => id !== null && id !== undefined)
    )

    let filtered = locations.filter((loc) => locationsWithBoxes.has(loc.id))

    if (debouncedSearch.trim()) {
      const searchLower = debouncedSearch.toLowerCase()
      filtered = filtered.filter((loc) => {
        const locBoxes = collectionsByLocation[loc.id] ?? []
        const hasMatchingBoxes = locBoxes.some((box) => {
          const nameMatch = box.name.toLowerCase().includes(searchLower)
          const barcodeMatch = (box.barcode ?? '').toLowerCase().includes(searchLower)
          return nameMatch || barcodeMatch
        })

        const locationMatch =
          loc.name.toLowerCase().includes(searchLower) ||
          (loc.path ?? '').toLowerCase().includes(searchLower) ||
          (loc.description ?? '').toLowerCase().includes(searchLower)

        return hasMatchingBoxes || locationMatch
      })
    }

    return filtered
  }, [locations, collections, collectionsByLocation, debouncedSearch])

  useEffect(() => {
    if (debouncedSearch.trim()) {
      const all = new Set<number>()
      filteredLocations.forEach((loc) => {
        let current: Location | undefined = loc
        while (current) {
          all.add(current.id)
          const parentId = locationParentId(current)
          if (parentId != null) {
            current = locations.find((l) => l.id === parentId)
          } else {
            break
          }
        }
      })
      setExpandedIds(all)
    }
  }, [debouncedSearch, filteredLocations, locations])

  const matchingCollections = useMemo(() => {
    if (!debouncedSearch.trim()) return []
    const searchLower = debouncedSearch.toLowerCase()
    const filtered = collections.filter((box) => {
      const nameMatch = box.name.toLowerCase().includes(searchLower)
      const barcodeMatch = (box.barcode ?? '').toLowerCase().includes(searchLower)
      const locationMatch = box.locationId != null && (() => {
        const loc = locations.find((l) => l.id === box.locationId)
        if (!loc) return false
        return (
          loc.name.toLowerCase().includes(searchLower) ||
          (loc.path || '').toLowerCase().includes(searchLower) ||
          (loc.description || '').toLowerCase().includes(searchLower)
        )
      })()
      return nameMatch || barcodeMatch || locationMatch
    })
    const noRank = 1_000_000
    filtered.sort((a, b) => {
      const ia = suggestionRank.get(a.id) ?? noRank
      const ib = suggestionRank.get(b.id) ?? noRank
      if (ia !== ib) return ia - ib
      return a.name.localeCompare(b.name)
    })
    return filtered
  }, [collections, locations, debouncedSearch, suggestionRank])

  const selectedCollection = collections.find((c) => c.name === value)
  const isNewName = Boolean(value?.trim() && !selectedCollection)
  const existingNames = useMemo(() => new Set(collections.map((c) => c.name)), [collections])
  const trimmedNewCustomName = newCustomName.trim()
  const newNameAlreadyExists =
    trimmedNewCustomName.length > 0 && existingNames.has(trimmedNewCustomName)

  useEffect(() => {
    if (!open || !allowCreateNew) return
    setNewCustomName(suggestedNewName?.trim() || search.trim() || '')
  }, [open, allowCreateNew, suggestedNewName, search])

  const handleSelect = (name: string) => {
    onChange(name)
    setOpen(false)
  }

  const handleUseNewName = () => {
    if (!trimmedNewCustomName || newNameAlreadyExists) return
    handleSelect(trimmedNewCustomName)
  }

  const renderLocationNode = (loc: Location, depth: number = 0): React.ReactNode => {
    const children = getLocationChildren(locations, loc.id)
    const isExpanded = expandedIds.has(loc.id)
    const locBoxes = collectionsByLocation[loc.id] ?? []
    const hasBoxes = locBoxes.length > 0
    const isVisible = filteredLocations.some((f) => {
      if (f.id === loc.id) return true
      const checkDescendants = (parentId: number): boolean => {
        const directChildren = getLocationChildren(locations, parentId)
        return directChildren.some((child) => {
          if (filteredLocations.some((f) => f.id === child.id)) return true
          return checkDescendants(child.id)
        })
      }
      return checkDescendants(loc.id)
    })

    if (!isVisible && depth > 0) return null

    const locationLabel = getLocationLabel(loc)
    const expandAriaLabel = isExpanded
      ? `Collapse ${locationLabel}`
      : `Expand ${locationLabel}`

    return (
      <div key={loc.id} className={depth > 0 ? 'ml-4 border-l border-app-border pl-2 mb-1' : 'mb-2'}>
        {children.length > 0 ? (
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
            aria-expanded={isExpanded}
            aria-label={expandAriaLabel}
            className="storage-tree-picker-row w-full flex items-center gap-3 px-3 py-3 min-h-[44px] rounded-lg border border-transparent hover:bg-app-surface hover:border-app-border transition-colors text-left group relative cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-teal-500 focus-visible:ring-offset-1"
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
              <div className="text-sm text-app-text font-medium">{locationLabel}</div>
              {loc.path && (
                <div className="text-[10px] text-app-text-muted font-mono truncate">{loc.path}</div>
              )}
            </div>
          </button>
        ) : (
          <div className="storage-tree-picker-row flex items-center gap-3 px-3 py-3 min-h-[44px] rounded-lg">
            <div className="w-5 flex-shrink-0" aria-hidden />
            <div className="flex-1 min-w-0">
              <div className="text-sm text-app-text font-medium">{locationLabel}</div>
              {loc.path && (
                <div className="text-[10px] text-app-text-muted font-mono truncate">{loc.path}</div>
              )}
            </div>
          </div>
        )}

        {children.length > 0 && isExpanded && (
          <div className="mt-1">
            {children.map((child) => renderLocationNode(child, depth + 1))}
          </div>
        )}

        {hasBoxes && (
          <div className="ml-4 space-y-1 mt-1" role="listbox" aria-label={labels.inLocationList}>
            {locBoxes
              .filter((box) => {
                if (!debouncedSearch.trim()) return true
                const searchLower = debouncedSearch.toLowerCase()
                const nameMatch = box.name.toLowerCase().includes(searchLower)
                const barcodeMatch = (box.barcode ?? '').toLowerCase().includes(searchLower)
                return nameMatch || barcodeMatch
              })
              .map((box) => {
                const isSelected = box.name === value
                const searchLower = debouncedSearch.trim().toLowerCase()
                const highlightName = searchLower && box.name.toLowerCase().includes(searchLower)
                const highlightBarcode = searchLower && (box.barcode ?? '').toLowerCase().includes(searchLower)

                return (
                  <button
                    key={box.id}
                    type="button"
                    role="option"
                    aria-selected={isSelected}
                    onClick={() => handleSelect(box.name)}
                    className={`w-full text-left px-3 py-3 min-h-[44px] border rounded-lg transition-colors ${
                      isSelected
                        ? 'border-app-accent bg-app-accent-muted text-app-accent-hover'
                        : 'border-app-border hover:border-app-accent/50 hover:bg-app-accent-muted text-app-text'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className={`font-medium text-sm ${highlightName ? 'rounded px-0.5 bg-app-accent-muted text-app-accent-on-tint' : ''}`}>
                        {box.name}
                      </span>
                      {box.barcode && (
                        <span className={`text-[10px] ml-2 ${highlightBarcode ? 'rounded px-0.5 bg-app-accent-muted text-app-accent-on-tint font-semibold' : 'text-app-text-muted'}`}>
                          {box.barcode}
                        </span>
                      )}
                    </div>
                    <div className="text-[10px] text-app-text-muted mt-0.5">
                      {box.itemCount} item{box.itemCount !== 1 ? 's' : ''}
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
    const rootLocations = getRootLocations(locations)
    const rootsWithBoxes = rootLocations.filter((root) => {
      const checkDescendants = (parentId: number): boolean => {
        const directChildren = getLocationChildren(locations, parentId)
        return directChildren.some((child) => {
          if ((collectionsByLocation[child.id] ?? []).length > 0) return true
          return checkDescendants(child.id)
        })
      }
      if ((collectionsByLocation[root.id] ?? []).length > 0) return true
      return checkDescendants(root.id)
    })

    if (rootsWithBoxes.length === 0 && !debouncedSearch.trim()) {
      return <p className="text-sm text-app-text-muted p-4">{labels.noLocations}</p>
    }

    if (rootsWithBoxes.length === 0 && debouncedSearch.trim()) {
      return <p className="text-sm text-app-text-muted p-4">No locations match this filter.</p>
    }

    return (
      <>
        {rootsWithBoxes.map((root) => renderLocationNode(root, 0))}

        {/* eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- collectionsByLocation[0] may be missing when key 0 not in map */}
        {(collectionsByLocation[0] ?? []).length > 0 && (
          <div className="mt-4 pt-4 border-t border-app-border" role="listbox" aria-label={labels.unlocatedList}>
            <div className="font-medium text-sm text-app-text mb-2">{labels.unlocated}</div>
            <div className="space-y-1">
              {(collectionsByLocation[0] ?? [])
                .filter((box) => {
                  if (!debouncedSearch.trim()) return true
                  const searchLower = debouncedSearch.toLowerCase()
                  const nameMatch = box.name.toLowerCase().includes(searchLower)
                  const barcodeMatch = (box.barcode ?? '').toLowerCase().includes(searchLower)
                  return nameMatch || barcodeMatch
                })
                .map((box) => {
                  const isSelected = box.name === value
                  const searchLower = debouncedSearch.trim().toLowerCase()
                  const highlightName = searchLower && box.name.toLowerCase().includes(searchLower)
                  const highlightBarcode = searchLower && (box.barcode ?? '').toLowerCase().includes(searchLower)

                  return (
                    <button
                      key={box.id}
                      type="button"
                      role="option"
                      aria-selected={isSelected}
                      onClick={() => handleSelect(box.name)}
                      className={`w-full text-left px-3 py-3 min-h-[44px] border rounded-lg transition-colors ${
                        isSelected
                          ? 'border-app-accent bg-app-accent-muted text-app-accent-hover'
                          : 'border-app-border hover:border-app-accent/50 hover:bg-app-accent-muted text-app-text'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className={`font-medium text-sm ${highlightName ? 'rounded px-0.5 bg-app-accent-muted text-app-accent-on-tint' : ''}`}>
                          {box.name}
                        </span>
                        {box.barcode && (
                          <span className={`text-[10px] ml-2 ${highlightBarcode ? 'rounded px-0.5 bg-app-accent-muted text-app-accent-on-tint font-semibold' : 'text-app-text-muted'}`}>
                            {box.barcode}
                          </span>
                        )}
                      </div>
                      <div className="text-[10px] text-app-text-muted mt-0.5">
                        {box.itemCount} item{box.itemCount !== 1 ? 's' : ''}
                      </div>
                    </button>
                  )
                })}
            </div>
          </div>
        )}
      </>
    )
  }

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => !disabled && setOpen(true)}
        disabled={disabled}
        aria-label={
          isNewName
            ? labels.destinationAria(value!, true)
            : selectedCollection
              ? labels.destinationAria(selectedCollection.name, false)
              : labels.selectTargetAria
        }
        className={`w-full px-3 py-2 border border-app-border rounded-lg shadow-sm bg-app-card text-left focus:outline-none focus:ring-2 focus:ring-app-accent focus:border-app-accent ${
          disabled ? 'bg-app-surface text-app-text-muted cursor-not-allowed' : 'hover:border-app-border'
        }`}
      >
        {isNewName ? (
          <div className="flex items-center justify-between gap-2">
            <span className="text-sm font-medium text-app-text">{value}</span>
            <span className="text-xs text-app-accent shrink-0">{labels.newBadge}</span>
          </div>
        ) : selectedCollection ? (
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-app-text">{selectedCollection.name}</span>
            {selectedCollection.locationPath && (
              <span className="text-xs text-app-text-muted ml-2 truncate">{selectedCollection.locationPath}</span>
            )}
          </div>
        ) : (
          <span className="text-sm text-app-text-muted">{labels.selectTarget}</span>
        )}
      </button>

      <Modal
        isOpen={open && !disabled}
        onClose={() => setOpen(false)}
        title={labels.modalTitle}
        size="md"
        layout="centered"
        panelClassName="max-h-[80vh] flex flex-col"
        contentClassName="p-6 flex flex-col max-h-[80vh]"
      >
            <div className="mb-4">
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={labels.searchPlaceholder}
                className="w-full form-input"
                autoFocus
              />
            </div>

            <div className="border border-app-border rounded-lg overflow-y-auto flex-1 min-h-0">
              {loading ? (
                <div className="p-4 text-sm text-app-text-muted">{labels.loading}</div>
              ) : (
                <div className="p-2">
                  {showSuggestedSection && !debouncedSearch.trim() && (
                    <div className="mb-4">
                      <div className="px-3 py-1.5 bg-app-accent-muted/40 border border-app-accent/25 text-xs font-semibold text-app-text rounded-t-lg">
                        Suggested from scan
                      </div>
                      <div
                        role="listbox"
                        aria-label={labels.suggestedList}
                        className="border border-t-0 border-app-border rounded-b-lg overflow-hidden divide-y divide-app-border"
                      >
                        {suggestedRows.map(({ collection, matchType }) => {
                          const isSelected = collection.name === value
                          return (
                            <button
                              key={collection.id}
                              type="button"
                              role="option"
                              aria-selected={isSelected}
                              onClick={() => handleSelect(collection.name)}
                              className={`w-full text-left px-3 py-3 min-h-[44px] transition-colors ${
                                isSelected
                                  ? 'bg-app-accent-muted text-app-accent-hover'
                                  : 'hover:bg-app-surface text-app-text'
                              }`}
                            >
                              <div className="flex items-center justify-between gap-2">
                                <span className="font-medium text-sm">{collection.name}</span>
                                {collection.barcode && (
                                  <span className="text-[10px] text-app-text-muted font-mono shrink-0">
                                    {collection.barcode}
                                  </span>
                                )}
                              </div>
                              <div className="text-[10px] text-app-accent-hover font-medium mt-0.5">
                                {matchTypeLabels[matchType]}
                              </div>
                              <div className="text-[10px] text-app-text-muted mt-0.5">
                                {collection.itemCount} item{collection.itemCount !== 1 ? 's' : ''}
                                {collection.locationPath ? ` · ${collection.locationPath}` : ''}
                              </div>
                            </button>
                          )
                        })}
                      </div>
                    </div>
                  )}
                  {allowCreateNew && debouncedSearch.trim() && matchingCollections.length === 0 && (
                    <div className="mb-4">
                      <button
                        type="button"
                        onClick={() => handleSelect(debouncedSearch.trim())}
                        className="w-full text-left px-3 py-3 min-h-[44px] border border-app-accent/40 rounded-lg bg-app-accent-muted/30 hover:bg-app-accent-muted text-app-text transition-colors"
                      >
                        <span className="text-sm font-medium">{labels.createFromSearch(debouncedSearch.trim())}</span>
                        <span className="block text-[10px] text-app-text-muted mt-0.5">
                          Assign a storage location in the next step.
                        </span>
                      </button>
                    </div>
                  )}
                  {debouncedSearch.trim() && matchingCollections.length > 0 && (
                    <div className="mb-4">
                      <div className="px-3 py-1.5 bg-app-surface border-b border-app-border text-xs font-medium text-app-text-muted sticky top-0 rounded-t-lg">
                        {labels.matching}
                      </div>
                      <div
                        role="listbox"
                        aria-label={labels.matchingList}
                        className="border border-app-border rounded-b-lg overflow-hidden"
                      >
                        {matchingCollections.map((collection) => {
                          const isSelected = collection.name === value
                          const searchLower = debouncedSearch.trim().toLowerCase()
                          const highlightName = searchLower && collection.name.toLowerCase().includes(searchLower)
                          const highlightBarcode = searchLower && (collection.barcode ?? '').toLowerCase().includes(searchLower)
                          return (
                            <button
                              key={collection.id}
                              type="button"
                              role="option"
                              aria-selected={isSelected}
                              onClick={() => handleSelect(collection.name)}
                              className={`w-full text-left px-3 py-3 min-h-[44px] border-b border-app-border last:border-b-0 transition-colors ${
                                isSelected
                                  ? 'bg-app-accent-muted text-app-accent-hover'
                                  : 'hover:bg-app-surface text-app-text'
                              }`}
                            >
                              <div className="flex items-center justify-between">
                                <span className={`font-medium text-sm ${highlightName ? 'rounded px-0.5 bg-app-accent-muted text-app-accent-on-tint' : ''}`}>
                                  {collection.name}
                                </span>
                                {collection.barcode && (
                                  <span className={`text-[10px] ml-2 ${highlightBarcode ? 'rounded px-0.5 bg-app-accent-muted text-app-accent-on-tint font-semibold' : 'text-app-text-muted'}`}>
                                    {collection.barcode}
                                  </span>
                                )}
                              </div>
                              <div className="text-[10px] text-app-text-muted mt-0.5">
                                {collection.itemCount} item{collection.itemCount !== 1 ? 's' : ''}
                                {collection.locationPath && ` · ${collection.locationPath}`}
                              </div>
                            </button>
                          )
                        })}
                      </div>
                    </div>
                  )}
                  {renderLocationTree()}
                </div>
              )}
            </div>

            {allowCreateNew && (
              <div className="mt-4 pt-4 border-t border-app-border">
                <p className="text-xs font-semibold text-app-text mb-2">{labels.createSection}</p>
                <p className="text-xs text-app-text-muted mb-2">{labels.createHint}</p>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={newCustomName}
                    onChange={(e) => setNewCustomName(e.target.value)}
                    placeholder={labels.namePlaceholder}
                    className="flex-1 form-input text-sm"
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault()
                        handleUseNewName()
                      }
                    }}
                  />
                  <button
                    type="button"
                    onClick={handleUseNewName}
                    disabled={!trimmedNewCustomName || newNameAlreadyExists}
                    className="px-3 py-2 text-sm border border-app-border rounded-lg text-app-text hover:bg-app-surface disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap"
                  >
                    Use name
                  </button>
                </div>
                {newNameAlreadyExists && (
                  <p className="text-xs text-app-text-muted mt-1">
                    {labels.alreadyExists(trimmedNewCustomName)}
                  </p>
                )}
              </div>
            )}

            <div className="mt-4 flex justify-end">
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="px-4 py-2 bg-app-accent text-white rounded-lg hover:bg-app-accent-hover font-medium"
              >
                Done
              </button>
            </div>
      </Modal>
    </div>
  )
}
