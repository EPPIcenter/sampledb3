import { useState } from 'react'
import { useNavigate, Navigate } from 'react-router-dom'
import EntityBreadcrumbs from '../components/EntityBreadcrumbs'
import { useCreateQpcrExperiment } from '../hooks/useQpcrExperiments'
import { useUser } from '../contexts/UserContext'
import '../styles/qpcr.css'

export default function QpcrExperimentNew() {
  const navigate = useNavigate()
  const { canWrite } = useUser()
  const [name, setName] = useState('')
  const createExperiment = useCreateQpcrExperiment()
  const [error, setError] = useState<string | null>(null)

  if (!canWrite) {
    return <Navigate to="/qpcr-experiments" replace />
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    try {
      const res = await createExperiment.mutateAsync({
        name: name.trim() || null,
        templateFormat: 'biorad',
      })
      navigate(`/qpcr-experiments/${res.id}`)
    } catch (err: unknown) {
      const msg = err && typeof err === 'object' && 'response' in err
        ? (err as { response?: { data?: { error?: string } } }).response?.data?.error
        : 'Failed to create experiment'
      setError(msg ?? 'Failed to create experiment')
    }
  }

  return (
    <div className="qpcr-theme qpcr-page-bg">
      <div className="container mx-auto px-4 py-8 max-w-3xl">
        <EntityBreadcrumbs
          items={[
            { label: 'qPCR Experiments', to: '/qpcr-experiments' },
            { label: 'New Experiment' },
          ]}
        />

        <header className="mt-6 mb-8">
          <div className="flex items-start gap-4">
            <div
              className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-app-accent-muted text-app-accent-on-tint"
              aria-hidden
            >
              <svg
                className="h-6 w-6"
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
            <div className="min-w-0">
              <h1 className="text-2xl font-semibold text-app-text tracking-tight">
                New qPCR Experiment
              </h1>
              <p className="mt-1 text-sm text-app-text-muted">
                Create an experiment, then upload your plate layout to get started.
              </p>
            </div>
          </div>
        </header>

        <div className="qpcr-card qpcr-reveal p-6">
          <form onSubmit={handleSubmit} className="space-y-5">
            {error && (
              <div
                className="rounded-lg border border-app-trend-down bg-app-trend-down/10 p-3 text-sm text-app-trend-down"
                role="alert"
              >
                {error}
              </div>
            )}
            <div>
              <label htmlFor="name" className="mb-1.5 block text-sm font-medium text-app-text">
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
            <div className="flex flex-wrap gap-3 pt-1">
              <button
                type="submit"
                disabled={createExperiment.isPending}
                className="qpcr-btn-primary"
              >
                {createExperiment.isPending ? 'Creating…' : 'Create and set up plate'}
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
