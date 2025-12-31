import { useState } from 'react'
import { Link } from 'react-router-dom'
import type { Study, StudySummaryBasic } from '../lib/api'

interface StudySummaryData extends StudySummaryBasic {
  averageSpecimensPerSubject?: number
  studyDurationDays?: number | null
  topSpecimenTypes?: Array<{ name: string; count: number }>
}

interface StudyCardProps {
  study: Study
  summary?: StudySummaryData | null
  loading?: boolean
  onLoadSummary?: () => void
}

// Calculate study duration from date range
const calculateDuration = (range: { earliest: string; latest: string } | null): number | null => {
  if (!range) return null
  const start = new Date(range.earliest)
  const end = new Date(range.latest)
  const diffTime = Math.abs(end.getTime() - start.getTime())
  return Math.ceil(diffTime / (1000 * 60 * 60 * 24))
}

// Simple icon components
const UsersIcon = () => (
  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
  </svg>
)

const BeakerIcon = () => (
  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z" />
  </svg>
)

const ContainerIcon = () => (
  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
  </svg>
)

const CalendarIcon = () => (
  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
  </svg>
)

const ChevronDownIcon = () => (
  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
  </svg>
)

export default function StudyCard({ study, summary, loading, onLoadSummary }: StudyCardProps) {
  const [expanded, setExpanded] = useState(false)

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', { 
      month: 'short', 
      day: 'numeric', 
      year: 'numeric' 
    })
  }

  const formatDateRange = (range: { earliest: string; latest: string } | null) => {
    if (!range) return null
    return `${formatDate(range.earliest)} - ${formatDate(range.latest)}`
  }

  const formatDuration = (days: number | null) => {
    if (days === null) return null
    if (days < 30) return `${days} day${days !== 1 ? 's' : ''}`
    if (days < 365) return `${Math.floor(days / 30)} month${Math.floor(days / 30) !== 1 ? 's' : ''}`
    return `${(days / 365).toFixed(1)} year${(days / 365) !== 1 ? 's' : ''}`
  }

  return (
    <div 
      className="bg-white rounded-lg shadow-sm border border-gray-100 hover:shadow-md transition-all duration-200 flex flex-col h-full"
      onClick={() => {
        if (!expanded && onLoadSummary && !summary && !loading) {
          onLoadSummary()
        }
      }}
    >
      {/* Header Section */}
      <div className="p-5 pb-3">
        <div className="flex items-start justify-between mb-3">
          <Link
            to={`/studies/${study.id}`}
            onClick={(e) => e.stopPropagation()}
            className="flex-1 min-w-0 group"
          >
            <h3 className="text-lg font-semibold text-gray-900 group-hover:text-blue-600 transition-colors line-clamp-2">
              {study.title}
            </h3>
          </Link>
          <span className="ml-3 px-2 py-1 text-xs font-medium bg-blue-100 text-blue-800 rounded whitespace-nowrap flex-shrink-0">
            {study.shortCode}
          </span>
        </div>

        {/* Badges */}
        <div className="flex flex-wrap gap-2 mb-3">
          <span
            className={`px-2 py-1 text-xs font-medium rounded ${
              study.isLongitudinal
                ? 'bg-purple-100 text-purple-800'
                : 'bg-green-100 text-green-800'
            }`}
          >
            {study.isLongitudinal ? 'Longitudinal' : 'Cross-sectional'}
          </span>
          <span className="px-2 py-1 text-xs font-medium bg-gray-100 text-gray-700 rounded">
            {study.leadPerson}
          </span>
        </div>
      </div>

      {/* Metrics Section */}
      <div className="px-5 pb-3 flex-1">
        {loading ? (
          <div className="space-y-3">
            <div className="h-12 bg-gray-100 rounded animate-pulse"></div>
            <div className="h-12 bg-gray-100 rounded animate-pulse"></div>
          </div>
        ) : summary ? (
          <div className="grid grid-cols-2 gap-3">
            <div className="flex items-center gap-2">
              <div className="text-gray-500">
                <UsersIcon />
              </div>
              <div className="min-w-0">
                <div className="text-xs text-gray-500">Subjects</div>
                <div className="text-sm font-semibold text-gray-900">
                  {summary.totalSubjects.toLocaleString()}
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <div className="text-gray-500">
                <BeakerIcon />
              </div>
              <div className="min-w-0">
                <div className="text-xs text-gray-500">Specimens</div>
                <div className="text-sm font-semibold text-gray-900">
                  {summary.totalSpecimens.toLocaleString()}
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <div className="text-gray-500">
                <ContainerIcon />
              </div>
              <div className="min-w-0">
                <div className="text-xs text-gray-500">Containers</div>
                <div className="text-sm font-semibold text-gray-900">
                  {summary.totalContainers.toLocaleString()}
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <div className="text-gray-500">
                <BeakerIcon />
              </div>
              <div className="min-w-0">
                <div className="text-xs text-gray-500">Avg/Subject</div>
                <div className="text-sm font-semibold text-gray-900">
                  {summary.averageSpecimensPerSubject !== undefined
                    ? summary.averageSpecimensPerSubject.toFixed(1)
                    : summary.totalSubjects > 0
                    ? (summary.totalSpecimens / summary.totalSubjects).toFixed(1)
                    : '0.0'}
                </div>
              </div>
            </div>
          </div>
        ) : (
          <div className="text-xs text-gray-400 italic">Hover or click to load statistics</div>
        )}
      </div>

      {/* Metadata Section */}
      {(summary || study.description) && (
        <div className="px-5 py-3 border-t border-gray-100">
          {summary?.collectionDateRange && (
            <div className="flex items-start gap-2 mb-2">
              <div className="text-gray-400 mt-0.5">
                <CalendarIcon />
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-xs text-gray-500">Collection Period</div>
                <div className="text-xs text-gray-700">
                  {formatDateRange(summary.collectionDateRange)}
                </div>
                {(() => {
                  const duration = summary.studyDurationDays ?? calculateDuration(summary.collectionDateRange)
                  return duration !== null && (
                    <div className="text-xs text-gray-500 mt-0.5">
                      Duration: {formatDuration(duration)}
                    </div>
                  )
                })()}
              </div>
            </div>
          )}
          
          {study.description && (
            <div className="mt-2">
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  setExpanded(!expanded)
                }}
                className="flex items-center gap-1 text-xs text-gray-500 hover:text-gray-700"
              >
                <span>Description</span>
                <ChevronDownIcon />
              </button>
              {expanded && (
                <p className="text-xs text-gray-600 mt-1 line-clamp-3">{study.description}</p>
              )}
            </div>
          )}

          {summary?.topSpecimenTypes && summary.topSpecimenTypes.length > 0 && (
            <div className="mt-2">
              <div className="text-xs text-gray-500 mb-1">Top Specimen Types</div>
              <div className="flex flex-wrap gap-1">
                {summary.topSpecimenTypes.slice(0, 3).map((type, idx) => (
                  <span
                    key={idx}
                    className="px-1.5 py-0.5 text-xs bg-gray-100 text-gray-700 rounded"
                  >
                    {type.name} ({type.count})
                  </span>
                ))}
                {summary.topSpecimenTypes.length > 3 && (
                  <span className="px-1.5 py-0.5 text-xs text-gray-500">
                    +{summary.topSpecimenTypes.length - 3} more
                  </span>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Footer */}
      <div className="px-5 py-3 border-t border-gray-100 bg-gray-50 rounded-b-lg">
        <div className="flex items-center justify-between text-xs text-gray-500">
          <span>Updated {new Date(study.lastUpdated).toLocaleDateString()}</span>
          <Link
            to={`/studies/${study.id}`}
            onClick={(e) => e.stopPropagation()}
            className="text-blue-600 hover:text-blue-700 font-medium"
          >
            View Details →
          </Link>
        </div>
      </div>
    </div>
  )
}

