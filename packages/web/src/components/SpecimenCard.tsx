import { Link } from 'react-router-dom'
import { getSpecimenTypeIcon, getContainerTypeIcon, getContainerTypeName } from '../lib/icons'
import type { SubjectSummarySpecimen } from '../lib/api'

interface SpecimenCardProps {
  specimen: SubjectSummarySpecimen
}

export default function SpecimenCard({ specimen }: SpecimenCardProps) {
  const formatDate = (dateString?: string) => {
    if (!dateString) return null
    return new Date(dateString).toLocaleDateString()
  }

  const formatContainerBreakdown = () => {
    const entries = Object.entries(specimen.containerBreakdown)
    if (entries.length === 0) return 'No containers'
    
    return entries
      .map(([type, count]) => {
        const name = getContainerTypeName(type)
        return `${count} ${name}${count > 1 ? 's' : ''}`
      })
      .join(', ')
  }

  return (
    <Link
      to={`/specimens/${specimen.id}`}
      className="block p-4 border border-gray-100 rounded-lg hover:bg-gray-50 transition-colors"
    >
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <div className="flex items-center space-x-3 mb-2">
            <div className="text-blue-600 flex-shrink-0">
              {getSpecimenTypeIcon(specimen.specimenTypeName)}
            </div>
            <div>
              <p className="font-medium text-gray-900">
                {specimen.specimenTypeName} Specimen #{specimen.id}
              </p>
              {specimen.collectionDate && (
                <p className="text-sm text-gray-500 mt-1">
                  Collected: {formatDate(specimen.collectionDate)}
                </p>
              )}
            </div>
          </div>

          <div className="mt-3 space-y-2">
            <div className="flex items-center text-sm text-gray-600">
              <svg className="w-4 h-4 mr-2 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
              </svg>
              <span>
                <strong>{specimen.containerCount}</strong> {specimen.containerCount === 1 ? 'container' : 'containers'}
              </span>
            </div>

            {specimen.containerCount > 0 && (
              <div className="flex items-center text-sm text-gray-600">
                <svg className="w-4 h-4 mr-2 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
                </svg>
                <div className="flex items-center space-x-2">
                  {Object.entries(specimen.containerBreakdown).map(([type, count]) => (
                    <div key={type} className="flex items-center space-x-1" title={getContainerTypeName(type)}>
                      <span className="text-gray-500">{getContainerTypeIcon(type)}</span>
                      <span className="text-xs text-gray-500">{count}</span>
                    </div>
                  ))}
                  <span className="text-gray-500 ml-1">({formatContainerBreakdown()})</span>
                </div>
              </div>
            )}
            {specimen.containers?.some(c => c.comment) && (
              <div className="flex items-center text-xs text-gray-500 mt-1">
                <svg className="w-3.5 h-3.5 mr-1.5 text-gray-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 8h10M7 12h4m1 8l-4-4H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-3l-4 4z" />
                </svg>
                <span>Has notes</span>
              </div>
            )}
          </div>
        </div>
        <svg
          className="h-5 w-5 text-gray-400 flex-shrink-0 ml-4"
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
  )
}

