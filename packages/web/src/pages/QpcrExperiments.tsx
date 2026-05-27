import { useState, useCallback } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import type { QpcrExperiment } from '../lib/api/qpcr'
import EntityBreadcrumbs from '../components/EntityBreadcrumbs'
import DataTable from '../components/DataTable'
import type { Column } from '../components/DataTable'
import { useUser } from '../contexts/UserContext'
import { useQpcrExperimentsList } from '../hooks/useQpcrExperiments'
import { AsyncPresentation, EmptyState, PageError, fromQuery, getQueryErrorMessage } from '../ui'
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
  const [statusFilter, setStatusFilter] = useState<string>('')
  const experimentsQuery = useQpcrExperimentsList(statusFilter || undefined)
  const experiments = experimentsQuery.data ?? []
  const listStatus = fromQuery(experimentsQuery, {
    isEmpty: experimentsQuery.isSuccess && experiments.length === 0,
  })
  const listErrorMessage = getQueryErrorMessage(
    experimentsQuery.error,
    'Failed to load qPCR experiments'
  )

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

  const emptyAction = canWrite ? (
    <Link to="/qpcr-experiments/new" className="qpcr-btn-primary mt-2">
      Create experiment
    </Link>
  ) : undefined

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

        <AsyncPresentation
          status={listStatus}
          loadingFallback={
            <div className="qpcr-table-wrapper">
              <DataTable<QpcrExperiment>
                data={[]}
                columns={columns}
                loading
                density="compact"
                className="qpcr-card overflow-hidden"
              />
            </div>
          }
          errorFallback={
            <PageError
              title="Could not load experiments"
              message={listErrorMessage}
              onRetry={() => void experimentsQuery.refetch()}
            />
          }
          emptyFallback={
            <EmptyState
              title="No qPCR experiments yet"
              description="Create an experiment to define a plate layout, download an instrument template, and import results."
              action={emptyAction}
            />
          }
        >
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
              emptyMessage="No experiments match the current filter."
              initialSortColumn="lastUpdated"
              initialSortDirection="desc"
              density="compact"
              className="qpcr-card overflow-hidden"
            />
          </div>
        </AsyncPresentation>
      </div>
    </div>
  )
}
