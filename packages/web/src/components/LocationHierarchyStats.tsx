import { Link } from 'react-router-dom'
import { type LocationHierarchyStats } from '../lib/api'
import LocationCapabilityBadge from './LocationCapabilityBadge'

interface LocationHierarchyStatsProps {
  stats: LocationHierarchyStats
  locationName: string
  canContainCollections: boolean
  className?: string
}

/**
 * Component displaying hierarchy statistics for a location
 */
export default function LocationHierarchyStatsDisplay({
  stats,
  locationName,
  canContainCollections,
  className = '',
}: LocationHierarchyStatsProps) {
  const directTotal =
    stats.directContainers.micronix +
    stats.directContainers.cryovial +
    stats.directContainers.boxes +
    stats.directContainers.bags

  const aggregatedTotal =
    stats.aggregatedContainers.micronix +
    stats.aggregatedContainers.cryovial +
    stats.aggregatedContainers.boxes +
    stats.aggregatedContainers.bags

  return (
    <div className={`space-y-4 ${className}`}>
      {/* Hierarchy Overview */}
      <div className="bg-app-card rounded-lg shadow p-4">
        <h3 className="text-sm font-semibold text-app-text mb-3">Hierarchy Overview</h3>
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs text-app-text-muted mb-1">Child Locations</p>
            <p className="text-lg font-semibold text-app-accent">{stats.totalDescendants}</p>
            <p className="text-xs text-app-text-muted mt-0.5">
              {stats.totalDescendants === 0 
                ? 'No child locations' 
                : `${stats.totalDescendants} location${stats.totalDescendants !== 1 ? 's' : ''} below this`}
            </p>
          </div>
          <div className="flex items-center">
            <LocationCapabilityBadge canContainCollections={canContainCollections} size="md" />
          </div>
        </div>
      </div>

      {/* Container Statistics */}
      <div className="bg-app-card rounded-lg shadow p-4">
        <h3 className="text-sm font-semibold text-app-text mb-3">Container Statistics</h3>
        <div className="space-y-3">
          {/* Direct vs Aggregated Summary */}
          <div className="grid grid-cols-2 gap-4 pb-3 border-b border-app-border">
            <div>
              <p className="text-xs text-app-text-muted mb-1">Direct Contents</p>
              <p className="text-2xl font-bold text-app-text">{directTotal.toLocaleString()}</p>
              <p className="text-xs text-app-text-muted mt-0.5">In this location only</p>
            </div>
            <div>
              <p className="text-xs text-app-text-muted mb-1">Aggregated Total</p>
              <p className="text-2xl font-bold text-app-accent">{aggregatedTotal.toLocaleString()}</p>
              <p className="text-xs text-app-text-muted mt-0.5">Including all descendants</p>
            </div>
          </div>

          {/* Container Type Breakdown - Only show if there are containers */}
          {(directTotal > 0 || aggregatedTotal > 0) && (
            <div>
              <p className="text-xs font-medium text-app-text mb-2">Container Type Breakdown</p>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                {(stats.directContainers.micronix > 0 || stats.aggregatedContainers.micronix > 0) && (
                  <div className={`rounded p-2 ${directTotal > 0 ? 'bg-app-accent-muted' : 'bg-app-accent-muted border border-app-accent/50'}`}>
                    <p className="text-xs text-app-text-muted">Micronix Plates</p>
                    <p className="text-sm font-semibold text-app-accent-hover">
                      {stats.directContainers.micronix}
                      {aggregatedTotal > directTotal && stats.aggregatedContainers.micronix > stats.directContainers.micronix && (
                        <span className="text-xs text-blue-500 ml-1">
                          ({stats.aggregatedContainers.micronix} total)
                        </span>
                      )}
                    </p>
                  </div>
                )}
                {(stats.directContainers.cryovial > 0 || stats.aggregatedContainers.cryovial > 0) && (
                  <div className={`rounded p-2 ${directTotal > 0 ? 'bg-purple-50' : 'bg-purple-50 border border-purple-200'}`}>
                    <p className="text-xs text-app-text-muted">Cryovial Boxes</p>
                    <p className="text-sm font-semibold text-purple-700">
                      {stats.directContainers.cryovial}
                      {aggregatedTotal > directTotal && stats.aggregatedContainers.cryovial > stats.directContainers.cryovial && (
                        <span className="text-xs text-purple-500 ml-1">
                          ({stats.aggregatedContainers.cryovial} total)
                        </span>
                      )}
                    </p>
                  </div>
                )}
                {(stats.directContainers.boxes > 0 || stats.aggregatedContainers.boxes > 0) && (
                  <div className={`rounded p-2 ${directTotal > 0 ? 'bg-app-trend-up/10' : 'bg-app-trend-up/10 border border-app-trend-up/30'}`}>
                    <p className="text-xs text-app-text-muted">Boxes</p>
                    <p className="text-sm font-semibold text-app-trend-up">
                      {stats.directContainers.boxes}
                      {aggregatedTotal > directTotal && stats.aggregatedContainers.boxes > stats.directContainers.boxes && (
                        <span className="text-xs text-green-500 ml-1">
                          ({stats.aggregatedContainers.boxes} total)
                        </span>
                      )}
                    </p>
                  </div>
                )}
                {(stats.directContainers.bags > 0 || stats.aggregatedContainers.bags > 0) && (
                  <div className={`rounded p-2 ${directTotal > 0 ? 'bg-orange-50' : 'bg-orange-50 border border-orange-200'}`}>
                    <p className="text-xs text-app-text-muted">Bags</p>
                    <p className="text-sm font-semibold text-orange-700">
                      {stats.directContainers.bags}
                      {aggregatedTotal > directTotal && stats.aggregatedContainers.bags > stats.directContainers.bags && (
                        <span className="text-xs text-orange-500 ml-1">
                          ({stats.aggregatedContainers.bags} total)
                        </span>
                      )}
                    </p>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Child Location Statistics */}
      {stats.childLocationStats.length > 0 && (
        <div className="bg-app-card rounded-lg shadow p-4">
          <h3 className="text-sm font-semibold text-app-text mb-3">Child Location Summary</h3>
          <p className="text-xs text-app-text-muted mb-3">
            Container counts include all descendants of each child location
          </p>
          <div className="space-y-2">
            {stats.childLocationStats.map((child) => {
              const childTotal =
                child.containerCounts.micronix +
                child.containerCounts.cryovial +
                child.containerCounts.boxes +
                child.containerCounts.bags

              return (
                <Link
                  key={child.locationId}
                  to={`/locations/${child.locationId}`}
                  className="flex items-center justify-between p-3 rounded border border-app-border hover:bg-app-surface hover:border-app-accent/50 transition-colors cursor-pointer"
                >
                  <div className="flex items-center gap-2 flex-1 min-w-0">
                    <span className="text-sm font-medium text-app-text truncate">{child.locationName}</span>
                    {child.canContainCollections && (
                      <LocationCapabilityBadge canContainCollections={true} size="sm" />
                    )}
                  </div>
                  <div className="flex items-center gap-4 ml-4">
                    <span className="text-base font-semibold text-app-text">{childTotal.toLocaleString()}</span>
                    {childTotal > 0 && (
                      <div className="flex items-center gap-2 text-xs text-app-text-muted">
                        {child.containerCounts.micronix > 0 && (
                          <span className="text-app-accent-hover">
                            {child.containerCounts.micronix} plate{child.containerCounts.micronix !== 1 ? 's' : ''}
                          </span>
                        )}
                        {child.containerCounts.cryovial > 0 && (
                          <span className="text-purple-700">
                            {child.containerCounts.cryovial} cryovial box{child.containerCounts.cryovial !== 1 ? 'es' : ''}
                          </span>
                        )}
                        {child.containerCounts.boxes > 0 && (
                          <span className="text-app-trend-up">
                            {child.containerCounts.boxes} box{child.containerCounts.boxes !== 1 ? 'es' : ''}
                          </span>
                        )}
                        {child.containerCounts.bags > 0 && (
                          <span className="text-orange-700">
                            {child.containerCounts.bags} bag{child.containerCounts.bags !== 1 ? 's' : ''}
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                </Link>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}

