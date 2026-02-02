import { useState } from 'react'
import { useNavigate, Navigate } from 'react-router-dom'
import { qpcrExperimentsApi } from '../lib/api'
import EntityBreadcrumbs from '../components/EntityBreadcrumbs'
import { useUser } from '../contexts/UserContext'
import '../styles/qpcr.css'

export default function QpcrExperimentNew() {
  const navigate = useNavigate()
  const { canWrite } = useUser()
  const [name, setName] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  if (!canWrite) {
    return <Navigate to="/qpcr-experiments" replace />
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSubmitting(true)
    setError(null)
    try {
      const res = await qpcrExperimentsApi.create({
        name: name.trim() || null,
        templateFormat: 'biorad',
      })
      navigate(`/qpcr-experiments/${res.data.id}`)
    } catch (err: unknown) {
      const msg = err && typeof err === 'object' && 'response' in err
        ? (err as { response?: { data?: { error?: string } } }).response?.data?.error
        : 'Failed to create experiment'
      setError(msg ?? 'Failed to create experiment')
    } finally {
      setSubmitting(false)
    }
  }

  if (!canWrite) {
    return null
  }

  return (
    <div className="qpcr-theme min-h-screen bg-gradient-to-b from-slate-50 to-white">
      <div className="container mx-auto px-4 py-8 max-w-xl">
        <div className="mb-8">
          <EntityBreadcrumbs
            items={[
              { label: 'qPCR Experiments', to: '/qpcr-experiments' },
              { label: 'New Experiment' },
            ]}
          />
          <div className="mt-4 flex items-center gap-3">
            <div
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-teal-100 text-teal-600"
              aria-hidden
            >
              <svg
                className="h-5 w-5"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 6v6m0 0v6m0-6h6m-6 0H6"
                />
              </svg>
            </div>
            <div>
              <h1 className="text-2xl font-semibold text-slate-800 tracking-tight">
                New qPCR Experiment
              </h1>
              <p className="text-sm text-slate-600 mt-0.5">
                Create an experiment, then upload your plate layout to get started.
              </p>
            </div>
          </div>
        </div>

        <div className="qpcr-card p-6">
          <form onSubmit={handleSubmit} className="space-y-5">
            {error && (
              <div
                className="p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm"
                role="alert"
              >
                {error}
              </div>
            )}
            <div>
              <label htmlFor="name" className="block text-sm font-medium text-slate-700 mb-1.5">
                Name (optional)
              </label>
              <input
                id="name"
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="qpcr-input"
                placeholder="e.g. varATS-IM-25-048"
              />
            </div>
            <div className="flex gap-3 pt-1">
              <button
                type="submit"
                disabled={submitting}
                className="qpcr-btn-primary"
              >
                {submitting ? 'Creating…' : 'Create and set up plate'}
              </button>
              <button
                type="button"
                onClick={() => navigate('/qpcr-experiments')}
                className="qpcr-btn-secondary"
              >
                Cancel
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  )
}
