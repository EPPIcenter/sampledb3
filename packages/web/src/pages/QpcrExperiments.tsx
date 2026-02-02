import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { qpcrExperimentsApi, type QpcrExperiment } from '../lib/api'
import EntityBreadcrumbs from '../components/EntityBreadcrumbs'
import SkeletonDetailPage from '../components/SkeletonDetailPage'
import { useUser } from '../contexts/UserContext'
import '../styles/qpcr.css'

function getStatusPillClass(status: string): string {
  switch (status) {
    case 'setup':
      return 'qpcr-pill-setup'
    case 'template_exported':
      return 'qpcr-pill-template'
    case 'results_uploaded':
      return 'qpcr-pill-results'
    default:
      return 'inline-flex items-center rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-slate-700'
  }
}

function getStatusLabel(status: string): string {
  switch (status) {
    case 'setup':
      return 'Setup'
    case 'template_exported':
      return 'Template ready'
    case 'results_uploaded':
      return 'Results imported'
    default:
      return status
  }
}

export default function QpcrExperiments() {
  const { canWrite } = useUser()
  const [experiments, setExperiments] = useState<QpcrExperiment[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    qpcrExperimentsApi.list()
      .then((res) => setExperiments(res.data.experiments ?? []))
      .catch((err: { response?: { data?: { error?: string } } }) => {
        setError(err.response?.data?.error ?? 'Failed to load qPCR experiments')
      })
      .finally(() => setLoading(false))
  }, [])

  if (loading) {
    return (
      <div className="qpcr-theme min-h-screen bg-gradient-to-b from-slate-50 to-white">
        <SkeletonDetailPage sections={1} />
      </div>
    )
  }

  return (
    <div className="qpcr-theme min-h-screen bg-gradient-to-b from-slate-50 to-white">
      <div className="container mx-auto px-4 py-8 max-w-5xl">
        <div className="mb-8">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <EntityBreadcrumbs items={[{ label: 'qPCR Experiments' }]} />
              <h1 className="text-3xl font-semibold text-slate-800 mt-2 mb-2 tracking-tight">
                qPCR Experiments
              </h1>
              <p className="text-slate-600 max-w-xl">
                Create experiments, upload plate layouts, download machine templates, and import run results.
              </p>
            </div>
            {canWrite && (
              <Link
                to="/qpcr-experiments/new"
                className="qpcr-btn-primary shrink-0"
              >
                New Experiment
              </Link>
            )}
          </div>
        </div>

        {error && (
          <div
            className="mb-6 p-4 bg-red-50 border border-red-200 rounded-xl text-red-700 text-sm"
            role="alert"
          >
            {error}
          </div>
        )}

        {experiments.length === 0 ? (
          <div
            className="qpcr-card p-12 text-center"
            style={{ animationDelay: '0ms' }}
          >
            <div className="flex flex-col items-center gap-4">
              <div
                className="flex h-16 w-16 items-center justify-center rounded-2xl bg-slate-100 text-slate-400"
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
                <h2 className="text-lg font-semibold text-slate-800">No qPCR experiments yet</h2>
                <p className="mt-1 text-sm text-slate-600">
                  Create an experiment to define a plate layout, download an instrument template, and import results.
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
          <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {experiments.map((exp, index) => (
              <li
                key={exp.id}
                className="qpcr-reveal"
                style={{ animationDelay: `${Math.min(index * 50, 300)}ms` }}
              >
                <Link
                  to={`/qpcr-experiments/${exp.id}`}
                  className="qpcr-card block p-5 transition-shadow hover:shadow-md focus:outline-none focus:ring-2 focus:ring-teal-500 focus:ring-offset-2 rounded-xl"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <span className="font-medium text-slate-800 truncate block">
                        {exp.name ?? `Experiment ${exp.id}`}
                      </span>
                      <span className={`mt-2 inline-flex ${getStatusPillClass(exp.status)}`}>
                        {getStatusLabel(exp.status)}
                      </span>
                      {exp.plateBarcode && (
                        <p className="mt-2 text-xs text-slate-500 truncate">
                          Plate: {exp.plateBarcode}
                        </p>
                      )}
                    </div>
                    <span className="shrink-0 text-slate-400" aria-hidden>
                      <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                      </svg>
                    </span>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
