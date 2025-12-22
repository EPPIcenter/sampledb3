import { Link, useNavigate } from 'react-router-dom'
import { getSpecimenTypeIcon, getContainerTypeIcon, getContainerTypeName } from '../lib/icons'
import type { SubjectSummarySpecimen } from '../lib/api'

interface SimpleTimelineProps {
  specimens: SubjectSummarySpecimen[]
}

export default function SimpleTimeline({ specimens }: SimpleTimelineProps) {
  const navigate = useNavigate()
  if (specimens.length === 0) {
    return (
      <div className="text-center py-4 text-gray-500 text-sm">
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

  const getManifestUrl = (type: string, id?: number) => {
    if (!id) return '#'
    switch (type) {
      case 'micronix_tube':
      case 'static_well':
        return `/collections/micronix-plates/${id}`
      case 'cryovial_tube':
        return `/collections/cryovial-boxes/${id}`
      case 'tube':
        return `/collections/boxes/${id}`
      case 'paper':
        return `/collections/sheets/${id}`
      default:
        return '#'
    }
  }

  return (
    <div>
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
                    <Link
                      to={`/specimens/${specimen.id}`}
                      className="block hover:bg-gray-50 rounded-lg transition-colors p-1.5"
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
                              <p className="font-medium text-gray-900 text-sm whitespace-nowrap">
                                {specimen.specimenTypeName}
                              </p>
                            </div>
                        
                            <div className="flex items-center text-xs text-gray-600 gap-1">
                              <svg className="w-3 h-3 text-gray-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
                              </svg>
                              <span className="whitespace-nowrap">
                                <strong>{specimen.aliquotCount}</strong> {specimen.aliquotCount === 1 ? 'container' : 'containers'}
                                {unitsLabel && (
                                  <span className="ml-1 text-gray-500">
                                    ({unitsLabel} available)
                                  </span>
                                )}
                              </span>
                            </div>

                            {specimen.aliquotCount > 0 && specimen.containerBreakdown && Object.keys(specimen.containerBreakdown).length > 0 && (
                              <>
                                <span className="text-gray-300">•</span>
                                <div className="flex items-center text-xs text-gray-600 gap-1.5">
                                  {Object.entries(specimen.containerBreakdown).map(([type, count]) => (
                                    <div key={type} className="flex items-center gap-0.5" title={getContainerTypeName(type)}>
                                      <span className="text-gray-500">{getContainerTypeIcon(type)}</span>
                                      <span className="text-gray-500">{count}</span>
                                    </div>
                                  ))}
                                  <span className="text-gray-500 ml-0.5 capitalize">
                                    ({formatContainerBreakdown(specimen.containerBreakdown)})
                                  </span>
                                </div>
                              </>
                            )}
                          </div>

                          {/* Bottom row: Locations/Containers */}
                          {specimen.containers && specimen.containers.length > 0 && (
                            <div className="flex items-center gap-2 flex-wrap">
                              {specimen.containers.map((c, i) => (
                                <button
                                  key={i}
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation()
                                    const url = getManifestUrl(c.type, c.manifestId)
                                    if (url !== '#') {
                                      navigate(url)
                                    }
                                  }}
                                  className="px-1.5 py-0.5 bg-gray-100 hover:bg-gray-200 rounded text-[10px] font-mono text-gray-600 border border-gray-100 transition-colors cursor-pointer"
                                  title={`${getContainerTypeName(c.type)} in ${c.manifestName}${c.position ? ` at ${c.position}` : ''}${c.locationPath ? ` (${c.locationPath})` : ''}`}
                                >
                                  {c.manifestName}{c.position ? `:${c.position}` : ''}
                                  {c.locationPath && (
                                    <span className="ml-1 text-gray-400 font-sans">
                                      ({c.locationPath})
                                    </span>
                                  )}
                                </button>
                              ))}
                            </div>
                          )}
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
