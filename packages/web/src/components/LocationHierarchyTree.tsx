import { type Location } from '../lib/api'
import { buildLocationTree, getLocationLabel } from '../lib/location-tree'

interface LocationHierarchyTreeProps {
  locations: Location[]
  currentLocationId?: number
  filterByRoot?: string
  onLocationClick?: (location: Location) => void
  renderLocation?: (location: Location, isCurrent: boolean) => React.ReactNode
  className?: string
}

/**
 * Reusable component for displaying location hierarchy trees.
 * Shows simplified structure: root -> levelI -> locations (with levelIII or levelII as terminal label)
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
  const displayTree = filterByRoot
    ? { [filterByRoot]: tree[filterByRoot] || {} }
    : tree

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

  return (
    <div className={`text-sm ${className}`}>
      {Object.entries(displayTree).map(([root, levelIGroup]) => (
        <div key={root} className="mb-2">
          <div className="font-semibold text-gray-800 flex items-center">
            <span className="w-2 h-2 rounded-full bg-gray-400 mr-2" />
            {root}
          </div>
          <div className="ml-4 border-l border-gray-100 pl-3">
            {Object.entries(levelIGroup).map(([levelI, locs]) => (
              <div key={levelI} className="mb-2">
                <div className="font-semibold text-gray-700 flex items-center">
                  <span className="w-2 h-2 rounded-full bg-gray-300 mr-2" />
                  {levelI}
                </div>
                <div className="ml-4 border-l border-gray-100 pl-3 space-y-1">
                  {locs.map((loc) => {
                    const isCurrent = loc.id === currentLocationId
                    const content = renderLocation
                      ? renderLocation(loc, isCurrent)
                      : defaultRenderLocation(loc, isCurrent)

                    if (onLocationClick) {
                      return (
                        <div
                          key={loc.id}
                          onClick={() => onLocationClick(loc)}
                          className="cursor-pointer"
                        >
                          {content}
                        </div>
                      )
                    }

                    return <div key={loc.id}>{content}</div>
                  })}
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}

