import { useState, useMemo } from 'react'
import { type Location } from '../lib/api'
import { buildLocationTree, getLocationLabel } from '../lib/location-tree'

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
  const [expandedNodes, setExpandedNodes] = useState<Record<string, boolean>>({})

  const tree = useMemo(() => buildLocationTree(locations), [locations])

  // Map plates by location ID
  const platesByLocation = useMemo(() => {
    const map: Record<number, MicronixPlate[]> = {}
    plates.forEach((p) => {
      if (p.locationId) {
        if (!map[p.locationId]) map[p.locationId] = []
        map[p.locationId].push(p)
      } else {
        // Plates without location go into a special "unlocated" group
        if (!map[0]) map[0] = []
        map[0].push(p)
      }
    })
    return map
  }, [plates])

  const toggleNode = (id: string) => {
    setExpandedNodes((prev) => ({ ...prev, [id]: !prev[id] }))
  }

  const filteredTree = useMemo(() => {
    const searchLower = search.trim().toLowerCase()
    
    // Build a set of location IDs that have plates
    const locationsWithPlates = new Set(
      plates
        .map((p) => p.locationId)
        .filter((id): id is number => id !== null && id !== undefined)
    )
    
    // Filter tree to only include locations with plates
    const treeWithPlates: typeof tree = {}
    for (const [root, levelIGroup] of Object.entries(tree)) {
      const filteredLevelI: typeof levelIGroup = {}
      
      for (const [levelI, locs] of Object.entries(levelIGroup)) {
        const filteredLocs = (locs as Location[]).filter((loc) => {
          // Only include locations that have plates
          if (!locationsWithPlates.has(loc.id)) return false
          
          // If searching, check if location or its plates match
          if (searchLower) {
            const locPlates = platesByLocation[loc.id] || []
            const hasMatchingPlates = locPlates.some((plate) => {
              const nameMatch = plate.name.toLowerCase().includes(searchLower)
              const barcodeMatch = plate.barcode?.toLowerCase().includes(searchLower)
              return nameMatch || barcodeMatch
            })
            
            const label = getLocationLabel(loc).toLowerCase()
            const locationMatch = label.includes(searchLower) || (loc.description || '').toLowerCase().includes(searchLower)
            const rootMatch = root.toLowerCase().includes(searchLower)
            const levelIMatch = levelI.toLowerCase().includes(searchLower)
            
            return hasMatchingPlates || locationMatch || rootMatch || levelIMatch
          }
          
          return true
        })

        if (filteredLocs.length > 0) {
          filteredLevelI[levelI] = filteredLocs
        }
      }

      if (Object.keys(filteredLevelI).length > 0) {
        treeWithPlates[root] = filteredLevelI
      }
    }

    return treeWithPlates
  }, [tree, search, plates, platesByLocation])

  const selectedPlate = plates.find((p) => p.name === value)

  const handleSelect = (plateName: string) => {
    onChange(plateName)
    setOpen(false)
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
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div
            className="absolute inset-0 bg-gray-900/20 backdrop-blur-sm"
            onClick={() => setOpen(false)}
          />
          <div className="relative z-[60] w-full max-w-2xl mx-4 bg-white rounded-lg shadow-lg p-6 max-h-[80vh] flex flex-col">
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
                  {Object.keys(filteredTree).length === 0 && search.trim() ? (
                    <p className="text-sm text-gray-500 p-4">No locations match this filter.</p>
                  ) : (
                    <>
                      {Object.entries(filteredTree).map(([root, levelIGroup]) => {
                        const rootId = root
                        const isRootExpanded = expandedNodes[rootId] ?? false

                        return (
                          <div key={root} className="mb-2">
                            <button
                              type="button"
                              onClick={() => toggleNode(rootId)}
                              className="flex items-center justify-between w-full px-2 py-1.5 rounded-lg hover:bg-gray-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
                            >
                              <span className="font-medium text-sm text-gray-900">{root}</span>
                              <span className="text-gray-400 text-xs">
                                {isRootExpanded ? '▾' : '▸'}
                              </span>
                            </button>

                            {isRootExpanded && (
                              <div className="ml-4 pl-2 border-l border-gray-100 mt-1">
                                {Object.entries(levelIGroup as any).map(([levelI, locs]) => {
                                  const l1Id = `${root}-${levelI}`
                                  const isL1Expanded = expandedNodes[l1Id] ?? false

                                  return (
                                    <div key={levelI} className="mb-1">
                                      <button
                                        type="button"
                                        onClick={() => toggleNode(l1Id)}
                                        className="flex items-center justify-between w-full px-2 py-1 rounded-lg hover:bg-gray-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
                                      >
                                        <span className="text-sm text-gray-700">{levelI}</span>
                                        <span className="text-gray-400 text-xs">
                                          {isL1Expanded ? '▾' : '▸'}
                                        </span>
                                      </button>

                                      {isL1Expanded && (
                                        <div className="ml-4 pl-2 border-l border-gray-100 mt-1">
                                          {(locs as Location[])
                                            .filter((loc) => {
                                              // Only show locations that have plates
                                              const locPlates = platesByLocation[loc.id] || []
                                              if (locPlates.length === 0) return false
                                              
                                              // If searching, also check if any plates match
                                              if (search.trim()) {
                                                const searchLower = search.toLowerCase()
                                                return locPlates.some((plate) => {
                                                  const nameMatch = plate.name.toLowerCase().includes(searchLower)
                                                  const barcodeMatch = plate.barcode?.toLowerCase().includes(searchLower)
                                                  return nameMatch || barcodeMatch
                                                })
                                              }
                                              
                                              return true
                                            })
                                            .map((loc) => {
                                            const locId = `loc-${loc.id}`
                                            const isLocExpanded = expandedNodes[locId] ?? false
                                            const locPlates = platesByLocation[loc.id] || []
                                            const hasPlates = locPlates.length > 0

                                            return (
                                              <div key={loc.id} className="mb-1">
                                                <button
                                                  type="button"
                                                  onClick={() => toggleNode(locId)}
                                                  disabled={!hasPlates}
                                                  className={`flex items-center justify-between w-full px-2 py-1 rounded-lg text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${
                                                    hasPlates
                                                      ? 'text-gray-600 hover:bg-gray-50'
                                                      : 'text-gray-400 cursor-default'
                                                  }`}
                                                >
                                                  <span className="w-4 text-gray-300 text-[10px]">
                                                    {hasPlates ? (isLocExpanded ? '▾' : '▸') : '•'}
                                                  </span>
                                                  {getLocationLabel(loc)}
                                                </button>

                                                {isLocExpanded && hasPlates && (
                                                  <div className="ml-4 space-y-1 mt-1">
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
                                                            onClick={() => handleSelect(plate.name)}
                                                            className={`w-full text-left px-3 py-2 border rounded-lg transition-colors ${
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

                      {/* Show unlocated plates if any */}
                      {platesByLocation[0] && platesByLocation[0].length > 0 && (
                        <div className="mt-4 pt-4 border-t border-gray-200">
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
                                    onClick={() => handleSelect(plate.name)}
                                    className={`w-full text-left px-3 py-2 border rounded-lg transition-colors ${
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
                  )}
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
      )}
    </div>
  )
}

