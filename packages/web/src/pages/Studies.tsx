import { useEffect, useState, useRef, useMemo, useCallback } from 'react'
import { studiesApi, type Study, type StudySummaryBasic } from '../lib/api'
import { Link, useNavigate } from 'react-router-dom'
import StudyCard from '../components/StudyCard'
import StudyCardSkeleton from '../components/StudyCardSkeleton'
import { getModifierKey } from '../lib/hotkeys'

type ViewMode = 'grid' | 'list' | 'compact'
type SortOption = 'title' | 'date' | 'subjects' | 'specimens' | 'containers' | 'lead'
type FilterType = 'all' | 'longitudinal' | 'cross-sectional'

interface StudyWithSummary extends Study {
  summary?: StudySummaryBasic | null
  summaryLoading?: boolean
}

export default function Studies() {
  const navigate = useNavigate()
  const [studies, setStudies] = useState<StudyWithSummary[]>([])
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const [total, setTotal] = useState(0)
  const [hasMore, setHasMore] = useState(true)
  const [viewMode, setViewMode] = useState<ViewMode>(() => {
    const saved = localStorage.getItem('studies-view-mode')
    return (saved as ViewMode) || 'grid'
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

  // Check if we have active filters (client-side filtering)
  const hasActiveFilters = useMemo(() => {
    return search !== '' || filterType !== 'all' || filterLead !== ''
  }, [search, filterType, filterLead])

  // Load studies list - reset and load first page when filters change
  useEffect(() => {
    setPage(1)
    setClientPage(1)
    setStudies([])
    setHasMore(true)
    if (!hasActiveFilters) {
      loadStudies(true)
    } else {
      // When filters are active, load all studies for client-side filtering
      loadAllStudies()
    }
  }, [search, filterType, filterLead, hasActiveFilters])

  // Load more studies when page changes (infinite scroll)
  useEffect(() => {
    if (!hasActiveFilters && page > 1 && !loading && hasMore) {
      loadStudies(false)
    }
  }, [page, hasActiveFilters, loading, hasMore])

  // Save view mode preference
  useEffect(() => {
    localStorage.setItem('studies-view-mode', viewMode)
  }, [viewMode])

  const loadStudies = async (reset: boolean = false) => {
    try {
      if (reset) {
      setLoading(true)
      } else {
        setLoadingMore(true)
      }
      
      const response = await studiesApi.list(search || undefined, { page, limit })
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

  const loadAllStudies = async () => {
    try {
      setLoading(true)
      // Load all studies when filters are active (we'll paginate client-side)
      const response = await studiesApi.list(search || undefined, { page: 1, limit: 10000 })
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

  // Filter and sort studies
  const filteredAndSortedStudies = useMemo(() => {
    let filtered = [...studies]

    // Apply search filter
    if (search) {
      const searchLower = search.toLowerCase()
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
  }, [studies, search, filterType, filterLead, sortBy, sortDirection])

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
    <div className="container mx-auto px-4 py-8">
      {/* Header */}
      <div className="mb-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-4">
          <div>
        <h1 className="text-3xl font-bold text-gray-900">Studies</h1>
            {displayTotal > 0 && (
              <p className="text-sm text-gray-500 mt-1">
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
          <Link
            to="/studies/new"
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium whitespace-nowrap transition-colors inline-flex items-center justify-center"
          >
            New Study
          </Link>
        </div>

        {/* Search and Filters */}
        <div className="space-y-4">
          {/* Search Bar */}
          <div className="flex flex-col sm:flex-row gap-3">
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
                className="form-input"
              />
            </div>
          </div>

          {/* Filters and Controls */}
          <div className="flex flex-wrap items-center gap-3">
            {/* View Toggle */}
            <div className="flex items-center gap-1 bg-gray-100 rounded-lg p-1">
              <button
                onClick={() => setViewMode('grid')}
                className={`px-3 py-1.5 text-sm font-medium rounded transition-colors ${
                  viewMode === 'grid'
                    ? 'bg-white text-gray-900 shadow-sm'
                    : 'text-gray-600 hover:text-gray-900'
                }`}
                title="Grid view"
              >
                Grid
              </button>
              <button
                onClick={() => setViewMode('list')}
                className={`px-3 py-1.5 text-sm font-medium rounded transition-colors ${
                  viewMode === 'list'
                    ? 'bg-white text-gray-900 shadow-sm'
                    : 'text-gray-600 hover:text-gray-900'
                }`}
                title="List view"
              >
                List
              </button>
              <button
                onClick={() => setViewMode('compact')}
                className={`px-3 py-1.5 text-sm font-medium rounded transition-colors ${
                  viewMode === 'compact'
                    ? 'bg-white text-gray-900 shadow-sm'
                    : 'text-gray-600 hover:text-gray-900'
                }`}
                title="Compact view"
              >
                Compact
              </button>
            </div>

            {/* Sort */}
            <div className="flex items-center gap-2">
              <select
                value={sortBy}
                onChange={(e) => {
                  const newSort = e.target.value as SortOption
                  setSortBy(newSort)
                  // Set default direction based on sort type
                  if (newSort === 'date') {
                    setSortDirection('desc') // Newest first for date
                  } else if (newSort === 'title' || newSort === 'lead') {
                    setSortDirection('asc') // A-Z for text
                  } else {
                    setSortDirection('desc') // Highest first for numbers
                  }
                }}
                className="form-select text-sm"
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
                className="px-3 py-2 border border-gray-100 rounded-lg hover:bg-gray-50 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm flex items-center gap-1.5 transition-colors"
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
              className="form-select text-sm"
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
                className="form-select text-sm"
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
                className="px-3 py-2 text-sm text-gray-600 hover:text-gray-900 underline"
              >
                Clear filters
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Content */}
      {loading ? (
        <div className={`grid gap-4 ${
          viewMode === 'grid' 
            ? 'grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4'
            : viewMode === 'list'
            ? 'grid-cols-1'
            : 'grid-cols-1 md:grid-cols-2 lg:grid-cols-4 xl:grid-cols-6'
        }`}>
          {[...Array(8)].map((_, i) => (
            <StudyCardSkeleton key={i} />
          ))}
        </div>
      ) : filteredAndSortedStudies.length === 0 ? (
        <div className="text-center py-12 bg-white rounded-lg border border-gray-100">
          <p className="text-gray-500 text-lg">No studies found</p>
          {(search || filterType !== 'all' || filterLead) && (
            <p className="text-gray-400 text-sm mt-2">Try adjusting your filters</p>
          )}
        </div>
      ) : (
        <>
          <div className={`grid gap-4 ${
            viewMode === 'grid' 
              ? 'grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4'
              : viewMode === 'list'
              ? 'grid-cols-1'
              : 'grid-cols-1 md:grid-cols-2 lg:grid-cols-4 xl:grid-cols-6'
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
                className={viewMode === 'compact' ? 'min-h-[200px]' : ''}
              >
                <StudyCard
                  study={study}
                  summary={study.summary}
                  loading={study.summaryLoading || loadingSummaries.has(study.id)}
                  onLoadSummary={() => handleLoadSummary(study.id)}
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
                  <div className="flex items-center gap-3 text-gray-500">
                    <svg className="animate-spin h-5 w-5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    <span>Loading more studies...</span>
                  </div>
                </div>
              )}
              {!hasMore && studies.length > 0 && (
                <div className="text-center py-8 text-gray-500 text-sm">
                  No more studies to load
                </div>
              )}
            </>
          )}
        </>
      )}
    </div>
  )
}
