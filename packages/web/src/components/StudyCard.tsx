import { useState } from 'react'
import { Link } from 'react-router-dom'
import type { Study, StudySummaryBasic } from '../lib/api/studies';interface StudySummaryData extends StudySummaryBasic {
  averageSpecimensPerSubject?: number
  studyDurationDays?: number | null
  topSpecimenTypes?: Array<{ name: string; count: number }>
}

interface StudyCardProps {
  study: Study
  summary?: StudySummaryData | null
  loading?: boolean
  onLoadSummary?: () => void
  /** When 'list', description is always visible; when 'grid', description is in a collapsible. */
  variant?: 'grid' | 'list'
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

export default function StudyCard({ study, summary, loading, onLoadSummary, variant = 'grid' }: StudyCardProps) {
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
      className="studies-card rounded-xl flex flex-col h-full border-l-4"
      style={{ borderLeftColor: 'rgb(var(--app-accent))' }}
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
            className="flex-1 min-w-0 group studies-link"
          >
            <h3 className="text-lg font-semibold line-clamp-2 transition-colors group-hover:opacity-80" style={{ color: 'rgb(var(--app-text))' }}>
              {study.title}
            </h3>
          </Link>
          <span
            className="ml-3 px-2 py-1 text-xs font-medium rounded whitespace-nowrap flex-shrink-0"
            style={{ backgroundColor: 'rgb(var(--app-accent-muted))', color: 'rgb(var(--app-accent-hover))' }}
          >
            {study.shortCode}
          </span>
        </div>

        {/* Badges */}
        <div className="flex flex-wrap gap-2 mb-3">
          <span
            className={`px-2 py-1 text-xs font-medium rounded ${
              study.isLongitudinal
                ? 'bg-purple-100 text-purple-800'
                : 'bg-emerald-100 text-emerald-800'
            }`}
          >
            {study.isLongitudinal ? 'Longitudinal' : 'Cross-sectional'}
          </span>
          <span
            className="px-2 py-1 text-xs font-medium rounded"
            style={{ backgroundColor: 'rgb(var(--app-surface))', color: 'rgb(var(--app-text-muted))' }}
          >
            {study.leadPerson}
          </span>
        </div>
      </div>

      {/* Metrics Section */}
      <div className="px-5 pb-3 flex-1">
        {loading ? (
          <div className="space-y-3">
            <div className="h-12 rounded animate-pulse" style={{ backgroundColor: 'rgb(var(--app-border) / 0.5)' }}></div>
            <div className="h-12 rounded animate-pulse" style={{ backgroundColor: 'rgb(var(--app-border) / 0.5)' }}></div>
          </div>
        ) : summary ? (
          <div className="grid grid-cols-2 gap-3">
            <div className="flex items-center gap-2">
              <div style={{ color: 'rgb(var(--app-text-muted))' }}>
                <UsersIcon />
              </div>
              <div className="min-w-0">
                <div className="text-xs" style={{ color: 'rgb(var(--app-text-muted))' }}>Subjects</div>
                <div className="text-sm font-semibold" style={{ color: 'rgb(var(--app-text))' }}>
                  {summary.totalSubjects.toLocaleString()}
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <div style={{ color: 'rgb(var(--app-text-muted))' }}>
                <BeakerIcon />
              </div>
              <div className="min-w-0">
                <div className="text-xs" style={{ color: 'rgb(var(--app-text-muted))' }}>Specimens</div>
                <div className="text-sm font-semibold" style={{ color: 'rgb(var(--app-text))' }}>
                  {summary.totalSpecimens.toLocaleString()}
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <div style={{ color: 'rgb(var(--app-text-muted))' }}>
                <ContainerIcon />
              </div>
              <div className="min-w-0">
                <div className="text-xs" style={{ color: 'rgb(var(--app-text-muted))' }}>Containers</div>
                <div className="text-sm font-semibold" style={{ color: 'rgb(var(--app-text))' }}>
                  {summary.totalContainers.toLocaleString()}
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <div style={{ color: 'rgb(var(--app-text-muted))' }}>
                <BeakerIcon />
              </div>
              <div className="min-w-0">
                <div className="text-xs" style={{ color: 'rgb(var(--app-text-muted))' }}>Avg/Subject</div>
                <div className="text-sm font-semibold" style={{ color: 'rgb(var(--app-text))' }}>
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
          <div className="text-xs italic" style={{ color: 'rgb(var(--app-text-muted))' }}>Hover or click to load statistics</div>
        )}
      </div>

      {/* Metadata Section */}
      {(summary || study.description) && (
        <div className="px-5 py-3 border-t" style={{ borderColor: 'rgb(var(--app-border))' }}>
          {summary?.collectionDateRange && (
            <div className="flex items-start gap-2 mb-2">
              <div className="mt-0.5" style={{ color: 'rgb(var(--app-text-muted))' }}>
                <CalendarIcon />
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-xs" style={{ color: 'rgb(var(--app-text-muted))' }}>Collection Period</div>
                <div className="text-xs" style={{ color: 'rgb(var(--app-text))' }}>
                  {formatDateRange(summary.collectionDateRange)}
                </div>
                {(() => {
                  const duration = summary.studyDurationDays ?? calculateDuration(summary.collectionDateRange)
                  return duration !== null && (
                    <div className="text-xs mt-0.5" style={{ color: 'rgb(var(--app-text-muted))' }}>
                      Duration: {formatDuration(duration)}
                    </div>
                  )
                })()}
              </div>
            </div>
          )}
          
          {study.description && (
            <div className="mt-2">
              {variant === 'list' ? (
                <>
                  <div className="text-xs mb-1" style={{ color: 'rgb(var(--app-text-muted))' }}>Description</div>
                  <p className="text-xs" style={{ color: 'rgb(var(--app-text-muted))' }}>{study.description}</p>
                </>
              ) : (
                <>
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      setExpanded(!expanded)
                    }}
                    className="flex items-center gap-1 text-xs studies-link"
                  >
                    <span>Description</span>
                    <ChevronDownIcon />
                  </button>
                  {expanded && (
                    <p className="text-xs mt-1 line-clamp-3" style={{ color: 'rgb(var(--app-text-muted))' }}>{study.description}</p>
                  )}
                </>
              )}
            </div>
          )}

          {summary?.topSpecimenTypes && summary.topSpecimenTypes.length > 0 && (
            <div className="mt-2">
              <div className="text-xs mb-1" style={{ color: 'rgb(var(--app-text-muted))' }}>Top Specimen Types</div>
              <div className="flex flex-wrap gap-1">
                {summary.topSpecimenTypes.slice(0, 3).map((type, idx) => (
                  <span
                    key={idx}
                    className="px-1.5 py-0.5 text-xs rounded"
                    style={{ backgroundColor: 'rgb(var(--app-surface))', color: 'rgb(var(--app-text))' }}
                  >
                    {type.name} ({type.count})
                  </span>
                ))}
                {summary.topSpecimenTypes.length > 3 && (
                  <span className="px-1.5 py-0.5 text-xs" style={{ color: 'rgb(var(--app-text-muted))' }}>
                    +{summary.topSpecimenTypes.length - 3} more
                  </span>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Footer */}
      <div className="px-5 py-3 border-t rounded-b-xl mt-auto" style={{ borderColor: 'rgb(var(--app-border))', backgroundColor: 'rgb(var(--app-surface))' }}>
        <div className="flex items-center justify-between text-xs">
          <span style={{ color: 'rgb(var(--app-text-muted))' }}>Updated {new Date(study.lastUpdated).toLocaleDateString()}</span>
          <Link
            to={`/studies/${study.id}`}
            onClick={(e) => e.stopPropagation()}
            className="studies-link font-medium"
          >
            View Details →
          </Link>
        </div>
      </div>
    </div>
  )
}

