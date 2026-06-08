import { useState, useMemo, useEffect } from 'react'
import type { Location } from '../lib/api/types';
import { getRootLocations, getLocationChildren, getLocationLabel, locationParentId } from '../lib/location-tree'
import type { PlateCandidate } from '../lib/plate-filename-match'
import { Modal } from '../ui'

const MATCH_TYPE_LABELS: Record<PlateCandidate['matchType'], string> = {
  exact: 'Exact match',
  contains: 'Plate name contains scan text',
  reverse_contains: 'Scan text contains plate name',
}

export interface MicronixPlate {
  id: number
  name: string
  barcode?: string | null
  locationId?: number | null
  itemCount: number
  locationPath?: string | null
}

interface MicronixPlatePickerProps {
  locations: Location[]
  plates: MicronixPlate[]
  value?: string
  onChange: (plateName: string) => void
  disabled?: boolean
  loading?: boolean
  /** Ordered inference candidates (e.g. from filename/CSV); shown at top when ambiguous. */
  suggestedPlates?: PlateCandidate[]
  /** When true, user can pick a plate name that does not exist yet (creation happens elsewhere). */
  allowCreateNew?: boolean
  /** Default name for the create-new field (e.g. filename stem). */
  suggestedNewPlateName?: string | null
}

export default function MicronixPlatePicker({
  locations,
  plates,
  value,
  onChange,
  disabled = false,
  loading = false,
  suggestedPlates,
  allowCreateNew = false,
  suggestedNewPlateName,
}: MicronixPlatePickerProps) {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  const [newPlateName, setNewPlateName] = useState('')
  const [expandedIds, setExpandedIds] = useState<Set<number>>(new Set())

  const suggestedRows = useMemo(() => {
    if (!suggestedPlates?.length) return []
    const byId = new Map(plates.map((p) => [p.id, p]))
    const seen = new Set<number>()
    const out: Array<{ plate: MicronixPlate; matchType: PlateCandidate['matchType'] }> = []
    for (const s of suggestedPlates) {
      if (seen.has(s.id)) continue
      const p = byId.get(s.id)
      if (p) {
        seen.add(s.id)
        out.push({ plate: p, matchType: s.matchType })
      }
    }
    return out
  }, [suggestedPlates, plates])

  const showSuggestedSection =
    suggestedRows.length > 0 && (!value || (suggestedPlates?.length ?? 0) > 1)

  const suggestionRank = useMemo(() => {
    const m = new Map<number, number>()
    suggestedPlates?.forEach((s, i) => {
      if (!m.has(s.id)) m.set(s.id, i)
    })
    return m
  }, [suggestedPlates])

  // Map plates by location ID
  const platesByLocation = useMemo(() => {
    const map: Record<number, MicronixPlate[]> = { 0: [] }
    plates.forEach((p) => {
      const lid = p.locationId as number | null | undefined
      if (lid != null) {
        (map[lid] ??= []).push(p)
      } else {
        map[0].push(p)
      }
    })
    return map
  }, [plates])

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

  // Filter locations to only those with plates
  const filteredLocations = useMemo(() => {
    const locationsWithPlates = new Set(
      plates
        .map((p) => p.locationId)
        .filter((id): id is number => id !== null && id !== undefined)
    )
    
    let filtered = locations.filter((loc) => locationsWithPlates.has(loc.id))
    
    // Apply search filter
    if (search.trim()) {
      const searchLower = search.toLowerCase()
      filtered = filtered.filter((loc) => {
        const locPlates = platesByLocation[loc.id] ?? []
        const hasMatchingPlates = locPlates.some((plate) => {
          const nameMatch = plate.name.toLowerCase().includes(searchLower)
          const barcodeMatch = plate.barcode?.toLowerCase().includes(searchLower)
          return nameMatch || barcodeMatch
        })
        
        const locationMatch =
          loc.name.toLowerCase().includes(searchLower) ||
          (loc.path ?? '').toLowerCase().includes(searchLower) ||
          (loc.description ?? '').toLowerCase().includes(searchLower)
        
        return hasMatchingPlates || locationMatch
      })
    }
    
    return filtered
  }, [locations, plates, platesByLocation, search])

  // Automatically expand all nodes when searching
  useEffect(() => {
    if (search.trim()) {
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
  }, [search, filteredLocations, locations])

  // Flat list of plates matching search (for Option B: show above tree when searching)
  const matchingPlates = useMemo(() => {
    if (!search.trim()) return []
    const searchLower = search.toLowerCase()
    const filtered = plates.filter((plate) => {
      const nameMatch = plate.name.toLowerCase().includes(searchLower)
      const barcodeMatch = plate.barcode?.toLowerCase().includes(searchLower)
      const locationMatch = plate.locationId != null && (() => {
        const loc = locations.find((l) => l.id === plate.locationId)
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
  }, [plates, locations, search, suggestionRank])

  const selectedPlate = plates.find((p) => p.name === value)
  const isNewPlateName = Boolean(value?.trim() && !selectedPlate)
  const existingPlateNames = useMemo(() => new Set(plates.map((p) => p.name)), [plates])
  const trimmedNewPlateName = newPlateName.trim()
  const newPlateNameAlreadyExists =
    trimmedNewPlateName.length > 0 && existingPlateNames.has(trimmedNewPlateName)

  useEffect(() => {
    if (!open || !allowCreateNew) return
    setNewPlateName(suggestedNewPlateName?.trim() || search.trim() || '')
  }, [open, allowCreateNew, suggestedNewPlateName])

  const handleSelect = (plateName: string) => {
    onChange(plateName)
    setOpen(false)
  }

  const handleUseNewPlateName = () => {
    if (!trimmedNewPlateName || newPlateNameAlreadyExists) return
    handleSelect(trimmedNewPlateName)
  }

  const renderLocationNode = (loc: Location, depth: number = 0): React.ReactNode => {
    const children = getLocationChildren(locations, loc.id)
    const isExpanded = expandedIds.has(loc.id)
    const locPlates = platesByLocation[loc.id] ?? []
    const hasPlates = locPlates.length > 0
    const isVisible = filteredLocations.some((f) => {
      if (f.id === loc.id) return true
      // Check if any descendant is in filtered list
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
              <div className="text-sm text-app-text font-medium">
                {locationLabel}
              </div>
              {loc.path && (
                <div className="text-[10px] text-app-text-muted font-mono truncate">
                  {loc.path}
                </div>
              )}
            </div>
          </button>
        ) : (
          <div className="storage-tree-picker-row flex items-center gap-3 px-3 py-3 min-h-[44px] rounded-lg">
            <div className="w-5 flex-shrink-0" aria-hidden />
            <div className="flex-1 min-w-0">
              <div className="text-sm text-app-text font-medium">
                {locationLabel}
              </div>
              {loc.path && (
                <div className="text-[10px] text-app-text-muted font-mono truncate">
                  {loc.path}
                </div>
              )}
            </div>
          </div>
        )}

        {children.length > 0 && isExpanded && (
          <div className="mt-1">
            {children.map((child) => renderLocationNode(child, depth + 1))}
          </div>
        )}

        {hasPlates && (
          <div className="ml-4 space-y-1 mt-1" role="listbox" aria-label="Plates in location">
            {locPlates
              .filter((plate) => {
                if (!search.trim()) return true
                const searchLower = search.toLowerCase()
                const nameMatch = plate.name.toLowerCase().includes(searchLower)
                const barcodeMatch = plate.barcode?.toLowerCase().includes(searchLower)
                return nameMatch || barcodeMatch
              })
              .map((plate) => {
                const isSelected = plate.name === value
                const searchLower = search.trim().toLowerCase()
                const highlightName = searchLower && plate.name.toLowerCase().includes(searchLower)
                const highlightBarcode = searchLower && plate.barcode?.toLowerCase().includes(searchLower)
                
                return (
                  <button
                    key={plate.id}
                    type="button"
                    role="option"
                    aria-selected={isSelected}
                    onClick={() => handleSelect(plate.name)}
                    className={`w-full text-left px-3 py-3 min-h-[44px] border rounded-lg transition-colors ${
                      isSelected
                        ? 'border-app-accent bg-app-accent-muted text-app-accent-hover'
                        : 'border-app-border hover:border-app-accent/50 hover:bg-app-accent-muted text-app-text'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span
                        className={`font-medium text-sm ${highlightName ? 'rounded px-0.5 bg-app-accent-muted text-app-accent-on-tint' : ''}`}
                      >
                        {plate.name}
                      </span>
                      {plate.barcode && (
                        <span className={`text-[10px] ml-2 ${highlightBarcode ? 'rounded px-0.5 bg-app-accent-muted text-app-accent-on-tint font-semibold' : 'text-app-text-muted'}`}>
                          {plate.barcode}
                        </span>
                      )}
                    </div>
                    <div className="text-[10px] text-app-text-muted mt-0.5">
                      {plate.itemCount} item{plate.itemCount !== 1 ? 's' : ''}
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
    const rootsWithPlates = rootLocations.filter((root) => {
      // Include if root or any descendant has plates
      const checkDescendants = (parentId: number): boolean => {
        const directChildren = getLocationChildren(locations, parentId)
        return directChildren.some((child) => {
          if ((platesByLocation[child.id] ?? []).length > 0) return true
          return checkDescendants(child.id)
        })
      }
      if ((platesByLocation[root.id] ?? []).length > 0) return true
      return checkDescendants(root.id)
    })
    
    if (rootsWithPlates.length === 0 && !search.trim()) {
      return <p className="text-sm text-app-text-muted p-4">No locations with plates found.</p>
    }
    
    if (rootsWithPlates.length === 0 && search.trim()) {
      return <p className="text-sm text-app-text-muted p-4">No locations match this filter.</p>
    }

    return (
      <>
        {rootsWithPlates.map((root) => renderLocationNode(root, 0))}
        
        {/* Show unlocated plates if any */}
        {/* eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- platesByLocation[0] may be missing when key 0 not in map (e.g. no unlocated plates) */}
        {(platesByLocation[0] ?? []).length > 0 && (
          <div className="mt-4 pt-4 border-t border-app-border" role="listbox" aria-label="Unlocated plates">
            <div className="font-medium text-sm text-app-text mb-2">Unlocated Plates</div>
            <div className="space-y-1">
              {/* eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- same as above */}
              {(platesByLocation[0] ?? [])
                .filter((plate) => {
                  if (!search.trim()) return true
                  const searchLower = search.toLowerCase()
                  const nameMatch = plate.name.toLowerCase().includes(searchLower)
                  const barcodeMatch = plate.barcode?.toLowerCase().includes(searchLower)
                  return nameMatch || barcodeMatch
                })
                .map((plate) => {
                  const isSelected = plate.name === value
                  const searchLower = search.trim().toLowerCase()
                  const highlightName = searchLower && plate.name.toLowerCase().includes(searchLower)
                  const highlightBarcode = searchLower && plate.barcode?.toLowerCase().includes(searchLower)
                  
                  return (
                    <button
                      key={plate.id}
                      type="button"
                      role="option"
                      aria-selected={isSelected}
                      onClick={() => handleSelect(plate.name)}
                      className={`w-full text-left px-3 py-3 min-h-[44px] border rounded-lg transition-colors ${
                        isSelected
                          ? 'border-app-accent bg-app-accent-muted text-app-accent-hover'
                          : 'border-app-border hover:border-app-accent/50 hover:bg-app-accent-muted text-app-text'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span
                        className={`font-medium text-sm ${highlightName ? 'rounded px-0.5 bg-app-accent-muted text-app-accent-on-tint' : ''}`}
                      >
                          {plate.name}
                        </span>
                        {plate.barcode && (
                          <span className={`text-[10px] ml-2 ${highlightBarcode ? 'rounded px-0.5 bg-app-accent-muted text-app-accent-on-tint font-semibold' : 'text-app-text-muted'}`}>
                            {plate.barcode}
                          </span>
                        )}
                      </div>
                      <div className="text-[10px] text-app-text-muted mt-0.5">
                        {plate.itemCount} item{plate.itemCount !== 1 ? 's' : ''}
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
          isNewPlateName
            ? `Destination plate: ${value} (new plate)`
            : selectedPlate
              ? `Destination plate: ${selectedPlate.name}`
              : 'Select target plate'
        }
        className={`w-full px-3 py-2 border border-app-border rounded-lg shadow-sm bg-app-card text-left focus:outline-none focus:ring-2 focus:ring-app-accent focus:border-app-accent ${
          disabled ? 'bg-app-surface text-app-text-muted cursor-not-allowed' : 'hover:border-app-border'
        }`}
      >
        {isNewPlateName ? (
          <div className="flex items-center justify-between gap-2">
            <span className="text-sm font-medium text-app-text">{value}</span>
            <span className="text-xs text-app-accent shrink-0">New plate</span>
          </div>
        ) : selectedPlate ? (
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-app-text">{selectedPlate.name}</span>
            {selectedPlate.locationPath && (
              <span className="text-xs text-app-text-muted ml-2 truncate">{selectedPlate.locationPath}</span>
            )}
          </div>
        ) : (
          <span className="text-sm text-app-text-muted">Select target plate...</span>
        )}
      </button>

      <Modal
        isOpen={open && !disabled}
        onClose={() => setOpen(false)}
        title="Select Micronix Plate"
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
                placeholder="Search by location, plate name, or barcode..."
                className="w-full form-input"
                autoFocus
              />
            </div>

            <div className="border border-app-border rounded-lg overflow-y-auto flex-1 min-h-0">
              {loading ? (
                <div className="p-4 text-sm text-app-text-muted">Loading plates...</div>
              ) : (
                <div className="p-2">
                  {showSuggestedSection && !search.trim() && (
                    <div className="mb-4">
                      <div className="px-3 py-1.5 bg-app-accent-muted/40 border border-app-accent/25 text-xs font-semibold text-app-text rounded-t-lg">
                        Suggested from scan
                      </div>
                      <div
                        role="listbox"
                        aria-label="Suggested plates from scan"
                        className="border border-t-0 border-app-border rounded-b-lg overflow-hidden divide-y divide-app-border"
                      >
                        {suggestedRows.map(({ plate, matchType }) => {
                          const isSelected = plate.name === value
                          return (
                            <button
                              key={plate.id}
                              type="button"
                              role="option"
                              aria-selected={isSelected}
                              onClick={() => handleSelect(plate.name)}
                              className={`w-full text-left px-3 py-3 min-h-[44px] transition-colors ${
                                isSelected
                                  ? 'bg-app-accent-muted text-app-accent-hover'
                                  : 'hover:bg-app-surface text-app-text'
                              }`}
                            >
                              <div className="flex items-center justify-between gap-2">
                                <span className="font-medium text-sm">{plate.name}</span>
                                {plate.barcode && (
                                  <span className="text-[10px] text-app-text-muted font-mono shrink-0">
                                    {plate.barcode}
                                  </span>
                                )}
                              </div>
                              <div className="text-[10px] text-app-accent-hover font-medium mt-0.5">
                                {MATCH_TYPE_LABELS[matchType]}
                              </div>
                              <div className="text-[10px] text-app-text-muted mt-0.5">
                                {plate.itemCount} item{plate.itemCount !== 1 ? 's' : ''}
                                {plate.locationPath ? ` · ${plate.locationPath}` : ''}
                              </div>
                            </button>
                          )
                        })}
                      </div>
                    </div>
                  )}
                  {allowCreateNew && search.trim() && matchingPlates.length === 0 && (
                    <div className="mb-4">
                      <button
                        type="button"
                        onClick={() => handleSelect(search.trim())}
                        className="w-full text-left px-3 py-3 min-h-[44px] border border-app-accent/40 rounded-lg bg-app-accent-muted/30 hover:bg-app-accent-muted text-app-text transition-colors"
                      >
                        <span className="text-sm font-medium">Create new plate: {search.trim()}</span>
                        <span className="block text-[10px] text-app-text-muted mt-0.5">
                          Assign a storage location in the next step.
                        </span>
                      </button>
                    </div>
                  )}
                  {search.trim() && matchingPlates.length > 0 && (
                    <div className="mb-4">
                      <div className="px-3 py-1.5 bg-app-surface border-b border-app-border text-xs font-medium text-app-text-muted sticky top-0 rounded-t-lg">
                        Matching plates
                      </div>
                      <div
                        role="listbox"
                        aria-label="Plate list"
                        className="border border-app-border rounded-b-lg overflow-hidden"
                      >
                        {matchingPlates.map((plate) => {
                          const isSelected = plate.name === value
                          const searchLower = search.trim().toLowerCase()
                          const highlightName = searchLower && plate.name.toLowerCase().includes(searchLower)
                          const highlightBarcode = searchLower && plate.barcode?.toLowerCase().includes(searchLower)
                          return (
                            <button
                              key={plate.id}
                              type="button"
                              role="option"
                              aria-selected={isSelected}
                              onClick={() => handleSelect(plate.name)}
                              className={`w-full text-left px-3 py-3 min-h-[44px] border-b border-app-border last:border-b-0 transition-colors ${
                                isSelected
                                  ? 'bg-app-accent-muted text-app-accent-hover'
                                  : 'hover:bg-app-surface text-app-text'
                              }`}
                            >
                              <div className="flex items-center justify-between">
                                <span
                        className={`font-medium text-sm ${highlightName ? 'rounded px-0.5 bg-app-accent-muted text-app-accent-on-tint' : ''}`}
                      >
                                  {plate.name}
                                </span>
                                {plate.barcode && (
                                  <span className={`text-[10px] ml-2 ${highlightBarcode ? 'rounded px-0.5 bg-app-accent-muted text-app-accent-on-tint font-semibold' : 'text-app-text-muted'}`}>
                                    {plate.barcode}
                                  </span>
                                )}
                              </div>
                              <div className="text-[10px] text-app-text-muted mt-0.5">
                                {plate.itemCount} item{plate.itemCount !== 1 ? 's' : ''}
                                {plate.locationPath && ` · ${plate.locationPath}`}
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
                <p className="text-xs font-semibold text-app-text mb-2">Create new plate</p>
                <p className="text-xs text-app-text-muted mb-2">
                  Use any name — even when the scan filename matches an existing plate.
                </p>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={newPlateName}
                    onChange={(e) => setNewPlateName(e.target.value)}
                    placeholder="Plate name"
                    className="flex-1 form-input text-sm"
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault()
                        handleUseNewPlateName()
                      }
                    }}
                  />
                  <button
                    type="button"
                    onClick={handleUseNewPlateName}
                    disabled={!trimmedNewPlateName || newPlateNameAlreadyExists}
                    className="px-3 py-2 text-sm border border-app-border rounded-lg text-app-text hover:bg-app-surface disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap"
                  >
                    Use name
                  </button>
                </div>
                {newPlateNameAlreadyExists && (
                  <p className="text-xs text-app-text-muted mt-1">
                    A plate named &quot;{trimmedNewPlateName}&quot; already exists — select it above.
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

