import { useState, useEffect, useMemo } from 'react'
import { locationsApi, type Location } from '../lib/api'
import { buildLocationTree, filterLocationTree, getLocationLabel } from '../lib/location-tree'

export interface LocationSelection {
  type: 'root' | 'levelI' | 'levelII' | 'location'
  root: string
  levelI?: string
  levelII?: string
  locationId?: number
  path: string
}

interface LocationTreePickerProps {
  selected: LocationSelection[]
  onChange: (selections: LocationSelection[]) => void
}

export default function LocationTreePicker({ selected, onChange }: LocationTreePickerProps) {
  const [open, setOpen] = useState(false)
  const [locations, setLocations] = useState<Location[]>([])
  const [loading, setLoading] = useState(false)
  const [search, setSearch] = useState('')
  const [expandedRoots, setExpandedRoots] = useState<Record<string, boolean>>({})
  const [expandedLevelI, setExpandedLevelI] = useState<Record<string, Record<string, boolean>>>({})

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
      setLocations(response.data.locations || [])
    } catch (error) {
      console.error('Failed to load locations:', error)
    } finally {
      setLoading(false)
    }
  }

  const tree = useMemo(() => buildLocationTree(locations), [locations])
  const filteredTree = useMemo(
    () => (search.trim() ? filterLocationTree(tree, search) : tree),
    [tree, search]
  )

  const isSelected = (selection: LocationSelection): boolean => {
    return selected.some((s) => {
      if (s.type !== selection.type) return false
      if (s.root !== selection.root) return false
      if (selection.type === 'root') return true
      if (s.levelI !== selection.levelI) return false
      if (selection.type === 'levelI') return true
      if (s.levelII !== selection.levelII) return false
      if (selection.type === 'levelII') return true
      return s.locationId === selection.locationId
    })
  }

  const toggleSelection = (selection: LocationSelection) => {
    if (isSelected(selection)) {
      // Remove selection
      onChange(selected.filter((s) => {
        if (s.type !== selection.type) return true
        if (s.root !== selection.root) return true
        if (selection.type === 'root') return false
        if (s.levelI !== selection.levelI) return true
        if (selection.type === 'levelI') return false
        if (s.levelII !== selection.levelII) return true
        if (selection.type === 'levelII') return false
        return s.locationId !== selection.locationId
      }))
    } else {
      // Add selection
      onChange([...selected, selection])
    }
  }

  const removeSelection = (index: number) => {
    onChange(selected.filter((_, i) => i !== index))
  }

  const clearAll = () => {
    onChange([])
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
    const t = filteredTree
    if (Object.keys(t).length === 0) {
      return <p className="text-sm text-gray-500 p-4">No locations match this filter.</p>
    }

    return (
      <div className="text-sm">
        {Object.entries(t).map(([root, levelIGroup]) => {
          const rootExpanded = expandedRoots[root] ?? false
          const rootSelection: LocationSelection = {
            type: 'root',
            root,
            path: root,
          }
          const rootSelected = isSelected(rootSelection)

          return (
            <div key={root} className="mb-1">
              <button
                type="button"
                onClick={() => toggleRoot(root)}
                className={`flex items-center justify-between w-full px-2 py-1.5 rounded hover:bg-gray-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${
                  rootSelected ? 'bg-blue-50 border border-blue-200' : ''
                }`}
              >
                <div className="flex items-center flex-1">
                  <span className="w-3 h-3 mr-2 text-gray-500">
                    {rootExpanded ? '▾' : '▸'}
                  </span>
                  <span className={`font-medium ${rootSelected ? 'text-blue-700' : 'text-gray-800'}`}>
                    {root}
                  </span>
                  {rootSelected && (
                    <span className="ml-2 text-xs text-blue-600">(selected)</span>
                  )}
                </div>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation()
                    toggleSelection(rootSelection)
                  }}
                  className={`ml-2 px-2 py-0.5 text-xs rounded ${
                    rootSelected
                      ? 'bg-blue-600 text-white'
                      : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                  }`}
                >
                  {rootSelected ? 'Deselect' : 'Select'}
                </button>
              </button>

              {rootExpanded && (
                <div className="ml-4 border-l border-gray-100 pl-3 mt-1">
                  {Object.entries(levelIGroup).map(([levelI, locs]) => {
                    const l1Expanded = expandedLevelI[root]?.[levelI] ?? false
                    const levelISelection: LocationSelection = {
                      type: 'levelI',
                      root,
                      levelI,
                      path: `${root} → ${levelI}`,
                    }
                    const levelISelected = isSelected(levelISelection)

                    return (
                      <div key={levelI} className="mb-1">
                        <button
                          type="button"
                          onClick={() => toggleLevelI(root, levelI)}
                          className={`flex items-center justify-between w-full px-1 py-1 rounded hover:bg-gray-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${
                            levelISelected ? 'bg-blue-50 border border-blue-200' : ''
                          }`}
                        >
                          <div className="flex items-center flex-1">
                            <span className="w-3 h-3 mr-2 text-gray-400">
                              {l1Expanded ? '▾' : '▸'}
                            </span>
                            <span className={levelISelected ? 'text-blue-700' : 'text-gray-800'}>
                              {levelI}
                            </span>
                            {levelISelected && (
                              <span className="ml-2 text-xs text-blue-600">(selected)</span>
                            )}
                          </div>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation()
                              toggleSelection(levelISelection)
                            }}
                            className={`ml-2 px-2 py-0.5 text-xs rounded ${
                              levelISelected
                                ? 'bg-blue-600 text-white'
                                : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                            }`}
                          >
                            {levelISelected ? 'Deselect' : 'Select'}
                          </button>
                        </button>

                        {l1Expanded && (
                          <div className="ml-4 border-l border-gray-100 pl-3 mt-1 space-y-1">
                            {locs.map((loc) => {
                              const locationSelection: LocationSelection = {
                                type: 'location',
                                root,
                                levelI,
                                levelII: loc.levelII,
                                locationId: loc.id,
                                path: `${root} → ${levelI} → ${getLocationLabel(loc)}`,
                              }
                              const locSelected = isSelected(locationSelection)

                              return (
                                <button
                                  key={loc.id}
                                  type="button"
                                  onClick={() => toggleSelection(locationSelection)}
                                  className={`flex items-center justify-between w-full px-2 py-1 rounded text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${
                                    locSelected
                                      ? 'bg-blue-50 border border-blue-200'
                                      : 'hover:bg-gray-50 border border-transparent'
                                  }`}
                                >
                                  <div className="text-left flex-1">
                                    <p className={locSelected ? 'text-blue-900' : 'text-gray-900'}>
                                      {getLocationLabel(loc)}
                                    </p>
                                    {loc.description && (
                                      <p className="text-[11px] text-gray-500 truncate">
                                        {loc.description}
                                      </p>
                                    )}
                                  </div>
                                  {locSelected && (
                                    <span className="ml-2 text-[10px] text-blue-700 font-medium">
                                      ✓
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

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="w-full px-3 py-2 border border-gray-100 rounded-md shadow-sm bg-white text-left focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
      >
        {selected.length > 0 ? (
          <div className="space-y-1">
            {selected.map((sel, index) => (
              <div key={index} className="text-sm text-gray-900 truncate">
                {sel.path}
              </div>
            ))}
          </div>
        ) : (
          <span className="text-gray-400">Select locations...</span>
        )}
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div
            className="absolute inset-0 bg-gray-900/20 backdrop-blur-sm"
            onClick={() => setOpen(false)}
          />
          <div className="relative z-[60] w-full max-w-4xl mx-4 bg-white rounded-lg shadow-lg p-6 max-h-[90vh] flex flex-col">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-gray-900">Select Locations</h2>
              <button
                type="button"
                className="text-gray-500 hover:text-gray-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 rounded"
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
              <input
                id="location-search"
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search by root, level, or description…"
                className="w-full form-input"
                autoFocus
              />
            </div>

            {selected.length > 0 && (
              <div className="mb-4 p-3 bg-gray-50 rounded-lg">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-medium text-gray-700">
                    Selected ({selected.length}):
                  </span>
                  <button
                    type="button"
                    onClick={clearAll}
                    className="text-xs text-blue-600 hover:text-blue-800"
                  >
                    Clear all
                  </button>
                </div>
                <div className="flex flex-wrap gap-2">
                  {selected.map((sel, index) => (
                    <span
                      key={index}
                      className="inline-flex items-center px-2 py-1 rounded-md bg-blue-100 text-blue-800 text-xs font-medium"
                    >
                      {sel.path}
                      <button
                        type="button"
                        onClick={() => removeSelection(index)}
                        className="ml-1 text-blue-600 hover:text-blue-800"
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

            <div className="border border-gray-100 rounded-md overflow-y-auto flex-1 min-h-0">
              {loading ? (
                <div className="p-4 text-sm text-gray-500">Loading locations…</div>
              ) : (
                renderTree()
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
    </>
  )
}

