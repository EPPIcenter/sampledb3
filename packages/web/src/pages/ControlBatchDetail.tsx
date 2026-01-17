import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useHotkey } from '../hooks/useHotkey'
import { controlsApi, type ControlBatchSummaryResponse } from '../lib/api'
import EntityBreadcrumbs from '../components/EntityBreadcrumbs'
import SimpleTimeline from '../components/SimpleTimeline'
import { getContainerTypeIcon, getContainerTypeName } from '../lib/icons'
import SpecimenForm from '../components/forms/SpecimenForm'
import SkeletonDetailPage from '../components/SkeletonDetailPage'
import { useUser } from '../contexts/UserContext'

export default function ControlBatchDetail() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { canWrite } = useUser()
  const [summaryData, setSummaryData] = useState<ControlBatchSummaryResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [createSpecimenModalOpen, setCreateSpecimenModalOpen] = useState(false)
  const [deleting, setDeleting] = useState(false)

  useEffect(() => {
    if (id) {
      loadSummary()
    }
  }, [id])

  // Close modal on Escape
  useHotkey('escape', () => {
    if (createSpecimenModalOpen) {
      setCreateSpecimenModalOpen(false)
    }
  }, { enabled: createSpecimenModalOpen, enableOnFormTags: true })

  const loadSummary = async () => {
    try {
      setLoading(true)
      setError(null)
      const response = await controlsApi.getBatchSummary(parseInt(id!))
      setSummaryData(response.data)
    } catch (err: any) {
      console.error('Failed to load batch summary:', err)
      setError(err.response?.data?.error || 'Failed to load batch summary')
    } finally {
      setLoading(false)
    }
  }

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

  if (loading) {
    return <SkeletonDetailPage sections={1} />
  }

  if (error || !summaryData) {
    return (
      <div className="container mx-auto px-4 py-8">
        <div className="text-center py-8 text-red-600">
          {error || 'Control batch not found'}
        </div>
      </div>
    )
  }

  const getTypeBadgeColor = (type: string) => {
    switch (type) {
      case 'plasma_positive':
      case 'blood':
        return 'bg-emerald-50 text-emerald-700 border-emerald-200'
      case 'plasma_negative':
      case 'negative':
        return 'bg-rose-50 text-red-700 border-rose-200'
      case 'extraction':
        return 'bg-purple-50 text-purple-700 border-purple-200'
      case 'antibody':
        return 'bg-sky-50 text-blue-700 border-sky-200'
      default:
        return 'bg-slate-50 text-slate-700 border-slate-200'
    }
  }

  const { batch, specimens, summary } = summaryData
  const definition = batch.definition
  const composition = batch.composition

  const formatInventorySummary = () => {
    if (!summary.inventory || summary.inventory.length === 0) return null

    return (
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {summary.inventory.map((item: any, index) => {
          const name = getContainerTypeName(item.type)
          const isExhausted = item.remainingQuantity <= 0
          
          return (
            <div key={`${item.type}-${item.unit}-${index}`} className="bg-white rounded-xl p-4 border border-gray-100 shadow-sm hover:shadow-md transition-shadow">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-3">
                  <div className={`p-2 rounded-lg ${isExhausted ? 'bg-gray-100 text-gray-400' : 'bg-blue-50 text-blue-600'}`}>
                    {getContainerTypeIcon(item.type)}
                  </div>
                  <div>
                    <span className="font-bold text-gray-900 block leading-tight">{name}s</span>
                    <span className="text-[10px] text-gray-400 uppercase font-bold tracking-wider">{item.containerCount} containers</span>
                  </div>
                </div>
                <span className={`text-[10px] font-bold px-2 py-1 rounded-md border ${
                  isExhausted ? 'bg-red-50 text-red-600 border-red-100' : 'bg-green-50 text-green-600 border-green-100'
                }`}>
                  {isExhausted ? 'EXHAUSTED' : 'IN STOCK'}
                </span>
              </div>
              
              <div className="grid grid-cols-2 gap-4 mb-4">
                <div className="space-y-0.5">
                  <span className="text-[10px] text-gray-400 uppercase font-bold">Total Volume</span>
                  <p className="text-sm font-semibold text-gray-700">{item.totalQuantity.toLocaleString()} {item.unit}</p>
                </div>
                <div className="space-y-0.5 text-right">
                  <span className="text-[10px] text-gray-400 uppercase font-bold">Available</span>
                  <p className={`text-sm font-bold ${isExhausted ? 'text-red-600' : 'text-green-600'}`}>
                    {item.remainingQuantity.toLocaleString()} {item.unit}
                  </p>
                </div>
              </div>

              {!isExhausted && (
                <div className="w-full bg-gray-100 rounded-full h-1.5 mb-4">
                  <div 
                    className="bg-green-500 h-1.5 rounded-full shadow-[0_0_8px_rgba(34,197,94,0.4)]" 
                    style={{ width: `${Math.min(100, (item.remainingQuantity / item.totalQuantity) * 100)}%` }}
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
    <div className="container mx-auto px-4 py-8">
      <div className="mb-6">
        <EntityBreadcrumbs
          items={[
            { label: 'Blood Controls', to: '/blood-controls' },
            ...(definition ? [{ label: definition.name, to: `/blood-controls/${definition.id}` }] : []),
            { label: batch.name },
          ]}
        />
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">{batch.name}</h1>
            {definition && (
              <div className="flex items-center gap-2 mt-1">
                <span className="text-gray-500">Definition:</span>
                <span className="text-blue-600 font-medium">{definition.name}</span>
                <span className={`px-2 py-0.5 rounded text-[10px] font-bold border uppercase tracking-wider ${getTypeBadgeColor(definition.controlType)}`}>
                  {definition.controlType.replace('_', ' ')}
                </span>
              </div>
            )}
            {batch.productionDate && (
              <p className="text-gray-500 text-sm mt-1">
                Production Date: {new Date(batch.productionDate).toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' })}
              </p>
            )}
          </div>
          {canWrite && (
            <div className="flex space-x-3">
              <button
                onClick={() => navigate(`/blood-controls/batches/${batch.id}/add-specimens`)}
                className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 font-medium shadow-sm"
              >
                Add Specimens
              </button>
              <button
                onClick={() => setCreateSpecimenModalOpen(true)}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium shadow-sm"
              >
                Add Single Specimen
              </button>
              <button
                onClick={handleDeleteBatch}
                disabled={deleting}
                className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed font-medium shadow-sm"
              >
                {deleting ? 'Deleting...' : 'Delete Batch'}
              </button>
            </div>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">

        {/* Sidebar: Definition & Composition */}
        <div className="lg:col-span-1 space-y-8">
          <div className="bg-white rounded-lg shadow p-6 border border-gray-100">
            <h2 className="text-xl font-semibold mb-4 text-gray-900">Definition Details</h2>
            <div className="space-y-6">
              {definition?.description && (
                <div>
                  <p className="text-sm text-gray-500 mb-1">Description</p>
                  <p className="text-gray-900 text-sm leading-relaxed">{definition.description}</p>
                </div>
              )}
              
              <div>
                <p className="text-sm text-gray-500">Target Density</p>
                <p className="text-gray-900 font-medium">
                  {definition?.targetDensity ? (
                    <>
                      {definition.targetDensity.toLocaleString()} <span className="text-gray-500 text-sm">{definition.unitSymbol}</span>
                    </>
                  ) : (
                    'Not specified'
                  )}
                </p>
              </div>

              {composition && (
                <div className="pt-6 border-t border-gray-100">
                  <h3 className="text-sm font-semibold text-gray-900 mb-1">Composition</h3>
                  <p className="text-xs text-gray-500 mb-4 font-medium">{composition.label}</p>
                  <div className="space-y-4">
                    {composition.strains.map((s) => (
                      <div key={s.id} className="space-y-1.5">
                        <div className="flex justify-between text-sm">
                          <span className="text-gray-700 font-medium">{s.name}</span>
                          <span className="text-gray-900 font-bold">{s.percentage}%</span>
                        </div>
                        <div className="w-full bg-gray-100 rounded-full h-1.5">
                          <div 
                            className="bg-blue-500 h-1.5 rounded-full transition-all duration-500" 
                            style={{ width: `${s.percentage}%` }}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {batch.properties && Object.keys(batch.properties).length > 0 && (
                <div className="pt-6 border-t border-gray-100">
                  <h3 className="text-sm font-semibold text-gray-900 mb-2">Batch Properties</h3>
                  <div className="bg-gray-50 rounded-lg p-3 space-y-2 border border-gray-100">
                    {Object.entries(batch.properties)
                      .map(([key, value]) => (
                        <div key={key} className="flex justify-between text-xs">
                          <span className="text-gray-500 capitalize">{key.replace('_', ' ')}</span>
                          <span className="text-gray-900 font-medium">{String(value)}</span>
                        </div>
                      ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Main Content: Stock & Specimens */}
        <div className="lg:col-span-2 space-y-8">
          {/* Stock & Availability Section */}
          <div className="bg-white rounded-lg shadow p-6 border border-gray-100">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-semibold text-gray-900">Stock & Availability</h2>
              <div className="flex items-center gap-1.5 px-2 py-1 bg-green-50 rounded-full border border-green-100">
                <span className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></span>
                <span className="text-green-700 text-xs font-bold uppercase tracking-tight">
                  {(summary.totalRemainingQuantity || 0).toLocaleString()} units in stock
                </span>
              </div>
            </div>

            {formatInventorySummary()}
          </div>

          {/* Enriched Timeline View */}
          {specimens.length > 0 && (
            <div className="bg-white rounded-lg shadow overflow-hidden border border-gray-100">
              <div className="px-6 py-4 border-b border-gray-100 bg-gray-50 flex items-center justify-between">
                <h2 className="text-lg font-semibold text-gray-900">Associated Specimens</h2>
                <span className="text-xs font-bold text-gray-400 uppercase tracking-widest">{specimens.length} Records</span>
              </div>
              <div className="p-4">
                <SimpleTimeline specimens={specimens} />
              </div>
            </div>
          )}
        </div>
      </div>

      {createSpecimenModalOpen && (
        <div className="fixed inset-0 z-[100] overflow-y-auto">
          <div className="flex items-center justify-center min-h-screen px-4 pt-4 pb-20 text-center sm:block sm:p-0">
            <div
              className="fixed inset-0 transition-opacity bg-gray-900/40 backdrop-blur-md"
              onClick={() => setCreateSpecimenModalOpen(false)}
            />
            <div className="relative z-10 inline-block align-bottom bg-white rounded-lg text-left overflow-hidden shadow-xl transform transition-all sm:my-8 sm:align-middle sm:max-w-3xl sm:w-full max-h-[90vh] overflow-y-auto">
              <div className="bg-white px-4 pt-5 pb-4 sm:p-6 sm:pb-4">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-gray-900">Add Specimen</h2>
              <button
                type="button"
                className="text-gray-500 hover:text-gray-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 rounded"
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
                loadSummary()
              }}
              onCancel={() => setCreateSpecimenModalOpen(false)}
            />
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}


