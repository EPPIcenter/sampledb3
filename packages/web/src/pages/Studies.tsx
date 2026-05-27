import { useEffect, useState, useRef, useMemo, useCallback } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import type { Study, StudySummaryBasic } from '../lib/api/studies'
import StudyCard from '../components/StudyCard'
import { useUser } from '../contexts/UserContext'
import { useFocusSearchOnSlash } from '../hooks/useHotkey'
import { useDebouncedValue } from '../hooks/useDebouncedValue'
import {
  useInfiniteStudies,
  useStudiesFiltered,
  useStudyLeadPersons,
  useStudySummaryCards,
} from '../hooks/useStudies'
import {
  AsyncPresentation,
  EmptyState,
  PageError,
  StudyListSkeleton,
  buttonClassName,
  fromQuery,
  getQueryErrorMessage,
} from '../ui'
import '../styles/studies.css'

type ViewMode = 'grid' | 'list'
type SortOption = 'title' | 'date' | 'subjects' | 'specimens' | 'containers' | 'lead'
type FilterType = 'all' | 'longitudinal' | 'cross-sectional'

interface StudyWithSummary extends Study {
  summary?: StudySummaryBasic | null
  summaryLoading?: boolean
}

const PAGE_LIMIT = 50

export default function Studies() {
  const [searchParams, setSearchParams] = useSearchParams()
  const { canWrite } = useUser()
  const showDeletedMessage = searchParams.get('deleted') === '1'
  const [search, setSearch] = useState('')
  const [viewMode, setViewMode] = useState<ViewMode>(() => {
    const saved = localStorage.getItem('studies-view-mode')
    return saved === 'grid' || saved === 'list' ? saved : 'grid'
  })
  const [sortBy, setSortBy] = useState<SortOption>('date')
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc')
  const [filterType, setFilterType] = useState<FilterType>('all')
  const [filterLead, setFilterLead] = useState('')
  const { prefetch: prefetchSummaries, getCardState } = useStudySummaryCards()
  const summaryObserverRef = useRef<IntersectionObserver | null>(null)
  const loadMoreRef = useRef<HTMLDivElement | null>(null)
  const cardRefs = useRef<Map<number, HTMLDivElement>>(new Map())
  const searchInputRef = useRef<HTMLInputElement | null>(null)
  useFocusSearchOnSlash(searchInputRef)
  const debouncedSearch = useDebouncedValue(search, 350)

  const hasActiveFilters = useMemo(
    () => debouncedSearch !== '' || filterType !== 'all' || filterLead !== '',
    [debouncedSearch, filterType, filterLead]
  )

  const infiniteQuery = useInfiniteStudies(PAGE_LIMIT)
  const filteredQuery = useStudiesFiltered(debouncedSearch, hasActiveFilters)
  const leadPersonsQuery = useStudyLeadPersons()

  const activeQuery = hasActiveFilters ? filteredQuery : infiniteQuery

  const baseStudies = useMemo(() => {
    if (hasActiveFilters) {
      return filteredQuery.data?.studies ?? []
    }
    return infiniteQuery.data?.pages.flatMap((page) => page.studies) ?? []
  }, [hasActiveFilters, filteredQuery.data, infiniteQuery.data])

  const studies: StudyWithSummary[] = useMemo(
    () =>
      baseStudies.map((study) => {
        const { summary, loading } = getCardState(study.id)
        return {
          ...study,
          summary,
          summaryLoading: loading,
        }
      }),
    [baseStudies, getCardState]
  )

  const total = hasActiveFilters
    ? (filteredQuery.data?.pagination?.total ?? studies.length)
    : (infiniteQuery.data?.pages[0]?.pagination?.total ?? 0)

  const listStatus = fromQuery(activeQuery, {
    isEmpty: activeQuery.isSuccess && baseStudies.length === 0,
  })

  const allLeadPersons = leadPersonsQuery.data ?? []

  useEffect(() => {
    if (summaryObserverRef.current) {
      summaryObserverRef.current.disconnect()
    }

    summaryObserverRef.current = new IntersectionObserver(
      (entries) => {
        const visibleIds: number[] = []
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            const studyId = parseInt(entry.target.getAttribute('data-study-id') || '0', 10)
            if (studyId) visibleIds.push(studyId)
          }
        })
        if (visibleIds.length > 0) {
          prefetchSummaries(visibleIds)
        }
      },
      { rootMargin: '100px' }
    )

    cardRefs.current.forEach((element) => {
      if (element && summaryObserverRef.current) {
        summaryObserverRef.current.observe(element)
      }
    })

    return () => {
      summaryObserverRef.current?.disconnect()
    }
  }, [studies, prefetchSummaries])

  useEffect(() => {
    if (hasActiveFilters || !infiniteQuery.hasNextPage) return

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (
            entry.isIntersecting &&
            infiniteQuery.hasNextPage &&
            !infiniteQuery.isFetchingNextPage
          ) {
            void infiniteQuery.fetchNextPage()
          }
        })
      },
      { rootMargin: '200px' }
    )

    if (loadMoreRef.current) {
      observer.observe(loadMoreRef.current)
    }

    return () => observer.disconnect()
  }, [
    hasActiveFilters,
    infiniteQuery.hasNextPage,
    infiniteQuery.isFetchingNextPage,
    infiniteQuery.fetchNextPage,
  ])

  const filteredAndSortedStudies = useMemo(() => {
    let filtered = [...studies]

    if (debouncedSearch) {
      const searchLower = debouncedSearch.toLowerCase()
      filtered = filtered.filter(
        (study) =>
          study.title.toLowerCase().includes(searchLower) ||
          study.shortCode.toLowerCase().includes(searchLower) ||
          study.leadPerson.toLowerCase().includes(searchLower) ||
          study.description?.toLowerCase().includes(searchLower)
      )
    }

    if (filterType !== 'all') {
      filtered = filtered.filter((study) =>
        filterType === 'longitudinal' ? study.isLongitudinal : !study.isLongitudinal
      )
    }

    if (filterLead) {
      filtered = filtered.filter((study) => study.leadPerson === filterLead)
    }

    filtered.sort((a, b) => {
      let result = 0
      switch (sortBy) {
        case 'title':
          result = a.title.localeCompare(b.title)
          break
        case 'date':
          result = new Date(b.lastUpdated).getTime() - new Date(a.lastUpdated).getTime()
          break
        case 'lead':
          result = a.leadPerson.localeCompare(b.leadPerson)
          break
        case 'subjects':
          result = (b.summary?.totalSubjects || 0) - (a.summary?.totalSubjects || 0)
          break
        case 'specimens':
          result = (b.summary?.totalSpecimens || 0) - (a.summary?.totalSpecimens || 0)
          break
        case 'containers':
          result = (b.summary?.totalContainers || 0) - (a.summary?.totalContainers || 0)
          break
        default:
          return 0
      }
      return sortDirection === 'asc' ? -result : result
    })

    return filtered
  }, [studies, debouncedSearch, filterType, filterLead, sortBy, sortDirection])

  const displayStudies = filteredAndSortedStudies
  const filteredTotal = filteredAndSortedStudies.length
  const displayTotal = hasActiveFilters ? filteredTotal : total

  const setViewModeAndPersist = (mode: ViewMode) => {
    setViewMode(mode)
    localStorage.setItem('studies-view-mode', mode)
  }

  const handleLoadSummary = useCallback(
    (studyId: number) => {
      prefetchSummaries([studyId])
    },
    [prefetchSummaries]
  )

  const handleRetryList = () => {
    void activeQuery.refetch()
  }

  const listErrorMessage = activeQuery.error
    ? getQueryErrorMessage(activeQuery.error, 'Failed to load studies')
    : 'Failed to load studies'

  const emptyAction =
    canWrite ? (
      <Link to="/studies/new" className={buttonClassName('primary')}>
        Create a study
      </Link>
    ) : undefined

  return (
    <div className="studies-page min-h-screen">
      <div className="container mx-auto px-4 py-8 relative z-10">
        {showDeletedMessage && (
          <div
            className="mb-4 flex items-center justify-between rounded-lg border px-4 py-3 studies-reveal studies-reveal-1"
            style={{
              backgroundColor: 'rgb(var(--app-accent-muted))',
              borderColor: 'rgb(var(--app-accent) / 0.4)',
              color: 'rgb(var(--app-accent-hover))',
            }}
          >
            <p className="text-sm font-medium">Study deleted successfully.</p>
            <button
              type="button"
              onClick={() =>
                setSearchParams((prev) => {
                  const next = new URLSearchParams(prev)
                  next.delete('deleted')
                  return next
                })
              }
              className="font-medium hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 rounded"
              style={{ color: 'rgb(var(--app-accent-hover))' }}
              aria-label="Dismiss"
            >
              Dismiss
            </button>
          </div>
        )}

        <div className="mb-6">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-4">
            <div>
              <h1
                className="text-3xl font-bold studies-reveal studies-reveal-1"
                style={{ color: 'rgb(var(--app-text))' }}
              >
                Studies
              </h1>
              {displayTotal > 0 && (
                <p
                  className="text-sm mt-1 studies-reveal studies-reveal-2"
                  style={{ color: 'rgb(var(--app-text-muted))' }}
                >
                  {hasActiveFilters ? (
                    <>
                      {filteredTotal} of {total} {total === 1 ? 'study' : 'studies'} (filtered)
                    </>
                  ) : (
                    <>
                      {total} {total === 1 ? 'study' : 'studies'} total
                    </>
                  )}
                </p>
              )}
            </div>
            {canWrite && (
              <Link to="/studies/new" className={buttonClassName('primary', { className: 'whitespace-nowrap studies-reveal studies-reveal-2' })}>
                New Study
              </Link>
            )}
          </div>
          {!canWrite && (
            <div
              className="mb-4 rounded-lg border p-3 flex items-center gap-2 studies-reveal studies-reveal-3"
              style={{
                backgroundColor: 'rgb(var(--app-surface))',
                borderColor: 'rgb(var(--app-border))',
              }}
            >
              <svg
                className="w-5 h-5 flex-shrink-0"
                style={{ color: 'rgb(var(--app-accent))' }}
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                />
              </svg>
              <p className="text-sm font-medium" style={{ color: 'rgb(var(--app-text))' }}>
                You have view-only access. Contact an administrator or member to create or modify
                studies.
              </p>
            </div>
          )}

          <div className="space-y-4 studies-reveal studies-reveal-4">
            <div className="dashboard-card p-4 rounded-xl">
              <div className="flex flex-col sm:flex-row gap-3 mb-4">
                <div className="flex-1">
                  <label htmlFor="studies-search" className="sr-only">
                    Search studies
                  </label>
                  <input
                    ref={searchInputRef}
                    id="studies-search"
                    type="text"
                    placeholder="Search by title, code, lead person, or description..."
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    className="form-input w-full rounded-lg border px-3 py-2 text-sm"
                    style={{ borderColor: 'rgb(var(--app-border))' }}
                  />
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-3">
                <div
                  className="flex items-center gap-1 rounded-lg p-1 border"
                  style={{
                    backgroundColor: 'rgb(var(--app-surface))',
                    borderColor: 'rgb(var(--app-border))',
                  }}
                >
                  <button
                    type="button"
                    onClick={() => setViewModeAndPersist('grid')}
                    className={`px-3 py-1.5 text-sm font-medium rounded-md transition-all ${
                      viewMode === 'grid' ? 'shadow-sm text-white' : ''
                    }`}
                    style={
                      viewMode === 'grid'
                        ? { backgroundColor: 'rgb(var(--app-accent))' }
                        : { color: 'rgb(var(--app-text-muted))' }
                    }
                    title="Grid view"
                  >
                    Grid
                  </button>
                  <button
                    type="button"
                    onClick={() => setViewModeAndPersist('list')}
                    className={`px-3 py-1.5 text-sm font-medium rounded-md transition-all ${
                      viewMode === 'list' ? 'shadow-sm text-white' : ''
                    }`}
                    style={
                      viewMode === 'list'
                        ? { backgroundColor: 'rgb(var(--app-accent))' }
                        : { color: 'rgb(var(--app-text-muted))' }
                    }
                    title="List view"
                  >
                    List
                  </button>
                </div>

                <div className="flex items-center gap-2">
                  <select
                    value={sortBy}
                    onChange={(e) => {
                      const newSort = e.target.value as SortOption
                      setSortBy(newSort)
                      if (newSort === 'date') {
                        setSortDirection('desc')
                      } else if (newSort === 'title' || newSort === 'lead') {
                        setSortDirection('asc')
                      } else {
                        setSortDirection('desc')
                      }
                    }}
                    className="form-select text-sm rounded-lg border px-3 py-2"
                    style={{ borderColor: 'rgb(var(--app-border))' }}
                  >
                    <option value="title">Sort by Title</option>
                    <option value="date">Sort by Date</option>
                    <option value="lead">Sort by Lead</option>
                    <option value="subjects">Sort by Subjects</option>
                    <option value="specimens">Sort by Specimens</option>
                    <option value="containers">Sort by Containers</option>
                  </select>
                  <button
                    type="button"
                    onClick={() => setSortDirection((prev) => (prev === 'asc' ? 'desc' : 'asc'))}
                    className="px-3 py-2 border rounded-lg text-sm flex items-center gap-1.5 transition-colors focus-visible:outline-2 focus-visible:outline-offset-2"
                    style={{ borderColor: 'rgb(var(--app-border))' }}
                    title={`Sort ${sortDirection === 'asc' ? 'Ascending' : 'Descending'}`}
                  >
                    {sortDirection === 'asc' ? (
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
                      </svg>
                    ) : (
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                      </svg>
                    )}
                    <span className="sr-only">{sortDirection === 'asc' ? 'Ascending' : 'Descending'}</span>
                  </button>
                </div>

                <select
                  value={filterType}
                  onChange={(e) => setFilterType(e.target.value as FilterType)}
                  className="form-select text-sm rounded-lg border px-3 py-2"
                  style={{ borderColor: 'rgb(var(--app-border))' }}
                >
                  <option value="all">All Types</option>
                  <option value="longitudinal">Longitudinal</option>
                  <option value="cross-sectional">Cross-sectional</option>
                </select>

                {allLeadPersons.length > 0 && (
                  <select
                    value={filterLead}
                    onChange={(e) => setFilterLead(e.target.value)}
                    className="form-select text-sm rounded-lg border px-3 py-2"
                    style={{ borderColor: 'rgb(var(--app-border))' }}
                  >
                    <option value="">All Lead Persons</option>
                    {allLeadPersons.map((lead) => (
                      <option key={lead} value={lead}>
                        {lead}
                      </option>
                    ))}
                  </select>
                )}

                {(filterType !== 'all' || filterLead || search) && (
                  <button
                    type="button"
                    onClick={() => {
                      setFilterType('all')
                      setFilterLead('')
                      setSearch('')
                    }}
                    className="px-3 py-2 text-sm underline focus-visible:outline-2 focus-visible:outline-offset-2 rounded"
                    style={{ color: 'rgb(var(--app-accent))' }}
                  >
                    Clear filters
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>

        <div className="studies-results">
          <AsyncPresentation
            status={listStatus}
            loadingFallback={<StudyListSkeleton viewMode={viewMode} />}
            errorFallback={
              <PageError message={listErrorMessage} onRetry={handleRetryList} />
            }
            emptyFallback={
              <EmptyState
                title="No studies found"
                description={
                  search || filterType !== 'all' || filterLead
                    ? 'Try adjusting your filters'
                    : undefined
                }
                action={emptyAction}
              />
            }
          >
            <>
              <div
                className={`grid gap-4 ${
                  viewMode === 'list'
                    ? 'grid-cols-1'
                    : 'grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4'
                }`}
              >
                {displayStudies.map((study) => (
                  <div
                    key={study.id}
                    ref={(el) => {
                      if (el) cardRefs.current.set(study.id, el)
                      else cardRefs.current.delete(study.id)
                    }}
                    data-study-id={study.id}
                  >
                    <StudyCard
                      study={study}
                      summary={study.summary}
                      loading={study.summaryLoading}
                      onLoadSummary={() => handleLoadSummary(study.id)}
                      variant={viewMode}
                    />
                  </div>
                ))}
              </div>

              {!hasActiveFilters && (
                <>
                  <div ref={loadMoreRef} className="h-10" />
                  {infiniteQuery.isFetchingNextPage && (
                    <div className="flex justify-center items-center py-8">
                      <div
                        className="flex items-center gap-3"
                        style={{ color: 'rgb(var(--app-text-muted))' }}
                      >
                        <svg
                          className="animate-spin h-5 w-5"
                          xmlns="http://www.w3.org/2000/svg"
                          fill="none"
                          viewBox="0 0 24 24"
                        >
                          <circle
                            className="opacity-25"
                            cx="12"
                            cy="12"
                            r="10"
                            stroke="currentColor"
                            strokeWidth="4"
                          />
                          <path
                            className="opacity-75"
                            fill="currentColor"
                            d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                          />
                        </svg>
                        <span>Loading more studies...</span>
                      </div>
                    </div>
                  )}
                  {!infiniteQuery.hasNextPage && studies.length > 0 && (
                    <div
                      className="text-center py-8 text-sm"
                      style={{ color: 'rgb(var(--app-text-muted))' }}
                    >
                      No more studies to load
                    </div>
                  )}
                </>
              )}
            </>
          </AsyncPresentation>
        </div>
      </div>
    </div>
  )
}
