import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { qpcrExperimentsApi, type QpcrExperiment } from '../lib/api'
import EntityBreadcrumbs from '../components/EntityBreadcrumbs'
import SkeletonDetailPage from '../components/SkeletonDetailPage'
import { useUser } from '../contexts/UserContext'

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
    return <SkeletonDetailPage sections={1} />
  }

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="mb-6">
        <div className="flex items-center justify-between">
          <div>
            <EntityBreadcrumbs items={[{ label: 'qPCR Experiments' }]} />
            <h1 className="text-3xl font-bold text-gray-900 mt-2 mb-2">qPCR Experiments</h1>
            <p className="text-gray-600">
              Create experiments, upload plate layouts, download machine templates, and import run results.
            </p>
          </div>
          {canWrite && (
            <Link
              to="/qpcr-experiments/new"
              className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors"
            >
              New Experiment
            </Link>
          )}
        </div>
      </div>

      {error && (
        <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-md text-red-700">
          {error}
        </div>
      )}

      <div className="bg-white rounded-lg border border-gray-100 overflow-hidden">
        {experiments.length === 0 ? (
          <div className="text-center py-12 text-gray-500">
            No qPCR experiments yet. {canWrite && 'Create one to get started.'}
          </div>
        ) : (
          <ul className="divide-y divide-gray-100">
            {experiments.map((exp) => (
              <li key={exp.id}>
                <Link
                  to={`/qpcr-experiments/${exp.id}`}
                  className="block px-4 py-3 hover:bg-gray-50 transition-colors"
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <span className="font-medium text-gray-900">
                        {exp.name ?? `Experiment ${exp.id}`}
                      </span>
                      <span className="ml-2 text-sm text-gray-500">
                        {exp.templateFormat === 'biorad' ? 'Biorad CFX' : 'QuantStudio'} · {exp.status}
                      </span>
                    </div>
                    <span className="text-gray-400">→</span>
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
