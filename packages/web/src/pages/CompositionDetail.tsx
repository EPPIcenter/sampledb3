import { useEffect, useState, useMemo } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { controlsApi, type ControlDefinition } from '../lib/api'
import { getCompositionKey } from '../lib/composition-key'
import EntityBreadcrumbs from '../components/EntityBreadcrumbs'
import { useUser } from '../contexts/UserContext'
import { getContainerTypeIcon } from '../lib/icons'
import '../styles/blood-controls.css'

export default function CompositionDetail() {
  const { compositionKey: encodedKey } = useParams<{ compositionKey: string }>()
  const navigate = useNavigate()
  const { canWrite } = useUser()
  const [definitions, setDefinitions] = useState<ControlDefinition[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const compositionKey = useMemo(() => {
    if (!encodedKey) return null
    try {
      return decodeURIComponent(encodedKey)
    } catch {
      return null
    }
  }, [encodedKey])

  useEffect(() => {
    if (!compositionKey) {
      setError('Invalid composition')
      setLoading(false)
      return
    }
    loadDefinitions()
  }, [compositionKey])

  const loadDefinitions = async () => {
    if (!compositionKey) return
    try {
      setLoading(true)
      setError(null)
      const res = await controlsApi.list()
      const all = (res.data.controls ?? []) as ControlDefinition[]
      const key = compositionKey
      const matched = all.filter((def) => {
        const defKey = getCompositionKey((def.strains ?? []).map((s) => ({ id: s.id, percentage: s.percentage })))
        return defKey === key
      })
      setDefinitions(matched.sort((a, b) => (a.targetDensity ?? 0) - (b.targetDensity ?? 0)))
    } catch (err) {
      console.error('Failed to load composition:', err)
      setError('Failed to load composition')
    } finally {
      setLoading(false)
    }
  }

  if (loading) {
    return (
      <div className="blood-controls-page">
        <div className="container mx-auto px-4 py-8 relative z-[1]">
          <div className="animate-pulse space-y-4">
            <div className="h-8 bg-gray-200 rounded w-1/3" />
            <div className="h-4 bg-gray-200 rounded w-2/3" />
            <div className="h-32 bg-gray-200 rounded" />
          </div>
        </div>
      </div>
    )
  }

  if (error || !compositionKey) {
    return (
      <div className="blood-controls-page">
        <div className="container mx-auto px-4 py-8 relative z-[1]">
          <p className="text-red-600">{error || 'Invalid composition'}</p>
          <Link to="/blood-controls" className="blood-controls-btn-secondary mt-4 inline-block">
            Back to Blood Controls
          </Link>
        </div>
      </div>
    )
  }

  if (definitions.length === 0) {
    return (
      <div className="blood-controls-page">
        <div className="container mx-auto px-4 py-8 relative z-[1]">
          <p style={{ color: 'rgb(var(--dashboard-text-muted))' }}>No definitions found for this composition.</p>
          <Link to="/blood-controls" className="blood-controls-btn-secondary mt-4 inline-block">
            Back to Blood Controls
          </Link>
        </div>
      </div>
    )
  }

  const strains = definitions[0].strains ?? []

  return (
    <div className="blood-controls-page">
      <div className="container mx-auto px-4 py-8 max-w-5xl relative z-[1]">
        <EntityBreadcrumbs
          items={[
            { label: 'Blood Controls', to: '/blood-controls' },
            { label: 'Composition' },
          ]}
        />
        <div className="mt-6">
          <h1 className="text-3xl font-bold" style={{ color: 'rgb(var(--dashboard-text))' }}>
            Composition
          </h1>
          <p className="mt-1 text-sm" style={{ color: 'rgb(var(--dashboard-text-muted))' }}>
            Same parasite strain mix; each density variant below is a separate control definition with its own batches.
          </p>
        </div>

        <div className="dashboard-card p-6 mt-8">
          <h2 className="text-lg font-semibold mb-4" style={{ color: 'rgb(var(--dashboard-text))' }}>
            Biological content (parasite strains)
          </h2>
          {strains.length > 0 ? (
            <div className="space-y-4">
              <div className="flex h-3 bg-gray-100 rounded-full overflow-hidden">
                {strains.map((s, idx) => {
                  const pct = s.percentage ?? 0
                  const colors = ['bg-blue-500', 'bg-emerald-500', 'bg-amber-500', 'bg-purple-500', 'bg-rose-500', 'bg-cyan-500']
                  return (
                    <div
                      key={s.id}
                      className={colors[idx % colors.length]}
                      style={{ width: `${pct}%` }}
                      title={`${s.name}: ${pct}%`}
                    />
                  )
                })}
              </div>
              <div className="flex flex-wrap gap-2">
                {strains.map((s) => (
                  <span
                    key={s.id}
                    className="inline-flex items-center px-3 py-1 rounded-md text-sm font-medium bg-blue-50 text-blue-700 border border-blue-100"
                  >
                    {s.name}
                    {s.percentage !== undefined && (
                      <span className="ml-1.5 text-blue-600 font-semibold">({s.percentage}%)</span>
                    )}
                  </span>
                ))}
              </div>
            </div>
          ) : (
            <p className="text-sm italic" style={{ color: 'rgb(var(--dashboard-text-muted))' }}>
              No strain data
            </p>
          )}
        </div>

        {canWrite && (
          <div className="mt-6 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => navigate(`/blood-controls/compositions/${encodeURIComponent(compositionKey)}/batches/new`)}
              className="blood-controls-btn-secondary px-4 py-2 text-sm flex items-center gap-2"
            >
              Add batches from CSV
            </button>
          </div>
        )}

        <div className="mt-8">
          <h2 className="text-lg font-semibold mb-4" style={{ color: 'rgb(var(--dashboard-text))' }}>
            Density variants
          </h2>
          <div className="space-y-4">
            {definitions.map((def) => (
              <div
                key={def.id}
                className="dashboard-card p-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4"
              >
                <div className="flex-1 min-w-0">
                  <Link
                    to={`/blood-controls/${def.id}`}
                    className="dashboard-link font-semibold text-lg hover:underline"
                  >
                    {def.name}
                  </Link>
                  <div className="mt-1 flex flex-wrap items-center gap-3 text-sm" style={{ color: 'rgb(var(--dashboard-text-muted))' }}>
                    <span>
                      Target density: {def.targetDensity != null ? `${def.targetDensity.toLocaleString()} ${def.unitSymbol ?? ''}` : 'N/A'}
                    </span>
                    <span>{def.batchCount ?? 0} batches</span>
                    {(def.spotCount ?? 0) + (def.micronixCount ?? 0) + (def.cryovialCount ?? 0) > 0 && (
                      <span className="flex items-center gap-1.5">
                        {getContainerTypeIcon('paper')}
                        <span>{def.spotCount ?? 0}</span>
                        {getContainerTypeIcon('micronix_tube')}
                        <span>{def.micronixCount ?? 0}</span>
                        {getContainerTypeIcon('cryovial_tube')}
                        <span>{def.cryovialCount ?? 0}</span>
                      </span>
                    )}
                  </div>
                </div>
                {canWrite && (
                  <div className="flex flex-wrap gap-2 shrink-0">
                    <button
                      type="button"
                      onClick={() => navigate(`/blood-controls/${def.id}/batches/new`)}
                      className="blood-controls-btn-primary px-4 py-2 text-sm flex items-center gap-2"
                    >
                      Create batch
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>

        {canWrite && (
          <div className="mt-8 p-4 rounded-lg border" style={{ borderColor: 'rgb(var(--dashboard-border))', background: 'rgb(var(--dashboard-surface))' }}>
            <p className="text-sm" style={{ color: 'rgb(var(--dashboard-text-muted))' }}>
              To add a new density variant for this composition, create a new control definition from Blood Controls and choose the same strain mix with a different target density.
            </p>
          </div>
        )}
      </div>
    </div>
  )
}
