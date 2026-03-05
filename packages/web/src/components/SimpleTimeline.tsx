import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { getSpecimenTypeIcon, getContainerTypeIcon, getContainerTypeName } from '../lib/icons'
import type { SubjectSummarySpecimen } from '../lib/api'

interface SimpleTimelineProps {
  specimens: SubjectSummarySpecimen[]
}

export default function SimpleTimeline({ specimens }: SimpleTimelineProps) {
  const navigate = useNavigate()
  // Track expanded state per specimen ID: true = expanded, false = collapsed, undefined = use default
  const [expandedSpecimens, setExpandedSpecimens] = useState<Map<number, boolean>>(new Map())
  if (specimens.length === 0) {
    return (
      <div className="simple-timeline text-center py-4 dashboard-stat-muted text-sm">
        No collection events
      </div>
    )
  }

  const formatContainerBreakdown = (breakdown: Record<string, number>) => {
    const entries = Object.entries(breakdown)
    if (entries.length === 0) return 'No containers'
    
    return entries
      .map(([type, count]) => {
        const name = getContainerTypeName(type)
        return `${count} ${name}${count > 1 ? 's' : ''}`
      })
      .join(', ')
  }

  // Sort specimens by collection date or created date
  const sortedSpecimens = [...specimens].sort((a, b) => {
    const dateA = a.collectionDate || a.created
    const dateB = b.collectionDate || b.created
    return new Date(dateA).getTime() - new Date(dateB).getTime()
  })

  // Group specimens by date
  const groupedByDate = sortedSpecimens.reduce((groups, specimen) => {
    const dateKey = specimen.collectionDate || specimen.created
    const dateOnly = new Date(dateKey).toDateString() // Gets date without time
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- dynamic key may be missing
    if (!groups[dateOnly]) {
      groups[dateOnly] = []
    }
    groups[dateOnly].push(specimen)
    return groups
  }, {} as Record<string, typeof sortedSpecimens>)

  const formatDateHeader = (dateString: string) => {
    const date = new Date(dateString)
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    })
  }

  const formatContainerUnits = (specimen: SubjectSummarySpecimen) => {
    if (!specimen.unitBreakdown || Object.keys(specimen.unitBreakdown).length === 0) {
      if (specimen.totalRemainingQuantity !== undefined) {
        return `${specimen.totalRemainingQuantity} remaining`
      }
      return null
    }

    return Object.entries(specimen.unitBreakdown)
      .map(([unit, quantity]) => `${quantity.toLocaleString()} ${unit}`)
      .join(', ')
  }

  const getCollectionUrl = (type: string, id?: number) => {
    if (!id) return '#'
    switch (type) {
      case 'micronix_tube':
      case 'static_well':
        return `/collections/micronix-plates/${id}`
      case 'cryovial_tube':
        return `/collections/cryovial-boxes/${id}`
      case 'paper':
        return `/collections/sheets/${id}`
      default:
        return '#'
    }
  }

  const toggleSpecimenExpanded = (specimenId: number, containerCount: number) => {
    setExpandedSpecimens(prev => {
      const next = new Map(prev)
      const currentState = isSpecimenExpanded(specimenId, containerCount)
      // Toggle to opposite state
      next.set(specimenId, !currentState)
      return next
    })
  }

  const isSpecimenExpanded = (specimenId: number, containerCount: number) => {
    // If explicitly set, use that state
    if (expandedSpecimens.has(specimenId)) {
      return expandedSpecimens.get(specimenId)!
    }
    // Default: auto-expand for ≤3 containers, collapse for >3
    return containerCount <= 3
  }

  const formatContainerSummary = (specimen: SubjectSummarySpecimen) => {
    if (!specimen.containers || specimen.containers.length === 0) {
      return 'No containers'
    }

    const containerCount = specimen.containers.length
    
    // Count unique locations
    const uniqueLocations = new Set(
      specimen.containers
        .map(c => c.locationPath || c.collectionName)
        .filter(Boolean)
    )
    const locationCount = uniqueLocations.size

    // Count containers by type
    const typeCounts: Record<string, number> = {}
    specimen.containers.forEach(c => {
      const type = c.type || 'unknown'
      typeCounts[type] = (typeCounts[type] || 0) + 1
    })

    const typeEntries = Object.entries(typeCounts)
    
    // Build summary text
    if (typeEntries.length === 1) {
      // Single container type
      const [type, count] = typeEntries[0]
      const typeName = getContainerTypeName(type)
      const plural = count > 1 ? 's' : ''
      if (locationCount > 1) {
        return `${count} ${typeName}${plural} in ${locationCount} locations`
      } else if (locationCount === 1) {
        return `${count} ${typeName}${plural}`
      } else {
        return `${count} ${typeName}${plural}`
      }
    } else {
      // Multiple container types
      const typeSummary = typeEntries
        .map(([type, count]) => {
          const typeName = getContainerTypeName(type)
          const plural = count > 1 ? 's' : ''
          return `${count} ${typeName}${plural}`
        })
        .join(', ')
      
      if (locationCount > 1) {
        return `${containerCount} containers (${typeSummary}) in ${locationCount} locations`
      } else {
        return `${containerCount} containers (${typeSummary})`
      }
    }
  }

  return (
    <div className="simple-timeline">
      <div className="space-y-3">
        {Object.entries(groupedByDate).map(([dateKey, dateSpecimens]) => {
          const displayDate = dateSpecimens[0].collectionDate || dateSpecimens[0].created
          
          return (
            <div key={dateKey} className="space-y-2">
              {/* Date header */}
              <div className="px-1.5">
                <span className="text-xs font-medium text-gray-600">
                  {dateSpecimens[0].collectionDate ? 'Collected' : 'Created'}: {formatDateHeader(displayDate)}
                </span>
              </div>
              
              {/* Specimens for this date */}
              {dateSpecimens.map((specimen) => {
                const unitsLabel = formatContainerUnits(specimen)
                
                return (
                  <div key={specimen.id} className="group relative">
                    <div className="hover:bg-gray-50 rounded-lg transition-colors p-1.5">
                      <Link
                        to={`/specimens/${specimen.id}`}
                        className="block"
                      >
                        <div className="flex items-center gap-2">
                          {/* Specimen icon */}
                          <div className="flex-shrink-0">
                            <div className="w-8 h-8 rounded-full bg-white border-2 border-blue-500 flex items-center justify-center">
                              <div className="text-blue-600">
                                {getSpecimenTypeIcon(specimen.specimenTypeName)}
                              </div>
                            </div>
                          </div>
                          
                          {/* Event content */}
                          <div className="flex-1 min-w-0 flex flex-col gap-1 pr-6">
                            {/* Top row: Type and Counts */}
                            <div className="flex items-center gap-3 flex-wrap">
                              <div className="flex items-center gap-2 min-w-0">
                                <p className="font-medium dashboard-stat-value text-sm whitespace-nowrap">
                                  {specimen.specimenTypeName}
                                </p>
                              </div>
                          
                              <div className="flex items-center text-xs dashboard-stat-muted gap-1">
                                <svg className="w-3 h-3 text-gray-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
                                </svg>
                                <span className="whitespace-nowrap">
                                  <strong className="dashboard-stat-value">{specimen.containerCount}</strong> {specimen.containerCount === 1 ? 'container' : 'containers'}
                                  {unitsLabel && (
                                    <span className="ml-1 dashboard-stat-muted">
                                      ({unitsLabel} available)
                                    </span>
                                  )}
                                </span>
                              </div>

                              {specimen.containerCount > 0 && Object.keys(specimen.containerBreakdown).length > 0 && (
                                <>
                                  <span className="text-gray-300">•</span>
                                  <div className="flex items-center text-xs dashboard-stat-muted gap-1.5">
                                    {Object.entries(specimen.containerBreakdown).map(([type, count]) => (
                                      <div key={type} className="flex items-center gap-0.5" title={getContainerTypeName(type)}>
                                        <span className="dashboard-stat-muted">{getContainerTypeIcon(type)}</span>
                                        <span className="dashboard-stat-value">{count}</span>
                                      </div>
                                    ))}
                                    <span className="dashboard-stat-muted ml-0.5 capitalize">
                                      ({formatContainerBreakdown(specimen.containerBreakdown)})
                                    </span>
                                  </div>
                                </>
                              )}
                            </div>
                          </div>

                          <svg
                            className="h-3.5 w-3.5 text-gray-400 flex-shrink-0 absolute right-1.5 top-1/2 -translate-y-1/2"
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth={2}
                              d="M9 5l7 7-7 7"
                            />
                          </svg>
                        </div>
                      </Link>

                      {/* Bottom row: Locations/Containers - Collapsible (outside Link) */}
                      {specimen.containers && specimen.containers.length > 0 && (
                        <div className="mt-1 ml-10">
                          {specimen.containers.length > 3 ? (
                            // Collapsible for >3 containers
                            <div>
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation()
                                  toggleSpecimenExpanded(specimen.id, specimen.containers?.length || 0)
                                }}
                                className="flex items-center gap-1.5 text-xs dashboard-stat-muted hover:opacity-90 transition-colors"
                                aria-expanded={isSpecimenExpanded(specimen.id, specimen.containers.length)}
                                aria-label={`${isSpecimenExpanded(specimen.id, specimen.containers.length) ? 'Collapse' : 'Expand'} container locations`}
                              >
                                <svg
                                  className={`w-3 h-3 transition-transform ${isSpecimenExpanded(specimen.id, specimen.containers.length) ? 'rotate-180' : ''}`}
                                  fill="none"
                                  stroke="currentColor"
                                  viewBox="0 0 24 24"
                                >
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                                </svg>
                                <span className="font-medium">{formatContainerSummary(specimen)}</span>
                              </button>
                              {isSpecimenExpanded(specimen.id, specimen.containers.length) && (
                                <div className="mt-1.5 flex items-center gap-2 flex-wrap">
                                  {specimen.containers.map((c, i) => {
                                    const url = getCollectionUrl(c.type, c.collectionId)
                                    // Build URL with position and/or containerId for paper containers
                                    const buildUrl = () => {
                                      if (url === '#') return url
                                      const params = new URLSearchParams()
                                      if (c.position) {
                                        params.set('position', c.position)
                                      }
                                      // For paper containers without position, use container ID as fallback
                                      // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- id may be omitted for paper
                                      if (c.type === 'paper' && !c.position && c.id !== undefined) {
                                        params.set('containerId', String(c.id))
                                      }
                                      const queryString = params.toString()
                                      return queryString ? `${url}?${queryString}` : url
                                    }
                                    
                                    return (
                                      <button
                                        key={i}
                                        type="button"
                                        onClick={(e) => {
                                          e.stopPropagation()
                                          const finalUrl = buildUrl()
                                          if (finalUrl !== '#') {
                                            navigate(finalUrl)
                                          }
                                        }}
                                        className="px-1.5 py-0.5 bg-gray-100 hover:bg-gray-200 rounded text-[10px] font-mono text-gray-600 border border-gray-100 transition-colors cursor-pointer"
                                        title={`${getContainerTypeName(c.type)} in ${c.collectionName}${c.position ? ` at ${c.position}` : ''}${c.locationPath ? ` (${c.locationPath})` : ''}`}
                                      >
                                        {c.collectionName}{c.position ? `:${c.position}` : ''}
                                        {c.locationPath && (
                                          <span className="ml-1 text-gray-400 font-sans">
                                            ({c.locationPath})
                                          </span>
                                        )}
                                      </button>
                                    )
                                  })}
                                </div>
                              )}
                            </div>
                          ) : (
                            // Always show for ≤3 containers
                            <div className="flex items-center gap-2 flex-wrap">
                              {specimen.containers.map((c, i) => {
                                const url = getCollectionUrl(c.type, c.collectionId)
                                // Build URL with position and/or containerId for paper containers
                                const buildUrl = () => {
                                  if (url === '#') return url
                                  const params = new URLSearchParams()
                                  if (c.position) {
                                    params.set('position', c.position)
                                  }
                                  // For paper containers without position, use container ID as fallback
                                  // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- id may be omitted for paper
                                  if (c.type === 'paper' && !c.position && c.id !== undefined) {
                                    params.set('containerId', String(c.id))
                                  }
                                  const queryString = params.toString()
                                  return queryString ? `${url}?${queryString}` : url
                                }
                                
                                return (
                                  <button
                                    key={i}
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation()
                                      const finalUrl = buildUrl()
                                      if (finalUrl !== '#') {
                                        navigate(finalUrl)
                                      }
                                    }}
                                    className="px-1.5 py-0.5 bg-gray-100 hover:bg-gray-200 rounded text-[10px] font-mono text-gray-600 border border-gray-100 transition-colors cursor-pointer"
                                    title={`${getContainerTypeName(c.type)} in ${c.collectionName}${c.position ? ` at ${c.position}` : ''}${c.locationPath ? ` (${c.locationPath})` : ''}`}
                                  >
                                    {c.collectionName}{c.position ? `:${c.position}` : ''}
                                    {c.locationPath && (
                                      <span className="ml-1 text-gray-400 font-sans">
                                        ({c.locationPath})
                                      </span>
                                    )}
                                  </button>
                                )
                              })}
                            </div>
                          )}
                          {specimen.containers.some(c => c.comment) && (
                            <div className="mt-1.5 text-xs dashboard-stat-muted space-y-0.5">
                              {specimen.containers.filter(c => c.comment).map((c, i) => {
                                const label = [c.collectionName, c.position].filter(Boolean).join(' ')
                                const note = c.comment!.length > 60 ? `${c.comment!.slice(0, 57)}…` : c.comment
                                return (
                                  <div key={i} title={c.comment!}>
                                    <span className="font-medium">Notes</span>{label ? ` (${label}): ` : ': '}{note}
                                  </div>
                                )
                              })}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                  )
              })}
            </div>
          )
        })}
      </div>
    </div>
  )
}
