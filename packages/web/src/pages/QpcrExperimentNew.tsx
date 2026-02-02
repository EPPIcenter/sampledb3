import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { qpcrExperimentsApi } from '../lib/api'
import EntityBreadcrumbs from '../components/EntityBreadcrumbs'
import { useUser } from '../contexts/UserContext'

export default function QpcrExperimentNew() {
  const navigate = useNavigate()
  const { canWrite } = useUser()
  const [name, setName] = useState('')
  const [templateFormat, setTemplateFormat] = useState<'biorad' | 'quant_studio'>('biorad')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!canWrite) {
      navigate('/qpcr-experiments', { replace: true })
    }
  }, [canWrite, navigate])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSubmitting(true)
    setError(null)
    try {
      const res = await qpcrExperimentsApi.create({
        name: name.trim() || null,
        templateFormat,
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
    <div className="container mx-auto px-4 py-8">
      <div className="mb-6">
        <EntityBreadcrumbs
          items={[
            { label: 'qPCR Experiments', to: '/qpcr-experiments' },
            { label: 'New Experiment' },
          ]}
        />
        <h1 className="text-3xl font-bold text-gray-900 mt-2">New qPCR Experiment</h1>
      </div>

      <div className="bg-white rounded-lg shadow p-6 max-w-xl">
        <form onSubmit={handleSubmit} className="space-y-4">
          {error && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-md text-red-700 text-sm">
              {error}
            </div>
          )}
          <div>
            <label htmlFor="name" className="block text-sm font-medium text-gray-700 mb-1">
              Name (optional)
            </label>
            <input
              id="name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full border border-gray-300 rounded-md px-3 py-2 text-gray-900"
              placeholder="e.g. varATS-IM-25-048"
            />
          </div>
          <div>
            <label htmlFor="templateFormat" className="block text-sm font-medium text-gray-700 mb-1">
              Template format
            </label>
            <select
              id="templateFormat"
              value={templateFormat}
              onChange={(e) => setTemplateFormat(e.target.value as 'biorad' | 'quant_studio')}
              className="w-full border border-gray-300 rounded-md px-3 py-2 text-gray-900"
            >
              <option value="biorad">Biorad CFX (CSV)</option>
              <option value="quant_studio">QuantStudio (XLS/TSV)</option>
            </select>
          </div>
          <div className="flex gap-3 pt-2">
            <button
              type="submit"
              disabled={submitting}
              className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50"
            >
              {submitting ? 'Creating…' : 'Create'}
            </button>
            <button
              type="button"
              onClick={() => navigate('/qpcr-experiments')}
              className="px-4 py-2 border border-gray-300 rounded-md text-gray-700 hover:bg-gray-50"
            >
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
