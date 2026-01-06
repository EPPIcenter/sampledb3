import { Link } from 'react-router-dom'
import { Location } from '../../lib/api'
import SkeletonCard from '../SkeletonCard'

interface StorageOverviewProps {
  locations: Location[]
  locationCounts: Record<string, number>
  loading?: boolean
}

function getRootLocations(locations: Location[]): Location[] {
  return locations.filter((loc) => loc.parentId === null)
}

function getLocationStats(locations: Location[], locationCounts: Record<string, number>) {
  const totalLocations = locations.length
  const locationsWithContainers = Object.keys(locationCounts).length
  const emptyLocations = totalLocations - locationsWithContainers

  return {
    totalLocations,
    locationsWithContainers,
    emptyLocations,
  }
}

export default function StorageOverview({ locations, locationCounts, loading }: StorageOverviewProps) {
  if (loading) {
    return (
      <div className="bg-white rounded-lg shadow p-6 mb-8">
        <h2 className="text-xl font-semibold mb-4 text-gray-900">Storage Overview</h2>
        <SkeletonCard height="h-48" />
      </div>
    )
  }

  const rootLocations = getRootLocations(locations)
  const stats = getLocationStats(locations, locationCounts)

  return (
    <div className="bg-white rounded-lg shadow p-6 mb-8">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xl font-semibold text-gray-900">Storage Overview</h2>
        <Link
          to="/locations"
          className="text-sm text-blue-600 hover:text-blue-700 font-medium"
          aria-label="View all locations"
        >
          View All Locations →
        </Link>
      </div>

      {/* Storage Health Indicators */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <div className="p-4 bg-blue-50 rounded-lg">
          <div className="text-sm font-medium text-gray-600 mb-1">Total Locations</div>
          <div className="text-2xl font-bold text-blue-600">{stats.totalLocations}</div>
        </div>
        <div className="p-4 bg-green-50 rounded-lg">
          <div className="text-sm font-medium text-gray-600 mb-1">With Containers</div>
          <div className="text-2xl font-bold text-green-600">{stats.locationsWithContainers}</div>
        </div>
        <div className="p-4 bg-gray-50 rounded-lg">
          <div className="text-sm font-medium text-gray-600 mb-1">Empty</div>
          <div className="text-2xl font-bold text-gray-600">{stats.emptyLocations}</div>
        </div>
      </div>

      {/* Root Locations */}
      {rootLocations.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold text-gray-700 mb-3">Root Locations</h3>
          <div className="space-y-2">
            {rootLocations.slice(0, 10).map((location) => {
              // Match by location name (byRootLocation uses names as keys)
              const containerCount = locationCounts[location.name] || 0
              return (
                <Link
                  key={location.id}
                  to={`/locations/${location.id}`}
                  className="flex items-center justify-between p-3 border border-gray-100 rounded-lg hover:bg-gray-50 transition-colors"
                  aria-label={`View location ${location.name}`}
                >
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-indigo-100 rounded">
                      <svg
                        className="w-5 h-5 text-indigo-600"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"
                        />
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M15 11a3 3 0 11-6 0 3 3 0 016 0z"
                        />
                      </svg>
                    </div>
                    <div>
                      <div className="font-medium text-gray-900">{location.name}</div>
                      {location.storageTypeName && (
                        <div className="text-sm text-gray-500">{location.storageTypeName}</div>
                      )}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-sm font-medium text-gray-900">{containerCount.toLocaleString()}</div>
                    <div className="text-xs text-gray-500">containers</div>
                  </div>
                </Link>
              )
            })}
          </div>
        </div>
      )}

      {rootLocations.length === 0 && (
        <div className="text-center py-8 text-gray-500">No locations found</div>
      )}
    </div>
  )
}

