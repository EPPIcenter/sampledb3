import { useEffect, useState, useRef, useMemo, useCallback } from 'react'
import { studiesApi, type Study, type StudySummaryBasic } from '../lib/api'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import StudyCard from '../components/StudyCard'
import StudyCardSkeleton from '../components/StudyCardSkeleton'
import { getModifierKey } from '../lib/hotkeys'
import { useUser } from '../contexts/UserContext'
import { useFocusSearchOnSlash } from '../hooks/useHotkey'
import { useDebouncedValue } from '../hooks/useDebouncedValue'
import '../styles/studies.css'

type ViewMode = 'grid' | 'list'
type SortOption = 'title' | 'date' | 'subjects' | 'specimens' | 'containers' | 'lead'
type FilterType = 'all' | 'longitudinal' | 'cross-sectional'

interface StudyWithSummary extends Study {
  summary?: StudySummaryBasic | null
  summaryLoading?: boolean
}

export default function Studies() {
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const { canWrite } = useUser()
  const [studies, setStudies] = useState<StudyWithSummary[]>([])
  const showDeletedMessage = searchParams.get('deleted') === '1'
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const [total, setTotal] = useState(0)
  const [hasMore, setHasMore] = useState(true)
  const [viewMode, setViewMode] = useState<ViewMode>(() => {
    const saved = localStorage.getItem('studies-view-mode')
    const mode = saved === 'grid' || saved === 'list' ? saved : 'grid'
    return mode
  })
  const [sortBy, setSortBy] = useState<SortOption>('date')
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc')
  const [filterType, setFilterType] = useState<FilterType>('all')
  const [filterLead, setFilterLead] = useState<string>('')
  const [summaryCache, setSummaryCache] = useState<Map<number, StudySummaryBasic>>(new Map())
  const [loadingSummaries, setLoadingSummaries] = useState<Set<number>>(new Set())
  const [allLeadPersons, setAllLeadPersons] = useState<string[]>([])
  const limit = 50
  const [clientPage, setClientPage] = useState(1)
  const observerRef = useRef<IntersectionObserver | null>(null)
  const summaryObserverRef = useRef<IntersectionObserver | null>(null)
  const cardRefs = useRef<Map<number, HTMLDivElement>>(new Map())
  const loadMoreRef = useRef<HTMLDivElement | null>(null)
  const searchInputRef = useRef<HTMLInputElement | null>(null)
  useFocusSearchOnSlash(searchInputRef)
  const debouncedSearch = useDebouncedValue(search, 350)

  // Load all unique lead persons on mount
  useEffect(() => {
    const loadAllLeadPersons = async () => {
      try {
        // Fetch all studies to get all unique lead persons
        const response = await studiesApi.list(undefined, { page: 1, limit: 10000 })
        const allStudies = response.studies || []
        const leads = new Set(allStudies.map(s => s.leadPerson).filter(Boolean))
        setAllLeadPersons(Array.from(leads).sort())
      } catch (error) {
        console.error('Failed to load lead persons:', error)
      }
    }
    loadAllLeadPersons()
  }, [])

  // Check if we have active filters (debounced search so list/API only react after user pauses typing)
  const hasActiveFilters = useMemo(() => {
    return debouncedSearch !== '' || filterType !== 'all' || filterLead !== ''
  }, [debouncedSearch, filterType, filterLead])

  const prevFiltersRef = useRef([debouncedSearch, filterType, filterLead])
  const prevFilters = prevFiltersRef.current
  if (prevFilters[0] !== debouncedSearch || prevFilters[1] !== filterType || prevFilters[2] !== filterLead) {
    prevFiltersRef.current = [debouncedSearch, filterType, filterLead]
    setPage(1)
    setClientPage(1)
    setStudies([])
    setHasMore(true)
  }

  // Load studies when filters change (state reset is done during render above)
  useEffect(() => {
    if (!hasActiveFilters) {
      loadStudies(true, debouncedSearch)
    } else {
      loadAllStudies(debouncedSearch)
    }
  }, [debouncedSearch, filterType, filterLead, hasActiveFilters])

  // Load more studies when page changes (infinite scroll)
  useEffect(() => {
    if (!hasActiveFilters && page > 1 && !loading && hasMore) {
      loadStudies(false, '')
    }
  }, [page, hasActiveFilters, loading, hasMore])

  const setViewModeAndPersist = (mode: ViewMode) => {
    setViewMode(mode)
    localStorage.setItem('studies-view-mode', mode)
  }

  const loadStudies = async (reset: boolean = false, searchTerm: string = '') => {
    try {
      if (reset) {
      setLoading(true)
      } else {
        setLoadingMore(true)
      }
      
      const response = await studiesApi.list(searchTerm || undefined, { page, limit })
      const studiesList = response.studies || []
      
      if (studiesList.length === 0) {
        setHasMore(false)
        if (reset) {
          setLoading(false)
        } else {
          setLoadingMore(false)
        }
        return
      }
      
      // Merge with cached summaries
      const studiesWithSummaries = studiesList.map(study => ({
        ...study,
        summary: summaryCache.get(study.id),
        summaryLoading: false,
      }))
      
      if (reset) {
        setStudies(studiesWithSummaries)
      } else {
        setStudies(prev => [...prev, ...studiesWithSummaries])
      }
      
      if (response.pagination) {
        setTotalPages(response.pagination.totalPages)
        setTotal(response.pagination.total)
        setHasMore(page < response.pagination.totalPages)
      } else {
        setHasMore(false)
      }
    } catch (error) {
      console.error('Failed to load studies:', error)
      setHasMore(false)
    } finally {
      if (reset) {
        setLoading(false)
      } else {
        setLoadingMore(false)
      }
    }
  }

  const loadAllStudies = async (searchTerm: string = '') => {
    try {
      setLoading(true)
      // Load all studies when filters are active (we'll paginate client-side)
      const response = await studiesApi.list(searchTerm || undefined, { page: 1, limit: 10000 })
      const studiesList = response.studies || []
      
      // Merge with cached summaries
      const studiesWithSummaries = studiesList.map(study => ({
        ...study,
        summary: summaryCache.get(study.id),
        summaryLoading: false,
      }))
      
      setStudies(studiesWithSummaries)
      // Set total to the actual count for display
      if (response.pagination) {
        setTotal(response.pagination.total)
      }
    } catch (error) {
      console.error('Failed to load studies:', error)
    } finally {
      setLoading(false)
    }
  }

  // Load summaries for visible studies
  const loadSummaries = useCallback(async (studyIds: number[]) => {
    const idsToLoad = studyIds.filter(id => 
      !summaryCache.has(id) && !loadingSummaries.has(id)
    )
    
    if (idsToLoad.length === 0) return

    // Mark as loading
    setLoadingSummaries(prev => {
      const next = new Set(prev)
      idsToLoad.forEach(id => next.add(id))
      return next
    })

    try {
      const response = await studiesApi.getSummaries(idsToLoad)
      const summaries = response.summaries || []
      
      // Update cache
      setSummaryCache(prev => {
        const next = new Map(prev)
        summaries.forEach(summary => {
          next.set(summary.studyId, summary)
        })
        return next
      })

      // Update studies with summaries
      setStudies(prev => prev.map(study => {
        const summary = summaries.find(s => s.studyId === study.id)
        if (summary) {
          return { ...study, summary, summaryLoading: false }
        }
        return study
      }))
    } catch (error) {
      console.error('Failed to load summaries:', error)
      // Mark as failed (no summary)
      setStudies(prev => prev.map(study => 
        idsToLoad.includes(study.id) 
          ? { ...study, summary: null, summaryLoading: false }
          : study
      ))
    } finally {
      setLoadingSummaries(prev => {
        const next = new Set(prev)
        idsToLoad.forEach(id => next.delete(id))
        return next
      })
    }
  }, [summaryCache, loadingSummaries])

  // Setup Intersection Observer for lazy loading summaries
  useEffect(() => {
    if (summaryObserverRef.current) {
      summaryObserverRef.current.disconnect()
    }

    summaryObserverRef.current = new IntersectionObserver(
      (entries) => {
        const visibleIds: number[] = []
        entries.forEach(entry => {
          if (entry.isIntersecting) {
            const studyId = parseInt(entry.target.getAttribute('data-study-id') || '0')
            if (studyId) visibleIds.push(studyId)
          }
        })
        
        if (visibleIds.length > 0) {
          loadSummaries(visibleIds)
        }
      },
      { rootMargin: '100px' } // Start loading 100px before card enters viewport
    )

    // Observe all card elements
    cardRefs.current.forEach((element, studyId) => {
      if (element && summaryObserverRef.current) {
        summaryObserverRef.current.observe(element)
      }
    })

    return () => {
      if (summaryObserverRef.current) {
        summaryObserverRef.current.disconnect()
      }
    }
  }, [studies, loadSummaries])

  // Setup Intersection Observer for infinite scroll
  useEffect(() => {
    if (observerRef.current) {
      observerRef.current.disconnect()
    }

    if (!hasActiveFilters && hasMore && !loading && !loadingMore) {
      observerRef.current = new IntersectionObserver(
        (entries) => {
          entries.forEach(entry => {
            if (entry.isIntersecting && hasMore && !loadingMore) {
              setPage(prev => prev + 1)
            }
          })
        },
        { rootMargin: '200px' } // Start loading 200px before reaching the bottom
      )

      if (loadMoreRef.current) {
        observerRef.current.observe(loadMoreRef.current)
      }
    }

    return () => {
      if (observerRef.current) {
        observerRef.current.disconnect()
      }
    }
  }, [hasMore, loading, loadingMore, hasActiveFilters])

  // Filter and sort studies (use debounced search so list only updates after user pauses typing)
  const filteredAndSortedStudies = useMemo(() => {
    let filtered = [...studies]

    // Apply search filter
    if (debouncedSearch) {
      const searchLower = debouncedSearch.toLowerCase()
      filtered = filtered.filter(study =>
        study.title.toLowerCase().includes(searchLower) ||
        study.shortCode.toLowerCase().includes(searchLower) ||
        study.leadPerson.toLowerCase().includes(searchLower) ||
        study.description?.toLowerCase().includes(searchLower)
      )
    }

    // Apply type filter
    if (filterType !== 'all') {
      filtered = filtered.filter(study =>
        filterType === 'longitudinal' ? study.isLongitudinal : !study.isLongitudinal
      )
    }

    // Apply lead person filter
    if (filterLead) {
      filtered = filtered.filter(study => study.leadPerson === filterLead)
    }

    // Apply sorting
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
      // Reverse if ascending
      return sortDirection === 'asc' ? -result : result
    })

    return filtered
  }, [studies, debouncedSearch, filterType, filterLead, sortBy, sortDirection])

  // For filtered results, show all (no pagination needed with infinite scroll)
  const displayStudies = useMemo(() => {
    return filteredAndSortedStudies
  }, [filteredAndSortedStudies])

  // Calculate totals for display
  const filteredTotal = filteredAndSortedStudies.length
  const displayTotal = hasActiveFilters ? filteredTotal : total

  const handleLoadSummary = useCallback((studyId: number) => {
    if (!summaryCache.has(studyId) && !loadingSummaries.has(studyId)) {
      loadSummaries([studyId])
    }
  }, [summaryCache, loadingSummaries, loadSummaries])


  return (
    <div className="studies-page min-h-screen">
      <div className="container mx-auto px-4 py-8 relative z-10">
      {showDeletedMessage && (
        <div className="mb-4 flex items-center justify-between rounded-lg border px-4 py-3 studies-reveal studies-reveal-1"
          style={{ backgroundColor: 'rgb(var(--dashboard-accent-muted))', borderColor: 'rgb(var(--dashboard-accent) / 0.4)', color: 'rgb(var(--dashboard-accent-hover))' }}
        >
          <p className="text-sm font-medium">Study deleted successfully.</p>
          <button
            type="button"
            onClick={() => setSearchParams((prev) => {
              const next = new URLSearchParams(prev)
              next.delete('deleted')
              return next
            })}
            className="font-medium hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 rounded"
            style={{ color: 'rgb(var(--dashboard-accent-hover))' }}
            aria-label="Dismiss"
          >
            Dismiss
          </button>
        </div>
      )}
      {/* Header */}
      <div className="mb-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-4">
          <div>
            <h1 className="text-3xl font-bold studies-reveal studies-reveal-1" style={{ color: 'rgb(var(--dashboard-text))' }}>Studies</h1>
            {displayTotal > 0 && (
              <p className="text-sm mt-1 studies-reveal studies-reveal-2" style={{ color: 'rgb(var(--dashboard-text-muted))' }}>
                {hasActiveFilters ? (
                  <>
                    {filteredTotal} of {total} {total === 1 ? 'study' : 'studies'}
                    {hasActiveFilters && ' (filtered)'}
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
            <Link
              to="/studies/new"
              className="px-4 py-2 text-white rounded-lg font-medium whitespace-nowrap transition-colors inline-flex items-center justify-center focus-visible:outline-2 focus-visible:outline-offset-2 studies-reveal studies-reveal-2"
              style={{ backgroundColor: 'rgb(var(--dashboard-accent))' }}
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor = 'rgb(var(--dashboard-accent-hover))'
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = 'rgb(var(--dashboard-accent))'
              }}
            >
              New Study
            </Link>
          )}
        </div>
        {!canWrite && (
          <div className="mb-4 rounded-lg border p-3 flex items-center gap-2 studies-reveal studies-reveal-3"
            style={{ backgroundColor: 'rgb(var(--dashboard-surface))', borderColor: 'rgb(var(--dashboard-border))' }}
          >
            <svg className="w-5 h-5 flex-shrink-0" style={{ color: 'rgb(var(--dashboard-accent))' }} fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <p className="text-sm font-medium" style={{ color: 'rgb(var(--dashboard-text))' }}>
              You have view-only access. Contact an administrator or member to create or modify studies.
            </p>
          </div>
        )}

        {/* Search and Filters */}
        <div className="space-y-4 studies-reveal studies-reveal-4">
          <div className="dashboard-card p-4 rounded-xl">
            {/* Search Bar */}
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
                  onChange={(e) => {
                    setSearch(e.target.value)
                  }}
                  className="form-input w-full rounded-lg border px-3 py-2 text-sm"
                  style={{ borderColor: 'rgb(var(--dashboard-border))' }}
                />
              </div>
            </div>

          {/* Filters and Controls */}
          <div className="flex flex-wrap items-center gap-3">
            {/* View Toggle */}
            <div className="flex items-center gap-1 rounded-lg p-1 border"
              style={{ backgroundColor: 'rgb(var(--dashboard-surface))', borderColor: 'rgb(var(--dashboard-border))' }}
            >
              <button
                onClick={() => setViewModeAndPersist('grid')}
                className={`px-3 py-1.5 text-sm font-medium rounded-md transition-all ${
                  viewMode === 'grid'
                    ? 'shadow-sm text-white'
                    : 'hover:border-[rgb(var(--dashboard-accent)/0.3)]'
                }`}
                style={viewMode === 'grid' ? { backgroundColor: 'rgb(var(--dashboard-accent))' } : { color: 'rgb(var(--dashboard-text-muted))' }}
                title="Grid view"
              >
                Grid
              </button>
              <button
                onClick={() => setViewModeAndPersist('list')}
                className={`px-3 py-1.5 text-sm font-medium rounded-md transition-all ${
                  viewMode === 'list'
                    ? 'shadow-sm text-white'
                    : 'hover:border-[rgb(var(--dashboard-accent)/0.3)]'
                }`}
                style={viewMode === 'list' ? { backgroundColor: 'rgb(var(--dashboard-accent))' } : { color: 'rgb(var(--dashboard-text-muted))' }}
                title="List view"
              >
                List
              </button>
            </div>

            {/* Sort */}
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
                style={{ borderColor: 'rgb(var(--dashboard-border))' }}
              >
                <option value="title">Sort by Title</option>
                <option value="date">Sort by Date</option>
                <option value="lead">Sort by Lead</option>
                <option value="subjects">Sort by Subjects</option>
                <option value="specimens">Sort by Specimens</option>
                <option value="containers">Sort by Containers</option>
              </select>
              <button
                onClick={() => setSortDirection(prev => prev === 'asc' ? 'desc' : 'asc')}
                className="px-3 py-2 border rounded-lg text-sm flex items-center gap-1.5 transition-colors focus-visible:outline-2 focus-visible:outline-offset-2"
                style={{ borderColor: 'rgb(var(--dashboard-border))' }}
                title={`Sort ${sortDirection === 'asc' ? 'Ascending' : 'Descending'}`}
              >
                {sortDirection === 'asc' ? (
                  <>
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
                    </svg>
                    <span className="sr-only">Ascending</span>
                  </>
                ) : (
                  <>
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                    <span className="sr-only">Descending</span>
                  </>
                )}
              </button>
            </div>

            {/* Type Filter */}
            <select
              value={filterType}
              onChange={(e) => {
                setFilterType(e.target.value as FilterType)
              }}
              className="form-select text-sm rounded-lg border px-3 py-2"
              style={{ borderColor: 'rgb(var(--dashboard-border))' }}
            >
              <option value="all">All Types</option>
              <option value="longitudinal">Longitudinal</option>
              <option value="cross-sectional">Cross-sectional</option>
            </select>

            {/* Lead Person Filter */}
            {allLeadPersons.length > 0 && (
              <select
                value={filterLead}
                onChange={(e) => {
                  setFilterLead(e.target.value)
                }}
                className="form-select text-sm rounded-lg border px-3 py-2"
                style={{ borderColor: 'rgb(var(--dashboard-border))' }}
              >
                <option value="">All Lead Persons</option>
                {allLeadPersons.map(lead => (
                  <option key={lead} value={lead}>{lead}</option>
                ))}
              </select>
            )}

            {/* Active Filters Indicator */}
            {(filterType !== 'all' || filterLead || search) && (
              <button
                onClick={() => {
                  setFilterType('all')
                  setFilterLead('')
                  setSearch('')
                }}
                className="px-3 py-2 text-sm underline focus-visible:outline-2 focus-visible:outline-offset-2 rounded"
                style={{ color: 'rgb(var(--dashboard-accent))' }}
              >
                Clear filters
              </button>
            )}
          </div>
          </div>
        </div>
      </div>

      {/* Content – min-height container to avoid layout jump when result count changes */}
      <div className="studies-results">
      {loading ? (
        <div className={`grid gap-4 ${
          viewMode === 'list'
            ? 'grid-cols-1'
            : 'grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4'
        }`}>
          {[...Array(8)].map((_, i) => (
            <StudyCardSkeleton key={i} />
          ))}
        </div>
      ) : filteredAndSortedStudies.length === 0 ? (
        <div className="dashboard-card text-center py-12 rounded-xl">
          <p className="text-lg font-medium" style={{ color: 'rgb(var(--dashboard-text))' }}>No studies found</p>
          {(search || filterType !== 'all' || filterLead) && (
            <p className="text-sm mt-2" style={{ color: 'rgb(var(--dashboard-text-muted))' }}>Try adjusting your filters</p>
          )}
          {canWrite && (
            <Link
              to="/studies/new"
              className="inline-block mt-4 px-4 py-2 rounded-lg font-medium text-white transition-colors focus-visible:outline-2 focus-visible:outline-offset-2"
              style={{ backgroundColor: 'rgb(var(--dashboard-accent))' }}
            >
              Create a study
            </Link>
          )}
        </div>
      ) : (
        <>
          <div className={`grid gap-4 ${
            viewMode === 'list'
              ? 'grid-cols-1'
              : 'grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4'
          }`}>
            {displayStudies.map((study) => (
              <div
                key={study.id}
                ref={(el) => {
                  if (el) {
                    cardRefs.current.set(study.id, el)
                  } else {
                    cardRefs.current.delete(study.id)
                  }
                }}
                data-study-id={study.id}
              >
                <StudyCard
                  study={study}
                  summary={study.summary}
                  loading={study.summaryLoading || loadingSummaries.has(study.id)}
                  onLoadSummary={() => handleLoadSummary(study.id)}
                  variant={viewMode}
                />
              </div>
            ))}
          </div>

          {/* Infinite scroll trigger and loading indicator */}
          {!hasActiveFilters && (
            <>
              <div ref={loadMoreRef} className="h-10" />
              {loadingMore && (
                <div className="flex justify-center items-center py-8">
                  <div className="flex items-center gap-3" style={{ color: 'rgb(var(--dashboard-text-muted))' }}>
                    <svg className="animate-spin h-5 w-5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    <span>Loading more studies...</span>
                  </div>
                </div>
              )}
              {!hasMore && studies.length > 0 && (
                <div className="text-center py-8 text-sm" style={{ color: 'rgb(var(--dashboard-text-muted))' }}>
                  No more studies to load
                </div>
              )}
            </>
          )}
        </>
      )}
      </div>
      </div>
    </div>
  )
}
