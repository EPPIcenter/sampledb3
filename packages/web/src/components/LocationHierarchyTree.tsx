import { type Location } from '../lib/api'
import { buildLocationTree, getLocationLabel, getRootLocations, getLocationChildren } from '../lib/location-tree'

interface LocationHierarchyTreeProps {
  locations: Location[]
  currentLocationId?: number
  filterByRoot?: number  // Filter by root location ID instead of root name
  onLocationClick?: (location: Location) => void
  renderLocation?: (location: Location, isCurrent: boolean) => React.ReactNode
  className?: string
}

/**
 * Reusable component for displaying location hierarchy trees.
 * Shows parent-child structure recursively.
 */
export default function LocationHierarchyTree({
  locations,
  currentLocationId,
  filterByRoot,
  onLocationClick,
  renderLocation,
  className = '',
}: LocationHierarchyTreeProps) {
  const tree = buildLocationTree(locations)

  // Filter by root if specified
  const rootLocations = getRootLocations(locations)
  const displayRoots = filterByRoot
    ? rootLocations.filter(loc => loc.id === filterByRoot)
    : rootLocations

  const defaultRenderLocation = (location: Location, isCurrent: boolean) => {
    const label = getLocationLabel(location)
    return (
      <div
        className={`flex items-center justify-between rounded px-2 py-1 ${
          isCurrent
            ? 'bg-blue-50 border border-blue-200'
            : 'hover:bg-gray-50 border border-transparent'
        }`}
      >
        <div>
          <p className="text-xs text-gray-900">{label}</p>
          {location.description && (
            <p className="text-[11px] text-gray-500 truncate">
              {location.description}
            </p>
          )}
        </div>
        {isCurrent && (
          <span className="text-[10px] font-mono text-blue-700">current</span>
        )}
      </div>
    )
  }

  const renderLocationNode = (loc: Location, depth: number = 0): React.ReactNode => {
    const children = getLocationChildren(locations, loc.id)
    const isCurrent = loc.id === currentLocationId
    const content = renderLocation
      ? renderLocation(loc, isCurrent)
      : defaultRenderLocation(loc, isCurrent)

    return (
      <div key={loc.id} className={depth > 0 ? 'ml-4 border-l border-gray-100 pl-3' : ''}>
        {onLocationClick ? (
          <div onClick={() => onLocationClick(loc)} className="cursor-pointer">
            {content}
          </div>
        ) : (
          content
        )}
        {children.length > 0 && (
          <div className="mt-1 space-y-1">
            {children.map(child => renderLocationNode(child, depth + 1))}
          </div>
        )}
      </div>
    )
  }

  return (
    <div className={`text-sm ${className}`}>
      {displayRoots.map((root) => (
        <div key={root.id} className="mb-2">
          <div className="font-semibold text-gray-800 flex items-center justify-between">
            <div className="flex items-center">
              <span className="w-2 h-2 rounded-full bg-gray-400 mr-2" />
              <span>{root.name}</span>
            </div>
            {(root.effectiveStorageTypeName || root.storageTypeName) && (
              <span className="text-xs font-normal text-gray-500 ml-2">
                ({root.effectiveStorageTypeName || root.storageTypeName})
              </span>
            )}
          </div>
          <div className="ml-4 border-l border-gray-100 pl-3">
            {getLocationChildren(locations, root.id).map(child => renderLocationNode(child, 1))}
          </div>
        </div>
      ))}
    </div>
  )
}
