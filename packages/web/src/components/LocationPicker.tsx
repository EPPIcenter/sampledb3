import { useState, useEffect, useMemo } from 'react'
import { locationsApi, type Location } from '../lib/api'
import { buildLocationTree, filterLocationTree, getLocationLabel } from '../lib/location-tree'

interface LocationPickerProps {
  value: number | null
  onChange: (locationId: number | null) => void
}

export default function LocationPicker({ value, onChange }: LocationPickerProps) {
  const [locations, setLocations] = useState<Location[]>([])
  const [loading, setLoading] = useState(false)
  const [search, setSearch] = useState('')
  const [expandedRoots, setExpandedRoots] = useState<Record<string, boolean>>({})
  const [expandedLevelI, setExpandedLevelI] = useState<Record<string, Record<string, boolean>>>({})

  useEffect(() => {
    loadLocations()
  }, [])

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

  const selectedLocation = locations.find(loc => loc.id === value)

  const toggleRoot = (root: string) => {
    setExpandedRoots(prev => ({ ...prev, [root]: !prev[root] }))
  }

  const toggleLevelI = (root: string, levelI: string) => {
    setExpandedLevelI(prev => ({
      ...prev,
      [root]: {
        ...prev[root],
        [levelI]: !prev[root]?.[levelI],
      },
    }))
  }


  if (loading) {
    return <div className="text-sm text-gray-500">Loading locations...</div>
  }

  return (
    <div className="space-y-2">
      <div>
        <input
          type="text"
          placeholder="Search locations..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full form-input text-sm"
        />
      </div>

      {selectedLocation && (
        <div className="text-sm text-gray-700 bg-blue-50 border border-blue-200 rounded p-2">
          <span className="font-medium">Selected: </span>
          {selectedLocation.locationRoot} → {selectedLocation.levelI} → {getLocationLabel(selectedLocation)}
        </div>
      )}

      <div className="border border-gray-100 rounded-lg max-h-96 overflow-y-auto">
        {Object.entries(filteredTree).length === 0 ? (
          <div className="p-4 text-sm text-gray-500 text-center">
            {search ? 'No locations found' : 'No locations available'}
          </div>
        ) : (
          <div className="p-2">
            {Object.entries(filteredTree).map(([root, levelIGroup]) => (
              <div key={root} className="mb-2">
                <button
                  type="button"
                  onClick={() => toggleRoot(root)}
                  className="w-full flex items-center justify-between p-2 hover:bg-gray-50 rounded text-left"
                >
                  <span className="font-medium text-gray-900">{root}</span>
                  <span className="text-gray-400">
                    {expandedRoots[root] ? '▼' : '▶'}
                  </span>
                </button>

                {expandedRoots[root] && (
                  <div className="ml-4 mt-1">
                    {Object.entries(levelIGroup).map(([l1, locs]) => (
                      <div key={l1} className="mb-1">
                        <button
                          type="button"
                          onClick={() => toggleLevelI(root, l1)}
                          className="w-full flex items-center justify-between p-2 hover:bg-gray-50 rounded text-left"
                        >
                          <span className="text-gray-700">{l1}</span>
                          <span className="text-gray-400">
                            {expandedLevelI[root]?.[l1] ? '▼' : '▶'}
                          </span>
                        </button>

                        {expandedLevelI[root]?.[l1] && (
                          <div className="ml-4 mt-1 space-y-1">
                            {locs.map((loc) => (
                              <button
                                key={loc.id}
                                type="button"
                                onClick={() => onChange(loc.id)}
                                className={`w-full text-left p-2 rounded text-sm ${
                                  value === loc.id
                                    ? 'bg-blue-100 border border-blue-300 font-medium'
                                    : 'hover:bg-gray-50 border border-transparent'
                                }`}
                              >
                                <div className="flex items-center justify-between">
                                  <span>{getLocationLabel(loc)}</span>
                                  {value === loc.id && (
                                    <span className="text-blue-600">✓</span>
                                  )}
                                </div>
                                {loc.description && (
                                  <div className="text-xs text-gray-500 mt-1">
                                    {loc.description}
                                  </div>
                                )}
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

