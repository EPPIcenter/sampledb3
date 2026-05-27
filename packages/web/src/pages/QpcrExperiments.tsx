import { useEffect, useState, useCallback } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { qpcrExperimentsApi } from '../lib/api/qpcr';
import type { QpcrExperiment } from '../lib/api/qpcr';
import EntityBreadcrumbs from '../components/EntityBreadcrumbs'
import SkeletonDetailPage from '../components/SkeletonDetailPage'
import DataTable from '../components/DataTable'
import type { Column } from '../components/DataTable'
import { useUser } from '../contexts/UserContext'
import '../styles/qpcr.css'

const TEMPLATE_LABELS: Record<string, string> = {
  biorad: 'Bio-Rad CFX 96',
  quant_studio: 'Quant Studio',
}

function getStatusPillClass(status: string): string {
  switch (status) {
    case 'setup':
      return 'qpcr-pill-setup'
    case 'in_progress':
      return 'qpcr-pill-template'
    case 'results_uploaded':
      return 'qpcr-pill-results'
    default:
      return 'qpcr-pill-unknown'
  }
}

function getStatusLabel(status: string): string {
  switch (status) {
    case 'setup':
      return 'Setup'
    case 'in_progress':
      return 'In progress'
    case 'results_uploaded':
      return 'Results imported'
    default:
      return status
  }
}

function formatShortDate(iso: string | null | undefined): string {
  if (!iso) return '—'
  try {
    const d = new Date(iso)
    if (Number.isNaN(d.getTime())) return '—'
    return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })
  } catch {
    return '—'
  }
}

