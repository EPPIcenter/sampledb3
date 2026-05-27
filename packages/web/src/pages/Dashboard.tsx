import { useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import '../styles/dashboard.css'
import MetricCard from '../components/dashboard/MetricCard'
import RecentStudies from '../components/dashboard/RecentStudies'
import ActivityFeed from '../components/dashboard/ActivityFeed'
import SystemInsights from '../components/dashboard/SystemInsights'
import SkeletonCard from '../components/SkeletonCard'
import SearchModal from '../components/SearchModal'
import { calculateTrend } from '../utils/trends'
import { useUser } from '../contexts/UserContext'
import { useFocusSearchOnSlash } from '../hooks/useHotkey'
import {
  useDashboardCritical,
  useDashboardTrendStats,
  useDashboardSecondary,
  useDashboardStudySummaries,
  useDashboardQpcr,
  mergeStudiesWithSummaries,
} from '../hooks/useDashboard'
import { Button, PageError, SectionMessage, getQueryErrorMessage } from '../ui'

const EMPTY_STATS = {
  studies: 0,
  specimens: 0,
  subjects: 0,
  containers: 0,
  locations: 0,
}

export default function Dashboard() {
  const { canWrite } = useUser()

  const [searchModalOpen, setSearchModalOpen] = useState(false)
  const [searchInitialQuery, setSearchInitialQuery] = useState('')
  const heroSearchRef = useRef<HTMLInputElement>(null)
  useFocusSearchOnSlash(heroSearchRef)

  const criticalQuery = useDashboardCritical()
  const trendQuery = useDashboardTrendStats(criticalQuery.isSuccess)
  const secondaryQuery = useDashboardSecondary()
  const qpcrQuery = useDashboardQpcr()

  const studyIds = useMemo(
    () => secondaryQuery.data?.studies.map((s) => s.id) ?? [],
    [secondaryQuery.data?.studies]
  )
  const summariesQuery = useDashboardStudySummaries(studyIds)

  const stats = criticalQuery.data?.stats ?? EMPTY_STATS
  const previousStats = trendQuery.data ?? null
  const recentStudies = useMemo(
    () => mergeStudiesWithSummaries(secondaryQuery.data?.studies ?? [], summariesQuery.data),
    [secondaryQuery.data?.studies, summariesQuery.data]
  )
  const recentActivity = secondaryQuery.data?.activity ?? []
  const statisticsData = secondaryQuery.data?.statistics ?? null
  const hasControls = secondaryQuery.data?.hasControls ?? false
  const recentQpcrExperiments = qpcrQuery.data ?? []

  const specimensTrend = previousStats
    ? calculateTrend(stats.specimens, previousStats.specimens)
    : null
  const subjectsTrend = previousStats
    ? calculateTrend(stats.subjects, previousStats.subjects)
    : null

  const handleSearchSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    const form = e.currentTarget
    const input = form.querySelector<HTMLInputElement>('input[name="dashboard-search"]')
    if (!input) return
    const q = input.value.trim() || ''
    if (q) {
      setSearchInitialQuery(q)
      setSearchModalOpen(true)
    }
  }

  const formatDataAsOf = (d: Date) =>
    d.toLocaleString(undefined, { dateStyle: 'short', timeStyle: 'short' })

  const metricsErrorMessage = criticalQuery.error
    ? getQueryErrorMessage(criticalQuery.error, 'Failed to load dashboard metrics')
    : 'Failed to load dashboard metrics'

  return (
    <div className="dashboard-page">
      <SearchModal
        isOpen={searchModalOpen}
        onClose={() => {
          setSearchModalOpen(false)
          setSearchInitialQuery('')
        }}
        initialQuery={searchInitialQuery || undefined}
      />
      <div className="relative z-10 container mx-auto px-4 py-8">
        <header className="mb-6 dashboard-reveal dashboard-reveal-1">
          <h1 className="text-3xl font-bold mb-1">Lab Overview</h1>
          <p className="text-[rgb(var(--app-text-muted))] text-lg mb-4">
            Find samples, track activity, run workflows
          </p>
          <form onSubmit={handleSearchSubmit} className="dashboard-search-form max-w-2xl">
            <div className="flex gap-2">
              <input
                ref={heroSearchRef}
                type="search"
                name="dashboard-search"
                placeholder="Search by barcode, study code, subject, or ID"
                className="dashboard-search-input flex-1 rounded-xl border border-[rgb(var(--app-border))] bg-[rgb(var(--app-card))] px-4 py-3 text-[rgb(var(--app-text))] placeholder:text-[rgb(var(--app-text-muted))] focus:outline-none focus:ring-2 focus:ring-[rgb(var(--app-accent))] focus:border-transparent"
                aria-label="Search samples and studies"
              />
              <Button type="submit" variant="primary" className="rounded-xl px-4 py-3">
                Search
              </Button>
            </div>
          </form>
          {criticalQuery.data?.fetchedAt && (
            <p className="mt-2 text-sm text-[rgb(var(--app-text-muted))]" aria-live="polite">
              Data as of {formatDataAsOf(criticalQuery.data.fetchedAt)}
            </p>
          )}
        </header>

        <section
          className="mb-8 dashboard-reveal dashboard-reveal-2"
          aria-labelledby="quick-actions-title"
        >
          <h2 id="quick-actions-title" className="dashboard-section-title mb-4 sr-only">
            Quick Actions
          </h2>
          <div
            className={`grid grid-cols-1 ${canWrite ? 'md:grid-cols-2 lg:grid-cols-4' : 'md:grid-cols-1'} gap-4`}
          >
            {canWrite && (
              <>
                <Link
                  to="/specimens/new"
                  className="dashboard-action-tile flex items-center gap-3 p-4 rounded-xl border border-[rgb(var(--app-border))] bg-[rgb(var(--app-card))] hover:border-[rgb(var(--app-accent))] hover:shadow-md transition-all duration-200"
                  aria-label="Register new specimen"
                >
                  <span className="flex-shrink-0 w-10 h-10 rounded-lg bg-[rgb(var(--app-accent-muted))] flex items-center justify-center text-[rgb(var(--app-accent))]">
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                    </svg>
                  </span>
                  <div className="text-left min-w-0">
                    <div className="font-medium text-[rgb(var(--app-text))]">Register New Specimen</div>
                    <div className="text-sm text-[rgb(var(--app-text-muted))]">
                      Add a new specimen to the system
                    </div>
                  </div>
                </Link>
                <Link
                  to="/studies/new"
                  className="dashboard-action-tile flex items-center gap-3 p-4 rounded-xl border border-[rgb(var(--app-border))] bg-[rgb(var(--app-card))] hover:border-[rgb(var(--app-accent))] hover:shadow-md transition-all duration-200"
                  aria-label="Create new study"
                >
                  <span className="flex-shrink-0 w-10 h-10 rounded-lg bg-[rgb(var(--app-accent-muted))] flex items-center justify-center text-[rgb(var(--app-accent))]">
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253"
                      />
                    </svg>
                  </span>
                  <div className="text-left min-w-0">
                    <div className="font-medium text-[rgb(var(--app-text))]">Create New Study</div>
                    <div className="text-sm text-[rgb(var(--app-text-muted))]">
                      Start a new research study
                    </div>
                  </div>
                </Link>
                <Link
                  to="/import"
                  className="dashboard-action-tile flex items-center gap-3 p-4 rounded-xl border border-[rgb(var(--app-border))] bg-[rgb(var(--app-card))] hover:border-[rgb(var(--app-accent))] hover:shadow-md transition-all duration-200"
                  aria-label="Bulk import"
                >
                  <span className="flex-shrink-0 w-10 h-10 rounded-lg bg-[rgb(var(--app-accent-muted))] flex items-center justify-center text-[rgb(var(--app-accent))]">
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"
                      />
                    </svg>
                  </span>
                  <div className="text-left min-w-0">
                    <div className="font-medium text-[rgb(var(--app-text))]">Bulk Import</div>
                    <div className="text-sm text-[rgb(var(--app-text-muted))]">
                      Import data from CSV
                    </div>
                  </div>
                </Link>
                <Link
                  to="/locations"
                  className="dashboard-action-tile flex items-center gap-3 p-4 rounded-xl border border-[rgb(var(--app-border))] bg-[rgb(var(--app-card))] hover:border-[rgb(var(--app-accent))] hover:shadow-md transition-all duration-200"
                  aria-label="Browse storage"
                >
                  <span className="flex-shrink-0 w-10 h-10 rounded-lg bg-[rgb(var(--app-accent-muted))] flex items-center justify-center text-[rgb(var(--app-accent))]">
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"
                      />
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M15 11a3 3 0 11-6 0 3 3 0 016 0z"
                      />
                    </svg>
                  </span>
                  <div className="text-left min-w-0">
                    <div className="font-medium text-[rgb(var(--app-text))]">Browse Storage</div>
                    <div className="text-sm text-[rgb(var(--app-text-muted))]">
                      View locations and collections
                    </div>
                  </div>
                </Link>
              </>
            )}
            {!canWrite && (
              <Link
                to="/locations"
                className="dashboard-action-tile flex items-center gap-3 p-4 rounded-xl border border-[rgb(var(--app-border))] bg-[rgb(var(--app-card))] hover:border-[rgb(var(--app-accent))] hover:shadow-md transition-all duration-200"
                aria-label="Browse storage"
              >
                <span className="flex-shrink-0 w-10 h-10 rounded-lg bg-[rgb(var(--app-accent-muted))] flex items-center justify-center text-[rgb(var(--app-accent))]">
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"
                    />
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M15 11a3 3 0 11-6 0 3 3 0 016 0z"
                    />
                  </svg>
                </span>
                <div className="text-left min-w-0">
                  <div className="font-medium text-[rgb(var(--app-text))]">Browse Storage</div>
                  <div className="text-sm text-[rgb(var(--app-text-muted))]">
                    View locations and collections
                  </div>
                </div>
              </Link>
            )}
          </div>
          {!canWrite && (
            <div className="mt-4 rounded-lg p-3 bg-[rgb(var(--app-accent-muted))] border border-[rgb(var(--app-accent)/0.3)]">
              <div className="flex items-center gap-2">
                <svg
                  className="w-5 h-5 text-[rgb(var(--app-accent))]"
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
                <p className="text-sm font-medium text-[rgb(var(--app-text))]">
                  You have view-only access. Contact an administrator or member to create or modify
                  data.
                </p>
              </div>
            </div>
          )}
        </section>

        <section
          className="dashboard-card p-6 mb-8 dashboard-reveal dashboard-reveal-qpcr"
          aria-labelledby="qpcr-experiments-title"
        >
          <div className="flex items-center justify-between mb-4">
            <h2 id="qpcr-experiments-title" className="dashboard-section-title">
              qPCR Experiments
            </h2>
            {canWrite && (
              <Link
                to="/qpcr-experiments/new"
                className="dashboard-link text-sm"
                aria-label="New qPCR experiment"
              >
                New qPCR experiment
              </Link>
            )}
          </div>
          {qpcrQuery.isPending ? (
            <SkeletonCard height="h-24" className="mb-2" />
          ) : qpcrQuery.isError ? (
            <SectionMessage message="Failed to load qPCR experiments" variant="error" />
          ) : recentQpcrExperiments.length === 0 ? (
            <p className="text-[rgb(var(--app-text-muted))] py-2">
              No qPCR experiments yet —{' '}
              {canWrite ? 'create one to get started.' : 'qPCR experiments will appear here.'}
            </p>
          ) : (
            <ul className="space-y-2">
              {recentQpcrExperiments.map((exp) => (
                <li key={exp.id}>
                  <Link
                    to={`/qpcr-experiments/${exp.id}`}
                    className="flex items-center justify-between p-3 rounded-lg border border-[rgb(var(--app-border))] hover:border-[rgb(var(--app-accent)/0.4)] hover:bg-[rgb(var(--app-surface))] transition-all duration-200"
                    aria-label={`View qPCR experiment ${exp.name ?? exp.id}`}
                  >
                    <span className="font-medium text-[rgb(var(--app-text))] truncate">
                      {exp.name ?? `Experiment #${exp.id}`}
                    </span>
                    <span
                      className={`flex-shrink-0 ml-2 px-2 py-0.5 text-xs font-medium rounded dashboard-qpcr-state dashboard-qpcr-state-${exp.status.replace('_', '-')}`}
                      aria-label={`Status: ${exp.status}`}
                    >
                      {exp.status === 'setup' && 'Setup'}
                      {exp.status === 'in_progress' && 'In progress'}
                      {exp.status === 'results_uploaded' && 'Results imported'}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="mb-8 dashboard-reveal dashboard-reveal-4" aria-labelledby="metrics-title">
          <h2 id="metrics-title" className="dashboard-section-title mb-4 sr-only">
            Key metrics
          </h2>
          {criticalQuery.isPending ? (
            <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-5 gap-4">
              {Array.from({ length: 5 }).map((_, i) => (
                <SkeletonCard key={i} height="h-24" />
              ))}
            </div>
          ) : criticalQuery.isError ? (
            <PageError
              message={metricsErrorMessage}
              onRetry={() => void criticalQuery.refetch()}
            />
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              <div className="dashboard-metrics-group">
                <h3 className="dashboard-metrics-group-label">Inventory</h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <MetricCard
                    title="Specimens"
                    value={stats.specimens}
                    linkTo="/specimens"
                    trend={
                      specimensTrend
                        ? {
                            value: specimensTrend.value,
                            positive: specimensTrend.positive,
                            label: '30d',
                          }
                        : undefined
                    }
                    color="green"
                    index={4}
                  />
                  <MetricCard
                    title="Containers"
                    value={stats.containers}
                    linkTo="/locations"
                    color="orange"
                    index={5}
                  />
                </div>
              </div>
              <div className="dashboard-metrics-group">
                <h3 className="dashboard-metrics-group-label">Studies</h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <MetricCard
                    title="Studies"
                    value={stats.studies}
                    linkTo="/studies"
                    color="blue"
                    index={6}
                  />
                  <MetricCard
                    title="Subjects"
                    value={stats.subjects}
                    trend={
                      subjectsTrend
                        ? {
                            value: subjectsTrend.value,
                            positive: subjectsTrend.positive,
                            label: '30d',
                          }
                        : undefined
                    }
                    color="purple"
                    index={7}
                  />
                </div>
              </div>
              <div className="dashboard-metrics-group">
                <h3 className="dashboard-metrics-group-label">Storage</h3>
                <div className="grid grid-cols-1 gap-4">
                  <MetricCard
                    title="Locations"
                    value={stats.locations}
                    linkTo="/locations"
                    color="indigo"
                    index={8}
                  />
                </div>
              </div>
            </div>
          )}
        </section>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
          <RecentStudies
            studies={recentStudies}
            loading={secondaryQuery.isPending}
          />
          <ActivityFeed activities={recentActivity} loading={secondaryQuery.isPending} />
        </div>

        <SystemInsights data={statisticsData} loading={secondaryQuery.isPending} />

        {hasControls && !secondaryQuery.isPending && (
          <section className="dashboard-card p-6 mb-8" aria-labelledby="blood-controls-title">
            <div className="flex items-center justify-between mb-4">
              <h2 id="blood-controls-title" className="dashboard-section-title">
                Blood Controls
              </h2>
              <Link
                to="/blood-controls"
                className="dashboard-link text-sm"
                aria-label="View all blood controls"
              >
                View All Controls →
              </Link>
            </div>
            <p className="text-[rgb(var(--app-text-muted))]">
              Blood control definitions and batches are available. Visit the Blood Controls page
              to manage them.
            </p>
          </section>
        )}
      </div>
    </div>
  )
}
