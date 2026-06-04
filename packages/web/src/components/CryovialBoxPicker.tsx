import { useState, useMemo } from 'react'
import type { Location } from '../lib/api/types';
import { getRootLocations, getLocationChildren, getLocationLabel, locationParentId } from '../lib/location-tree'
import { Modal } from '../ui'

export interface CryovialBox {
  id: number
  name: string
  barcode?: string | null
  locationId?: number | null
  itemCount: number
  locationPath?: string | null
}

interface CryovialBoxPickerProps {
  locations: Location[]
  boxes: CryovialBox[]
  value?: string
  onChange: (boxName: string) => void
  disabled?: boolean
  loading?: boolean
}

export default function CryovialBoxPicker({
  locations,
  boxes,
  value,
  onChange,
  disabled = false,
  loading = false,
}: CryovialBoxPickerProps) {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  const [expandedIds, setExpandedIds] = useState<Set<number>>(new Set())

  // Map boxes by location ID
  const boxesByLocation = useMemo(() => {
    const map: Record<number, CryovialBox[]> = { 0: [] }
    boxes.forEach((b) => {
      const lid = b.locationId as number | null | undefined
      if (lid != null) {
        (map[lid] ??= []).push(b)
      } else {
        map[0].push(b)
      }
    })
    return map
  }, [boxes])

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

  // Filter locations to only those with boxes
  const filteredLocations = useMemo(() => {
    const locationsWithBoxes = new Set(
      boxes
        .map((b) => b.locationId)
        .filter((id): id is number => id !== null && id !== undefined)
    )
    
    let filtered = locations.filter((loc) => locationsWithBoxes.has(loc.id))
    
    // Apply search filter
    if (search.trim()) {
      const searchLower = search.toLowerCase()
      filtered = filtered.filter((loc) => {
        const locBoxes = boxesByLocation[loc.id] ?? []
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
  }, [locations, boxes, boxesByLocation, search])

  // Automatically expand all nodes when searching
  useMemo(() => {
    if (search.trim()) {
      const all = new Set<number>()
      filteredLocations.forEach((loc) => {
        // Expand all ancestors to show matching locations
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

  const selectedBox = boxes.find((b) => b.name === value)

  const handleSelect = (boxName: string) => {
    onChange(boxName)
    setOpen(false)
  }

  const renderLocationNode = (loc: Location, depth: number = 0): React.ReactNode => {
    const children = getLocationChildren(locations, loc.id)
    const isExpanded = expandedIds.has(loc.id)
    const locBoxes = boxesByLocation[loc.id] ?? []
    const hasBoxes = locBoxes.length > 0
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

    return (
      <div key={loc.id} className={depth > 0 ? 'ml-4 border-l border-app-border pl-2 mb-1' : 'mb-2'}>
        <div className="flex items-center">
          {children.length > 0 && (
            <button
              type="button"
              onClick={() => toggleExpanded(loc.id)}
              className="w-4 text-app-text-muted text-xs flex-shrink-0"
            >
              {isExpanded ? '▾' : '▸'}
            </button>
          )}
          {children.length === 0 && <span className="w-4"></span>}
          <div className="flex-1 min-w-0">
            <div className="text-sm text-app-text font-medium">
              {getLocationLabel(loc)}
            </div>
            {loc.path && (
              <div className="text-[10px] text-app-text-muted font-mono truncate">
                {loc.path}
              </div>
            )}
          </div>
        </div>

        {children.length > 0 && isExpanded && (
          <div className="mt-1">
            {children.map((child) => renderLocationNode(child, depth + 1))}
          </div>
        )}

        {hasBoxes && (
          <div className="ml-4 space-y-1 mt-1">
            {locBoxes
              .filter((box) => {
                if (!search.trim()) return true
                const searchLower = search.toLowerCase()
                const nameMatch = box.name.toLowerCase().includes(searchLower)
                const barcodeMatch = (box.barcode ?? '').toLowerCase().includes(searchLower)
                return nameMatch || barcodeMatch
              })
              .map((box) => {
                const isSelected = box.name === value
                const searchLower = search.trim().toLowerCase()
                const highlightName = searchLower && box.name.toLowerCase().includes(searchLower)
                const highlightBarcode = searchLower && (box.barcode ?? '').toLowerCase().includes(searchLower)
                
                return (
                  <button
                    key={box.id}
                    type="button"
                    onClick={() => handleSelect(box.name)}
                    className={`w-full text-left px-3 py-2 border rounded-lg transition-colors ${
                      isSelected
                        ? 'border-app-accent bg-app-accent-muted text-app-accent-hover'
                        : 'border-app-border hover:border-app-accent hover:bg-app-accent-muted text-app-text'
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
      // Include if root or any descendant has boxes
      const checkDescendants = (parentId: number): boolean => {
        const directChildren = getLocationChildren(locations, parentId)
        return directChildren.some((child) => {
          if ((boxesByLocation[child.id] ?? []).length > 0) return true
          return checkDescendants(child.id)
        })
      }
      if ((boxesByLocation[root.id] ?? []).length > 0) return true
      return checkDescendants(root.id)
    })
    
    if (rootsWithBoxes.length === 0 && !search.trim() && boxesByLocation[0].length === 0) {
      return <p className="text-sm text-app-text-muted p-4">No locations with boxes found.</p>
    }
    if (rootsWithBoxes.length === 0 && search.trim() && boxesByLocation[0].length === 0) {
      return <p className="text-sm text-app-text-muted p-4">No locations match this filter.</p>
    }

    return (
      <>
        {rootsWithBoxes.map((root) => renderLocationNode(root, 0))}
        
        {/* Show unlocated boxes if any */}
        {boxesByLocation[0].length > 0 && (
          <div className="mt-4 pt-4 border-t border-app-border">
            <div className="font-medium text-sm text-app-text mb-2">Unlocated Boxes</div>
            <div className="space-y-1">
              {boxesByLocation[0]
                .filter((box) => {
                  if (!search.trim()) return true
                  const searchLower = search.toLowerCase()
                  const nameMatch = box.name.toLowerCase().includes(searchLower)
                  const barcodeMatch = (box.barcode ?? '').toLowerCase().includes(searchLower)
                  return nameMatch || barcodeMatch
                })
                .map((box) => {
                  const isSelected = box.name === value
                  const searchLower = search.trim().toLowerCase()
                  const highlightName = searchLower && box.name.toLowerCase().includes(searchLower)
                  const highlightBarcode = searchLower && (box.barcode ?? '').toLowerCase().includes(searchLower)
                  
                  return (
                    <button
                      key={box.id}
                      type="button"
                      onClick={() => handleSelect(box.name)}
                      className={`w-full text-left px-3 py-2 border rounded-lg transition-colors ${
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
        className={`w-full px-3 py-2 border border-app-border rounded-lg shadow-sm bg-app-card text-app-text text-left focus:outline-none focus:ring-2 focus:ring-app-accent focus:border-app-accent ${
          disabled ? 'bg-app-surface text-app-text-muted cursor-not-allowed' : 'hover:border-app-border'
        }`}
      >
        {selectedBox ? (
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-app-text">{selectedBox.name}</span>
            {selectedBox.locationPath && (
              <span className="text-xs text-app-text-muted ml-2 truncate">{selectedBox.locationPath}</span>
            )}
          </div>
        ) : (
          <span className="text-sm text-app-text-muted">Select target box...</span>
        )}
      </button>

      <Modal
        isOpen={open && !disabled}
        onClose={() => setOpen(false)}
        title="Select Cryovial Box"
        size="md"
        layout="centered"
        panelClassName="border border-app-border max-h-[80vh] flex flex-col"
        contentClassName="p-6 flex flex-col max-h-[80vh]"
      >
            <div className="mb-4">
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search by location, box name, or barcode..."
                className="w-full form-input"
                autoFocus
              />
            </div>

            <div className="border border-app-border rounded-lg overflow-y-auto flex-1 min-h-0">
              {loading ? (
                <div className="p-4 text-sm text-app-text-muted">Loading boxes...</div>
              ) : (
                <div className="p-2">
                  {renderLocationTree()}
                </div>
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
      </Modal>
    </div>
  )
}

