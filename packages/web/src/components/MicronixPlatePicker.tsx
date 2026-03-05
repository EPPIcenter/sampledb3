import { useState, useMemo, useEffect } from 'react'
import { type Location } from '../lib/api'
import { getRootLocations, getLocationChildren, getLocationLabel } from '../lib/location-tree'
import ModalPortal from './ModalPortal'

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
}

export default function MicronixPlatePicker({
  locations,
  plates,
  value,
  onChange,
  disabled = false,
  loading = false,
}: MicronixPlatePickerProps) {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  const [expandedIds, setExpandedIds] = useState<Set<number>>(new Set())

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

  // Flat list of plates matching search (for Option B: show above tree when searching)
  const matchingPlates = useMemo(() => {
    if (!search.trim()) return []
    const searchLower = search.toLowerCase()
    return plates.filter((plate) => {
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
  }, [plates, locations, search])

  const selectedPlate = plates.find((p) => p.name === value)

  const handleSelect = (plateName: string) => {
    onChange(plateName)
    setOpen(false)
  }

  const renderLocationNode = (loc: Location, depth: number = 0): React.ReactNode => {
    const children = getLocationChildren(locations, loc.id)
    const isExpanded = expandedIds.has(loc.id)
    const locPlates = platesByLocation[loc.id] ?? []
    const hasPlates = locPlates.length > 0
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

    const locationLabel = getLocationLabel(loc)
    const expandAriaLabel = isExpanded
      ? `Collapse ${locationLabel}`
      : `Expand ${locationLabel}`

    return (
      <div key={loc.id} className={depth > 0 ? 'ml-4 border-l border-gray-100 pl-2 mb-1' : 'mb-2'}>
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
            className="storage-tree-picker-row w-full flex items-center gap-3 px-3 py-3 min-h-[44px] rounded-lg border border-transparent hover:bg-gray-50 hover:border-gray-200 transition-colors text-left group relative cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-teal-500 focus-visible:ring-offset-1"
          >
            <div className="flex-shrink-0 w-5 h-5 flex items-center justify-center text-gray-500 group-hover:text-gray-700" aria-hidden>
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
              <div className="text-sm text-gray-800 font-medium">
                {locationLabel}
              </div>
              {loc.path && (
                <div className="text-[10px] text-gray-400 font-mono truncate">
                  {loc.path}
                </div>
              )}
            </div>
          </button>
        ) : (
          <div className="storage-tree-picker-row flex items-center gap-3 px-3 py-3 min-h-[44px] rounded-lg">
            <div className="w-5 flex-shrink-0" aria-hidden />
            <div className="flex-1 min-w-0">
              <div className="text-sm text-gray-800 font-medium">
                {locationLabel}
              </div>
              {loc.path && (
                <div className="text-[10px] text-gray-400 font-mono truncate">
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
                        ? 'border-blue-500 bg-blue-50 text-blue-900'
                        : 'border-gray-200 hover:border-blue-300 hover:bg-blue-50 text-gray-900'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className={`font-medium text-sm ${highlightName ? 'bg-yellow-200' : ''}`}>
                        {plate.name}
                      </span>
                      {plate.barcode && (
                        <span className={`text-[10px] ml-2 ${highlightBarcode ? 'bg-yellow-200 font-semibold' : 'text-gray-500'}`}>
                          {plate.barcode}
                        </span>
                      )}
                    </div>
                    <div className="text-[10px] text-gray-500 mt-0.5">
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
      const checkDescendants = (parentId: number | null): boolean => {
        const directChildren = locations.filter((l) => l.parentId === parentId)
        return directChildren.some((child) => {
          if (platesByLocation[child.id].length > 0) return true
          return checkDescendants(child.id)
        })
      }
      if (platesByLocation[root.id].length > 0) return true
      return checkDescendants(root.id)
    })
    
    if (rootsWithPlates.length === 0 && !search.trim()) {
      return <p className="text-sm text-gray-500 p-4">No locations with plates found.</p>
    }
    
    if (rootsWithPlates.length === 0 && search.trim()) {
      return <p className="text-sm text-gray-500 p-4">No locations match this filter.</p>
    }

    return (
      <>
        {rootsWithPlates.map((root) => renderLocationNode(root, 0))}
        
        {/* Show unlocated plates if any */}
        {platesByLocation[0].length > 0 && (
          <div className="mt-4 pt-4 border-t border-gray-200" role="listbox" aria-label="Unlocated plates">
            <div className="font-medium text-sm text-gray-700 mb-2">Unlocated Plates</div>
            <div className="space-y-1">
              {platesByLocation[0]
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
                          ? 'border-blue-500 bg-blue-50 text-blue-900'
                          : 'border-gray-200 hover:border-blue-300 hover:bg-blue-50 text-gray-900'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className={`font-medium text-sm ${highlightName ? 'bg-yellow-200' : ''}`}>
                          {plate.name}
                        </span>
                        {plate.barcode && (
                          <span className={`text-[10px] ml-2 ${highlightBarcode ? 'bg-yellow-200 font-semibold' : 'text-gray-500'}`}>
                            {plate.barcode}
                          </span>
                        )}
                      </div>
                      <div className="text-[10px] text-gray-500 mt-0.5">
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
        className={`w-full px-3 py-2 border border-gray-200 rounded-lg shadow-sm bg-white text-left focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 ${
          disabled ? 'bg-gray-50 text-gray-400 cursor-not-allowed' : 'hover:border-gray-300'
        }`}
      >
        {selectedPlate ? (
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-gray-900">{selectedPlate.name}</span>
            {selectedPlate.locationPath && (
              <span className="text-xs text-gray-500 ml-2 truncate">{selectedPlate.locationPath}</span>
            )}
          </div>
        ) : (
          <span className="text-sm text-gray-400">Select target plate...</span>
        )}
      </button>

      {open && !disabled && (
        <ModalPortal>
          <div className="fixed inset-0 z-[100] flex items-center justify-center">
            <div
              className="fixed inset-0 bg-gray-900/40 backdrop-blur-md"
              onClick={() => setOpen(false)}
            />
          <div
            className="relative z-10 w-full max-w-2xl mx-4 bg-white rounded-lg shadow-xl p-6 max-h-[80vh] flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-gray-900">Select Micronix Plate</h3>
              <button
                type="button"
                className="text-gray-500 hover:text-gray-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 rounded"
                onClick={() => setOpen(false)}
                aria-label="Close plate selection"
              >
                <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

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

            <div className="border border-gray-200 rounded-lg overflow-y-auto flex-1 min-h-0">
              {loading ? (
                <div className="p-4 text-sm text-gray-500">Loading plates...</div>
              ) : (
                <div className="p-2">
                  {search.trim() && matchingPlates.length > 0 && (
                    <div className="mb-4">
                      <div className="px-3 py-1.5 bg-gray-50 border-b border-gray-200 text-xs font-medium text-gray-600 sticky top-0 rounded-t-lg">
                        Matching plates
                      </div>
                      <div
                        role="listbox"
                        aria-label="Plate list"
                        className="border border-gray-200 rounded-b-lg overflow-hidden"
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
                              className={`w-full text-left px-3 py-3 min-h-[44px] border-b border-gray-100 last:border-b-0 transition-colors ${
                                isSelected
                                  ? 'bg-blue-50 text-blue-900'
                                  : 'hover:bg-gray-50 text-gray-900'
                              }`}
                            >
                              <div className="flex items-center justify-between">
                                <span className={`font-medium text-sm ${highlightName ? 'bg-yellow-200' : ''}`}>
                                  {plate.name}
                                </span>
                                {plate.barcode && (
                                  <span className={`text-[10px] ml-2 ${highlightBarcode ? 'bg-yellow-200 font-semibold' : 'text-gray-500'}`}>
                                    {plate.barcode}
                                  </span>
                                )}
                              </div>
                              <div className="text-[10px] text-gray-500 mt-0.5">
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

            <div className="mt-4 flex justify-end">
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium"
              >
                Done
              </button>
            </div>
          </div>
        </div>
        </ModalPortal>
      )}
    </div>
  )
}

