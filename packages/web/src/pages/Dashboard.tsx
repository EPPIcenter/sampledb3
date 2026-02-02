import { useEffect, useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import '../styles/dashboard.css'
import api, {
  studiesApi,
  activityApi,
  statisticsApi,
  controlsApi,
  searchApi,
  type Study,
  type SearchResult,
  type StudySummaryBasic,
  type StatisticsData,
} from '../lib/api'
import MetricCard from '../components/dashboard/MetricCard'
import RecentStudies from '../components/dashboard/RecentStudies'
import ActivityFeed from '../components/dashboard/ActivityFeed'
import SystemInsights from '../components/dashboard/SystemInsights'
import SkeletonCard from '../components/SkeletonCard'
import { calculateTrend } from '../utils/trends'
import { useUser } from '../contexts/UserContext'

interface ActivityItem {
  id: number
  type: 'specimen' | 'study' | 'container' | 'subject' | 'control' | 'location'
  timestamp: string
  label?: string
  context?: string
}

interface DashboardStats {
  studies: number
  specimens: number
  subjects: number
  containers: number
  locations: number
}

interface LoadingState {
  critical: boolean
  secondary: boolean
}

export default function Dashboard() {
  const navigate = useNavigate()
  const { canWrite } = useUser()
  
  // Critical data (loads first)
  const [stats, setStats] = useState<DashboardStats>({
    studies: 0,
    specimens: 0,
    subjects: 0,
    containers: 0,
    locations: 0,
  })
  const [previousStats, setPreviousStats] = useState<DashboardStats | null>(null)
  
  // Secondary data (loads after critical)
  const [statisticsData, setStatisticsData] = useState<StatisticsData | null>(null)
  const [recentStudies, setRecentStudies] = useState<Array<Study & { summary?: StudySummaryBasic | null }>>([])
  const [recentActivity, setRecentActivity] = useState<ActivityItem[]>([])
  const [hasControls, setHasControls] = useState(false)
  
  const [loading, setLoading] = useState<LoadingState>({
    critical: true,
    secondary: true,
  })
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState<SearchResult[]>([])
  const [searchLoading, setSearchLoading] = useState(false)

  // Load critical data on mount; secondary data is triggered from loadCriticalData's finally (single flow)
  useEffect(() => {
    loadCriticalData()
  }, [])

  const loadCriticalData = async () => {
    try {
      setLoading((prev) => ({ ...prev, critical: true }))

      // Load basic stats and previous period stats for trends
      const [studiesRes, specimensRes, subjectsRes, containersRes, locationsRes] = await Promise.all([
        api.get('/studies', { params: { limit: 1 } }),
        api.get('/specimens', { params: { limit: 1 } }),
        api.get('/subjects', { params: { limit: 1 } }).catch(() => ({ data: { subjects: [], pagination: { total: 0 } } })),
        api.get('/containers', { params: { limit: 1 } }).catch(() => ({ data: { containers: [], pagination: { total: 0 } } })),
        api.get('/locations', { params: { limit: 1 } }).catch(() => ({ data: { locations: [], pagination: { total: 0 } } })),
      ])

      const currentStats: DashboardStats = {
        studies: studiesRes.data.pagination?.total || studiesRes.data.studies?.length || 0,
        specimens: specimensRes.data.pagination?.total || specimensRes.data.specimens?.length || 0,
        subjects: subjectsRes.data.pagination?.total || subjectsRes.data.subjects?.length || 0,
        containers: containersRes.data.pagination?.total || containersRes.data.containers?.length || 0,
        locations: locationsRes.data.pagination?.total || locationsRes.data.locations?.length || 0,
      }

      setStats(currentStats)

      // Load previous period stats for trends (30 days ago)
      const thirtyDaysAgo = new Date()
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 60)
      const sixtyDaysAgo = new Date()
      sixtyDaysAgo.setDate(sixtyDaysAgo.getDate() - 60)

      try {
        const [prevStudiesRes, prevSpecimensRes, prevSubjectsRes] = await Promise.all([
          api.get('/studies', { params: { limit: 1, created_to: thirtyDaysAgo.toISOString().split('T')[0] } }).catch(() => null),
          api.get('/specimens', { params: { limit: 1, created_to: thirtyDaysAgo.toISOString().split('T')[0] } }).catch(() => null),
          api.get('/subjects', { params: { limit: 1, created_to: thirtyDaysAgo.toISOString().split('T')[0] } }).catch(() => null),
        ])

        if (prevStudiesRes && prevSpecimensRes && prevSubjectsRes) {
          setPreviousStats({
            studies: prevStudiesRes.data.pagination?.total || prevStudiesRes.data.studies?.length || 0,
            specimens: prevSpecimensRes.data.pagination?.total || prevSpecimensRes.data.specimens?.length || 0,
            subjects: prevSubjectsRes.data.pagination?.total || prevSubjectsRes.data.subjects?.length || 0,
            containers: 0, // Not easily calculable
            locations: 0, // Not easily calculable
          })
        }
      } catch (error) {
        // Silently fail - trends are optional
        console.debug('Could not load previous period stats for trends:', error)
      }
    } catch (error) {
      console.error('Failed to load critical dashboard data:', error)
    } finally {
      setLoading((prev) => ({ ...prev, critical: false }))
      // Load secondary data in same flow (avoids chain of Effects)
      loadSecondaryData()
    }
  }

  const loadSecondaryData = async () => {
    try {
      setLoading((prev) => ({ ...prev, secondary: true }))

      // Load all secondary data in parallel
      const [
        statisticsRes,
        studiesListRes,
        activityRes,
        controlsRes,
      ] = await Promise.all([
        statisticsApi.get().catch(() => ({ data: null })),
        studiesApi.list(undefined, { limit: 15 }).catch(() => ({ studies: [] })),
        activityApi.recent(20).catch(() => ({ data: { activity: [] } })),
        controlsApi.list().catch(() => ({ data: { controls: [] } })),
      ])

      // Set statistics data
      if (statisticsRes.data) {
        setStatisticsData(statisticsRes.data)
      }

      // Load study summaries
      const studies = studiesListRes.studies || []
      if (studies.length > 0) {
        const studyIds = studies.map((s: Study) => s.id)
        try {
          const summariesRes = await studiesApi.getSummaries(studyIds)
          const summariesMap = new Map(
            (summariesRes.summaries || []).map((s: StudySummaryBasic) => [s.studyId, s])
          )
          setRecentStudies(
            studies.map((study: Study) => ({
              ...study,
              summary: summariesMap.get(study.id) || null,
            }))
          )
        } catch (error) {
          console.error('Failed to load study summaries:', error)
          setRecentStudies(studies)
        }
      } else {
        setRecentStudies([])
      }

      // Set activity
      const activities = (activityRes.data.activity || []) as any[]
      setRecentActivity(
        activities.map((item) => ({
          id: item.id,
          type: item.type as ActivityItem['type'],
          timestamp: item.timestamp,
          label: item.label,
          context: item.context,
        }))
      )

      // Check if controls exist
      setHasControls((controlsRes.data.controls || []).length > 0)
    } catch (error) {
      console.error('Failed to load secondary dashboard data:', error)
    } finally {
      setLoading((prev) => ({ ...prev, secondary: false }))
    }
  }

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!searchQuery.trim()) return

    try {
      setSearchLoading(true)
      const response = await searchApi.search(searchQuery.trim())
      setSearchResults(response.data.results || [])
      
      // Navigate to first result if available
      if (response.data.results && response.data.results.length > 0) {
        const firstResult = response.data.results[0]
        // Navigate based on result type
        if (firstResult.type === 'specimen') {
          navigate(`/specimens/${firstResult.id}`)
        } else if (firstResult.type === 'study') {
          navigate(`/studies/${firstResult.id}`)
        } else if (firstResult.type === 'container') {
          navigate(`/containers/${firstResult.id}`)
        } else if (firstResult.type === 'subject') {
          navigate(`/subjects/${firstResult.id}`)
        }
      }
    } catch (error) {
      console.error('Search failed:', error)
    } finally {
      setSearchLoading(false)
    }
  }

  // Calculate trends
  const specimensTrend = previousStats ? calculateTrend(stats.specimens, previousStats.specimens) : null
  const subjectsTrend = previousStats ? calculateTrend(stats.subjects, previousStats.subjects) : null

  const isLoading = loading.critical || loading.secondary

  return (
    <div className="dashboard-page">
      <div className="relative z-10 container mx-auto px-4 py-8">
        {/* Welcome / header */}
        <header className="mb-8 dashboard-reveal dashboard-reveal-1">
          <h1 className="text-3xl font-bold mb-1">Lab overview</h1>
          <p className="text-[rgb(var(--dashboard-text-muted))] text-lg">Your samples at a glance</p>
        </header>

        {/* Hero Metrics Section */}
        {loading.critical ? (
          <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-5 gap-4 mb-8">
            {Array.from({ length: 5 }).map((_, i) => (
              <SkeletonCard key={i} height="h-24" />
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-5 gap-4 mb-8">
            <MetricCard title="Studies" value={stats.studies} linkTo="/studies" color="blue" index={1} />
            <MetricCard
              title="Specimens"
              value={stats.specimens}
              linkTo="/specimens"
              trend={specimensTrend ? { value: specimensTrend.value, positive: specimensTrend.positive, label: '30d' } : undefined}
              color="green"
              index={2}
            />
            <MetricCard
              title="Subjects"
              value={stats.subjects}
              trend={subjectsTrend ? { value: subjectsTrend.value, positive: subjectsTrend.positive, label: '30d' } : undefined}
              color="purple"
              index={3}
            />
            <MetricCard title="Containers" value={stats.containers} linkTo="/locations" color="orange" index={4} />
            <MetricCard title="Locations" value={stats.locations} linkTo="/locations" color="indigo" index={5} />
          </div>
        )}

        {/* Quick Actions Section */}
        <section className="dashboard-card p-6 mb-8 dashboard-reveal dashboard-reveal-6" aria-labelledby="quick-actions-title">
          <h2 id="quick-actions-title" className="dashboard-section-title mb-4">Quick Actions</h2>
          <div className={`grid grid-cols-1 ${canWrite ? 'md:grid-cols-2 lg:grid-cols-4' : 'md:grid-cols-1'} gap-4`}>
            {canWrite && (
              <>
                <Link
                  to="/specimens/new"
                  className="dashboard-action-tile flex items-center gap-3 p-4 rounded-xl border border-[rgb(var(--dashboard-border))] bg-[rgb(var(--dashboard-card))] hover:border-[rgb(var(--dashboard-accent))] hover:shadow-md transition-all duration-200"
                  aria-label="Register new specimen"
                >
                  <span className="flex-shrink-0 w-10 h-10 rounded-lg bg-[rgb(var(--dashboard-accent-muted))] flex items-center justify-center text-[rgb(var(--dashboard-accent))]">
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                    </svg>
                  </span>
                  <div className="text-left min-w-0">
                    <div className="font-medium text-[rgb(var(--dashboard-text))]">Register New Specimen</div>
                    <div className="text-sm text-[rgb(var(--dashboard-text-muted))]">Add a new specimen to the system</div>
                  </div>
                </Link>
                <Link
                  to="/studies/new"
                  className="dashboard-action-tile flex items-center gap-3 p-4 rounded-xl border border-[rgb(var(--dashboard-border))] bg-[rgb(var(--dashboard-card))] hover:border-[rgb(var(--dashboard-accent))] hover:shadow-md transition-all duration-200"
                  aria-label="Create new study"
                >
                  <span className="flex-shrink-0 w-10 h-10 rounded-lg bg-[rgb(var(--dashboard-accent-muted))] flex items-center justify-center text-[rgb(var(--dashboard-accent))]">
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
                    </svg>
                  </span>
                  <div className="text-left min-w-0">
                    <div className="font-medium text-[rgb(var(--dashboard-text))]">Create New Study</div>
                    <div className="text-sm text-[rgb(var(--dashboard-text-muted))]">Start a new research study</div>
                  </div>
                </Link>
                <Link
                  to="/import"
                  className="dashboard-action-tile flex items-center gap-3 p-4 rounded-xl border border-[rgb(var(--dashboard-border))] bg-[rgb(var(--dashboard-card))] hover:border-[rgb(var(--dashboard-accent))] hover:shadow-md transition-all duration-200"
                  aria-label="Bulk import"
                >
                  <span className="flex-shrink-0 w-10 h-10 rounded-lg bg-[rgb(var(--dashboard-accent-muted))] flex items-center justify-center text-[rgb(var(--dashboard-accent))]">
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                    </svg>
                  </span>
                  <div className="text-left min-w-0">
                    <div className="font-medium text-[rgb(var(--dashboard-text))]">Bulk Import</div>
                    <div className="text-sm text-[rgb(var(--dashboard-text-muted))]">Import data from CSV</div>
                  </div>
                </Link>
              </>
            )}
            <form onSubmit={handleSearch} className="flex flex-col gap-2">
              <div className="flex gap-2">
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Quick search..."
                  className="form-input flex-1 border-[rgb(var(--dashboard-border))] focus:ring-[rgb(var(--dashboard-accent))] focus:border-[rgb(var(--dashboard-accent))]"
                  aria-label="Quick search"
                />
                <button
                  type="submit"
                  disabled={searchLoading}
                  className="px-4 py-2 rounded-lg font-medium text-white bg-[rgb(var(--dashboard-accent))] hover:bg-[rgb(var(--dashboard-accent-hover))] disabled:opacity-50 transition-colors"
                  aria-label="Search"
                >
                  {searchLoading ? '...' : 'Search'}
                </button>
              </div>
              <div className="text-xs text-[rgb(var(--dashboard-text-muted))]">Press Enter to search</div>
            </form>
          </div>
          {!canWrite && (
            <div className="mt-4 rounded-lg p-3 bg-[rgb(var(--dashboard-accent-muted))] border border-[rgb(var(--dashboard-accent)/0.3)]">
              <div className="flex items-center gap-2">
                <svg className="w-5 h-5 text-[rgb(var(--dashboard-accent))]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <p className="text-sm font-medium text-[rgb(var(--dashboard-text))]">
                  You have view-only access. Contact an administrator or member to create or modify data.
                </p>
              </div>
            </div>
          )}
        </section>

        {/* Recent Studies and Activity Feed */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
          <RecentStudies studies={recentStudies} loading={loading.secondary} />
          <ActivityFeed activities={recentActivity} loading={loading.secondary} />
        </div>

        {/* System Insights */}
        <SystemInsights data={statisticsData} loading={loading.secondary} />

        {/* Controls Inventory (Conditional) */}
        {hasControls && !loading.secondary && (
          <section className="dashboard-card p-6 mb-8" aria-labelledby="blood-controls-title">
            <div className="flex items-center justify-between mb-4">
              <h2 id="blood-controls-title" className="dashboard-section-title">Blood Controls</h2>
              <Link to="/blood-controls" className="dashboard-link text-sm" aria-label="View all blood controls">
                View All Controls →
              </Link>
            </div>
            <p className="text-[rgb(var(--dashboard-text-muted))]">
              Blood control definitions and batches are available. Visit the Blood Controls page to manage them.
            </p>
          </section>
        )}
      </div>
    </div>
  )
}
