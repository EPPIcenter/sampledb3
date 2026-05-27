import { useState } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { useHotkey } from '../hooks/useHotkey'
import { controlsApi } from '../lib/api/controls'
import { controlKeys, useControlBatchSummary } from '../hooks/useControls'
import EntityBreadcrumbs from '../components/EntityBreadcrumbs'
import SimpleTimeline from '../components/SimpleTimeline'
import { getContainerTypeIcon, getContainerTypeName } from '../lib/icons'
import SpecimenForm from '../components/forms/SpecimenForm'
import ModalPortal from '../components/ModalPortal'
import { useUser } from '../contexts/UserContext'
import { DetailPageSkeleton, PageError, fromQuery, getQueryErrorMessage } from '../ui'
import '../styles/blood-controls.css'

export default function ControlBatchDetail() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { canWrite } = useUser()
  const batchId = id != null ? parseInt(id, 10) : NaN
  const summaryQuery = useControlBatchSummary(batchId)
  const summaryStatus = fromQuery(summaryQuery)
  const summaryData = summaryQuery.data ?? null
  const [createSpecimenModalOpen, setCreateSpecimenModalOpen] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [editing, setEditing] = useState(false)
  const [editName, setEditName] = useState('')
  const [editProductionDate, setEditProductionDate] = useState('')
  const [saving, setSaving] = useState(false)

  const refreshSummary = () => {
    void queryClient.invalidateQueries({ queryKey: controlKeys.batchSummary(batchId) })
  }

  // Close modal on Escape
  useHotkey('escape', () => {
    if (createSpecimenModalOpen) {
      setCreateSpecimenModalOpen(false)
    }
  }, { enabled: createSpecimenModalOpen, enableOnFormTags: true })

  const handleDeleteBatch = async () => {
    if (!summaryData) return

    if (!window.confirm(`Are you sure you want to delete batch "${summaryData.batch.name}"? This will delete all associated specimens and containers. This action cannot be undone.`)) {
      return
    }

    setDeleting(true)
    try {
      await controlsApi.deleteBatch(summaryData.batch.id)
      navigate('/blood-controls?tab=batches')
    } catch (err: any) {
      console.error('Failed to delete batch:', err)
      alert(err.response?.data?.error || 'Failed to delete batch. It may be in use.')
      setDeleting(false)
    }
  }

  const handleDeleteSpecimen = async (specimenId: number) => {
    if (!summaryData) return
    if (!window.confirm('Are you sure you want to delete this specimen and all its containers? This action cannot be undone.')) return
    try {
      await controlsApi.deleteSpecimenFromBatch(summaryData.batch.id, specimenId)
      refreshSummary()
    } catch (err: any) {
      alert(err.response?.data?.error || 'Failed to delete specimen')
    }
  }

  const handleStartEdit = () => {
    if (!summaryData) return
    setEditName(summaryData.batch.name)
    setEditProductionDate(summaryData.batch.productionDate || '')
    setEditing(true)
  }

  const handleCancelEdit = () => {
    setEditing(false)
  }

  const handleSaveEdit = async () => {
    if (!summaryData) return
    setSaving(true)
    try {
      const updates: { name?: string; productionDate?: string } = {}
      if (editName !== summaryData.batch.name) updates.name = editName
      if (editProductionDate !== (summaryData.batch.productionDate || '')) updates.productionDate = editProductionDate
      if (Object.keys(updates).length === 0) {
        setEditing(false)
        return
      }
      await controlsApi.updateBatch(summaryData.batch.id, updates)
      setEditing(false)
      refreshSummary()
    } catch (err: any) {
      alert(err.response?.data?.error || 'Failed to update batch')
    } finally {
      setSaving(false)
    }
  }

  if (summaryStatus === 'loading') {
    return (
      <div className="blood-controls-page">
        <DetailPageSkeleton sections={1} />
      </div>
    )
  }

  if (summaryStatus === 'error') {
    return (
      <div className="blood-controls-page">
        <div className="container mx-auto px-4 py-8 relative z-[1]">
          <PageError
            title="Could not load batch"
            message={getQueryErrorMessage(summaryQuery.error, 'Failed to load batch summary')}
            onRetry={() => void summaryQuery.refetch()}
          />
        </div>
      </div>
    )
  }

  if (!summaryData) {
    return (
      <div className="blood-controls-page">
        <div className="container mx-auto px-4 py-8 relative z-[1]">
          <div className="text-center py-8 text-app-trend-down">Control batch not found</div>
        </div>
      </div>
    )
  }

  const getTypeBadgeClass = (type: string) => {
    switch (type) {
      case 'plasma_positive':
      case 'blood':
        return 'blood-controls-badge'
      case 'plasma_negative':
      case 'negative':
        return 'blood-controls-badge'
      default:
        return 'blood-controls-badge'
    }
  }

  const { batch, specimens, summary } = summaryData
  const definition = batch.definition
  const composition = batch.composition

  const formatInventorySummary = () => {
    if (!summary.inventory || summary.inventory.length === 0) return null

    return (
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {summary.inventory.map((item: { type: string; unit: string; remainingQuantity: number; totalQuantity: number; containerCount: number }, index: number) => {
          const name = getContainerTypeName(item.type)
          const isExhausted = item.remainingQuantity <= 0
          return (
            <div key={`${item.type}-${item.unit}-${index}`} className="dashboard-card rounded-xl p-4 transition-shadow hover:shadow-md">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-3">
                  <div className={`p-2 rounded-lg ${isExhausted ? 'opacity-60' : ''}`} style={{ background: isExhausted ? 'rgb(var(--app-border))' : 'rgb(var(--app-accent-muted))', color: isExhausted ? 'rgb(var(--app-text-muted))' : 'rgb(var(--app-accent-hover))' }}>
                    {getContainerTypeIcon(item.type)}
                  </div>
                  <div>
                    <span className="font-bold block leading-tight" style={{ color: 'rgb(var(--app-text))' }}>{name}s</span>
                    <span className="text-[10px] uppercase font-bold tracking-wider" style={{ color: 'rgb(var(--app-text-muted))' }}>{item.containerCount} containers</span>
                  </div>
                </div>
                <span className="text-[10px] font-bold px-2 py-1 rounded-md border" style={isExhausted ? { background: 'rgb(var(--app-badge-bg))', color: 'rgb(var(--app-badge))', borderColor: 'rgb(var(--app-badge) / 0.3)' } : { background: 'rgb(var(--app-trend-up) / 0.1)', color: 'rgb(var(--app-trend-up))', borderColor: 'rgb(var(--app-trend-up) / 0.3)' }}>
                  {isExhausted ? 'EXHAUSTED' : 'IN STOCK'}
                </span>
              </div>
              <div className="grid grid-cols-2 gap-4 mb-4">
                <div className="space-y-0.5">
                  <span className="text-[10px] uppercase font-bold" style={{ color: 'rgb(var(--app-text-muted))' }}>Total Volume</span>
                  <p className="text-sm font-semibold" style={{ color: 'rgb(var(--app-text))' }}>{item.totalQuantity.toLocaleString()} {item.unit}</p>
                </div>
                <div className="space-y-0.5 text-right">
                  <span className="text-[10px] uppercase font-bold" style={{ color: 'rgb(var(--app-text-muted))' }}>Available</span>
                  <p className="text-sm font-bold" style={{ color: isExhausted ? 'rgb(var(--app-trend-down))' : 'rgb(var(--app-trend-up))' }}>
                    {item.remainingQuantity.toLocaleString()} {item.unit}
                  </p>
                </div>
              </div>
              {!isExhausted && (
                <div className="w-full rounded-full h-1.5 mb-4" style={{ background: 'rgb(var(--app-border))' }}>
                  <div
                    className="h-1.5 rounded-full"
                    style={{ width: `${Math.min(100, (item.remainingQuantity / item.totalQuantity) * 100)}%`, background: 'rgb(var(--app-trend-up))' }}
                  />
                </div>
              )}
            </div>
          )
        })}
      </div>
    )
  }

  return (
    <div className="blood-controls-page">
      <div className="container mx-auto px-4 py-8 relative z-[1]">
        <div className="mb-6 blood-controls-reveal blood-controls-reveal-1">
          <EntityBreadcrumbs
            items={[
              { label: 'Blood Controls', to: '/blood-controls' },
              ...(definition ? [{ label: definition.name, to: `/blood-controls/${definition.id}` }] : []),
              { label: batch.name },
            ]}
          />
          <div className="flex items-center justify-between">
            <div>
              {editing ? (
                <div className="space-y-2">
                  <input
                    type="text"
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    className="text-2xl font-bold bg-app-surface border border-app-border rounded px-2 py-1"
                    style={{ color: 'rgb(var(--app-text))' }}
                    autoFocus
                  />
                  <div className="flex items-center gap-2">
                    <label className="text-sm" style={{ color: 'rgb(var(--app-text-muted))' }}>Production Date:</label>
                    <input
                      type="date"
                      value={editProductionDate}
                      onChange={(e) => setEditProductionDate(e.target.value)}
                      className="text-sm bg-app-surface border border-app-border rounded px-2 py-1"
                      style={{ color: 'rgb(var(--app-text))' }}
                    />
                  </div>
                  <div className="flex gap-2">
                    <button onClick={handleSaveEdit} disabled={saving || !editName.trim()} className="blood-controls-btn-primary px-3 py-1 text-sm">
                      {saving ? 'Saving...' : 'Save'}
                    </button>
                    <button onClick={handleCancelEdit} disabled={saving} className="blood-controls-btn-secondary px-3 py-1 text-sm">
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <>
                  <h1 className="text-3xl font-bold">{batch.name}</h1>
                  {definition && (
                    <div className="flex items-center gap-2 mt-1">
                      <span style={{ color: 'rgb(var(--app-text-muted))' }}>Definition:</span>
                      <Link to={`/blood-controls/${definition.id}`} className="dashboard-link font-medium">{definition.name}</Link>
                      <span className={getTypeBadgeClass(definition.controlType)}>
                        {definition.controlType.replace('_', ' ')}
                      </span>
                    </div>
                  )}
                  {batch.productionDate && (
                    <p className="text-sm mt-1" style={{ color: 'rgb(var(--app-text-muted))' }}>
                      Production Date: {new Date(batch.productionDate).toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' })}
                    </p>
                  )}
                </>
              )}
            </div>
            {canWrite && !editing && (
              <div className="flex space-x-3">
                <button onClick={handleStartEdit} className="blood-controls-btn-secondary px-4 py-2">
                  Edit
                </button>
                <button onClick={() => navigate(`/blood-controls/batches/${batch.id}/add-specimens`)} className="blood-controls-btn-primary px-4 py-2">
                  Add Specimens
                </button>
                <button onClick={() => setCreateSpecimenModalOpen(true)} className="blood-controls-btn-primary px-4 py-2">
                  Add Single Specimen
                </button>
                <button onClick={handleDeleteBatch} disabled={deleting} className="blood-controls-btn-danger px-4 py-2">
                  {deleting ? 'Deleting...' : 'Delete Batch'}
                </button>
              </div>
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          <div className="lg:col-span-1 space-y-8">
            <div className="dashboard-card p-6 blood-controls-reveal blood-controls-reveal-2">
              <h2 className="blood-controls-section-title mb-4">Definition Details</h2>
              <div className="space-y-6">
                {definition?.description && (
                  <div>
                    <p className="text-sm mb-1" style={{ color: 'rgb(var(--app-text-muted))' }}>Description</p>
                    <p className="text-sm leading-relaxed" style={{ color: 'rgb(var(--app-text))' }}>{definition.description}</p>
                  </div>
                )}
                <div>
                  <p className="text-sm" style={{ color: 'rgb(var(--app-text-muted))' }}>Target Density</p>
                  <p className="font-medium" style={{ color: 'rgb(var(--app-text))' }}>
                    {definition?.targetDensity ? (
                      <>
                        {definition.targetDensity.toLocaleString()} <span className="text-sm" style={{ color: 'rgb(var(--app-text-muted))' }}>{definition.unitSymbol}</span>
                      </>
                    ) : (
                      'Not specified'
                    )}
                  </p>
                </div>
                {composition && (
                  <div className="pt-6 border-t" style={{ borderColor: 'rgb(var(--app-border))' }}>
                    <h3 className="text-sm font-semibold mb-1" style={{ color: 'rgb(var(--app-text))' }}>Composition</h3>
                    <p className="text-xs mb-4 font-medium" style={{ color: 'rgb(var(--app-text-muted))' }}>{composition.label}</p>
                    <div className="space-y-4">
                      {composition.strains.map((s) => (
                        <div key={s.id} className="space-y-1.5">
                          <div className="flex justify-between text-sm">
                            <span className="font-medium" style={{ color: 'rgb(var(--app-text))' }}>{s.name}</span>
                            <span className="font-bold" style={{ color: 'rgb(var(--app-text))' }}>{s.percentage}%</span>
                          </div>
                          <div className="w-full rounded-full h-1.5" style={{ background: 'rgb(var(--app-border))' }}>
                            <div className="h-1.5 rounded-full transition-all duration-500" style={{ width: `${s.percentage}%`, background: 'rgb(var(--app-accent))' }} />
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                {batch.properties && Object.keys(batch.properties).length > 0 && (
                  <div className="pt-6 border-t" style={{ borderColor: 'rgb(var(--app-border))' }}>
                    <h3 className="text-sm font-semibold mb-2" style={{ color: 'rgb(var(--app-text))' }}>Batch Properties</h3>
                    <div className="rounded-lg p-3 space-y-2 border" style={{ background: 'rgb(var(--app-surface))', borderColor: 'rgb(var(--app-border))' }}>
                      {Object.entries(batch.properties).map(([key, value]) => (
                        <div key={key} className="flex justify-between text-xs">
                          <span className="capitalize" style={{ color: 'rgb(var(--app-text-muted))' }}>{key.replace('_', ' ')}</span>
                          <span className="font-medium" style={{ color: 'rgb(var(--app-text))' }}>{String(value)}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>

          <div className="lg:col-span-2 space-y-8">
            <div className="dashboard-card p-6 blood-controls-reveal blood-controls-reveal-3">
              <div className="flex items-center justify-between mb-4">
                <h2 className="blood-controls-section-title">Stock & Availability</h2>
                <div className="flex items-center gap-1.5 px-2 py-1 rounded-full border" style={{ background: 'rgb(var(--app-trend-up) / 0.1)', color: 'rgb(var(--app-trend-up))', borderColor: 'rgb(var(--app-trend-up) / 0.3)' }}>
                  <span className="w-2 h-2 rounded-full animate-pulse" style={{ background: 'rgb(var(--app-trend-up))' }} />
                  <span className="text-xs font-bold uppercase tracking-tight">
                    {(summary.totalRemainingQuantity || 0).toLocaleString()} units in stock
                  </span>
                </div>
              </div>
              {formatInventorySummary()}
            </div>

            {specimens.length > 0 && (
              <div className="dashboard-card overflow-hidden blood-controls-reveal blood-controls-reveal-4">
                <div className="px-6 py-4 border-b flex items-center justify-between" style={{ borderColor: 'rgb(var(--app-border))', background: 'rgb(var(--app-surface))' }}>
                  <h2 className="text-lg font-semibold" style={{ color: 'rgb(var(--app-text))' }}>Associated Specimens</h2>
                  <span className="text-xs font-bold uppercase tracking-widest" style={{ color: 'rgb(var(--app-text-muted))' }}>{specimens.length} Records</span>
                </div>
                <div className="p-4">
                  <SimpleTimeline specimens={specimens} />
                  {canWrite && (
                    <div className="mt-4 pt-4 border-t space-y-2" style={{ borderColor: 'rgb(var(--app-border))' }}>
                      <p className="text-xs font-medium" style={{ color: 'rgb(var(--app-text-muted))' }}>Remove specimens</p>
                      {specimens.map((s) => (
                        <div key={s.id} className="flex items-center justify-between text-sm py-1">
                          <span style={{ color: 'rgb(var(--app-text))' }}>
                            {s.specimenTypeName || `Specimen #${s.id}`}
                            {s.collectionDate && <span className="ml-2 text-xs" style={{ color: 'rgb(var(--app-text-muted))' }}>{s.collectionDate}</span>}
                          </span>
                          <button
                            onClick={() => handleDeleteSpecimen(s.id)}
                            className="text-xs px-2 py-0.5 rounded hover:opacity-80"
                            style={{ color: 'rgb(var(--app-trend-down))', border: '1px solid rgb(var(--app-trend-down) / 0.3)' }}
                          >
                            Delete
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>

        {createSpecimenModalOpen && (
          <ModalPortal>
            <div className="fixed inset-0 z-[100] overflow-y-auto blood-controls-modal-overlay">
              <div className="flex items-center justify-center min-h-screen px-4 pt-4 pb-20 text-center sm:block sm:p-0">
                <div className="fixed inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setCreateSpecimenModalOpen(false)} />
              <div className="relative z-10 inline-block align-bottom blood-controls-modal-panel text-left overflow-hidden transform transition-all sm:my-8 sm:align-middle sm:max-w-3xl sm:w-full max-h-[90vh] overflow-y-auto">
                <div className="px-4 pt-5 pb-4 sm:p-6 sm:pb-4">
                  <div className="flex items-center justify-between mb-4">
                    <h2 className="text-lg font-semibold" style={{ color: 'rgb(var(--app-text))' }}>Add Specimen</h2>
                    <button
                      type="button"
                      className="rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2"
                      style={{ color: 'rgb(var(--app-text-muted))' }}
                      onClick={() => setCreateSpecimenModalOpen(false)}
                      aria-label="Close"
                    >
                      ✕
                    </button>
                  </div>
                  <SpecimenForm
                    controlBatchId={batch.id}
                    controlBatchName={batch.name}
                    onSuccess={() => {
                      setCreateSpecimenModalOpen(false)
                      refreshSummary()
                    }}
                    onCancel={() => setCreateSpecimenModalOpen(false)}
                  />
                </div>
              </div>
            </div>
          </div>
          </ModalPortal>
        )}
      </div>
    </div>
  )
}