export default function QpcrExperiments() {
  const navigate = useNavigate()
  const { canWrite } = useUser()
  const [experiments, setExperiments] = useState<QpcrExperiment[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [statusFilter, setStatusFilter] = useState<string>('')

  const loadExperiments = useCallback(() => {
    setLoading(true)
    setError(null)
    qpcrExperimentsApi
      .list(statusFilter ? { status: statusFilter } : undefined)
      .then((res) => setExperiments(res.data.experiments))
      .catch((err: { response?: { data?: { error?: string } } }) => {
        setError(err.response?.data?.error ?? 'Failed to load qPCR experiments')
      })
      .finally(() => setLoading(false))
  }, [statusFilter])

  useEffect(() => {
    loadExperiments()
  }, [loadExperiments])

  const handleRowClick = useCallback(
    (row: QpcrExperiment) => {
      navigate(`/qpcr-experiments/${row.id}`)
    },
    [navigate]
  )

  const columns: Column<QpcrExperiment>[] = [
    {
      key: 'name',
      label: 'Name',
      sortable: true,
      render: (_, row) => (
        <span className="font-medium text-app-text">
          {row.name?.trim() || `Experiment ${row.id}`}
        </span>
      ),
    },
    {
      key: 'status',
      label: 'Status',
      sortable: true,
      render: (_, row) => (
        <span className={`inline-flex ${getStatusPillClass(row.status)}`}>
          {getStatusLabel(row.status)}
        </span>
      ),
    },
    {
      key: 'templateFormat',
      label: 'Template',
      sortable: true,
      render: (_, row) => (
        <span className="text-app-text">
          {(TEMPLATE_LABELS as Record<string, string>)[row.templateFormat] ?? row.templateFormat}
        </span>
      ),
    },
    {
      key: 'plateBarcode',
      label: 'Plate',
      sortable: true,
      render: (val) => (
        <span className="text-app-text-muted">{typeof val === 'string' ? val.trim() || '—' : '—'}</span>
      ),
    },
    {
      key: 'targets',
      label: 'Target(s)',
      sortable: false,
      render: (_, row) => {
        const targets = row.targets ?? []
        const names = targets.map((t) => (t.targetName != null ? t.targetName.trim() : '')).filter(Boolean) // eslint-disable-line @typescript-eslint/no-unnecessary-condition -- targetName may be omitted
        return (
          <span className="text-app-text-muted">{names.length > 0 ? names.join(', ') : '—'}</span>
        )
      },
    },
    {
      key: 'assay',
      label: 'Assay',
      sortable: false,
      render: (_, row) => {
        const targets = row.targets ?? []
        if (targets.length === 0) return <span className="text-app-text-muted">—</span>
        if (targets.length > 1) return <span className="text-app-text-muted">Multiple</span>
        const dye =
          row.templateFormat === 'quant_studio'
            ? (targets[0].reporter ?? targets[0].fluorophore)
            : (targets[0].fluorophore ?? targets[0].reporter)
        return (
          <span className="text-app-text-muted">{(dye ?? '').trim() || '—'}</span>
        )
      },
    },
    {
      key: 'wellCount',
      label: 'Wells',
      sortable: true,
      render: (_, row) =>
        row.wellCount != null ? (
          <span className="text-app-text-muted">{row.wellCount}</span>
        ) : (
          <span className="text-app-text-muted">—</span>
        ),
    },
    {
      key: 'runCount',
      label: 'Runs',
      sortable: true,
      render: (_, row) =>
        row.runCount != null ? (
          <span className="text-app-text-muted">{row.runCount}</span>
        ) : (
          <span className="text-app-text-muted">—</span>
        ),
    },
    {
      key: 'lastRunAt',
      label: 'Last run',
      sortable: true,
      render: (_, row) => (
        <span className="text-app-text-muted">{formatShortDate(row.lastRunAt ?? undefined)}</span>
      ),
    },
    {
      key: 'created',
      label: 'Created',
      sortable: true,
      render: (val) => (
        <span className="text-app-text-muted">{formatShortDate(val as string | null)}</span>
      ),
    },
    {
      key: 'lastUpdated',
      label: 'Updated',
      sortable: true,
      render: (val) => (
        <span className="text-app-text-muted">{formatShortDate(val as string | null)}</span>
      ),
    },
  ]

  if (loading && experiments.length === 0) {
    return (
      <div className="qpcr-theme qpcr-page-bg">
        <SkeletonDetailPage sections={1} />
      </div>
    )
  }

  return (
    <div className="qpcr-theme qpcr-page-bg">
      <div className="container mx-auto px-4 py-8 max-w-7xl">
        <div className="mb-8">
          <EntityBreadcrumbs items={[{ label: 'qPCR Experiments' }]} />
          <div className="mt-4 flex flex-wrap items-center justify-between gap-4">
            <div>
              <h1 className="text-3xl font-semibold text-app-text mt-0 mb-2 tracking-tight">
                qPCR Experiments
              </h1>
              <p className="text-app-text-muted max-w-xl">
                Create experiments, upload plate layouts, download machine templates, and import run
                results.
              </p>
            </div>
            {canWrite && (
              <Link to="/qpcr-experiments/new" className="qpcr-btn-primary shrink-0">
                New Experiment
              </Link>
            )}
          </div>
        </div>

        {error && (
          <div
            className="mb-6 p-4 bg-app-trend-down/10 border border-app-trend-down rounded-xl text-app-trend-down text-sm"
            role="alert"
          >
            {error}
          </div>
        )}

        {experiments.length === 0 && !loading ? (
          <div className="qpcr-card p-12 text-center" style={{ animationDelay: '0ms' }}>
            <div className="flex flex-col items-center gap-4">
              <div
                className="flex h-16 w-16 items-center justify-center rounded-2xl bg-app-surface text-app-text-muted"
                aria-hidden
              >
                <svg
                  className="h-8 w-8"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={1.5}
                    d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z"
                  />
                </svg>
              </div>
              <div>
                <h2 className="text-lg font-semibold text-app-text">No qPCR experiments yet</h2>
                <p className="mt-1 text-sm text-app-text-muted">
                  Create an experiment to define a plate layout, download an instrument template, and
                  import results.
                </p>
              </div>
              {canWrite && (
                <Link to="/qpcr-experiments/new" className="qpcr-btn-primary mt-2">
                  Create experiment
                </Link>
              )}
            </div>
          </div>
        ) : (
          <>
            <div className="mb-4 flex flex-wrap items-center gap-3">
              <label htmlFor="qpcr-status-filter" className="text-sm font-medium text-app-text">
                Status
              </label>
              <select
                id="qpcr-status-filter"
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="qpcr-select w-auto min-w-[10rem] text-sm"
                aria-label="Filter by status"
              >
                <option value="">All</option>
                <option value="setup">Setup</option>
                <option value="in_progress">In progress</option>
                <option value="results_uploaded">Results imported</option>
              </select>
            </div>
            <div className="qpcr-table-wrapper">
              <DataTable<QpcrExperiment>
                data={experiments}
                columns={columns}
                onRowClick={handleRowClick}
                loading={loading && experiments.length === 0}
                emptyMessage="No experiments match the current filter."
                initialSortColumn="lastUpdated"
                initialSortDirection="desc"
                density="compact"
                className="qpcr-card overflow-hidden"
              />
            </div>
          </>
        )}
      </div>
    </div>
  )
}
