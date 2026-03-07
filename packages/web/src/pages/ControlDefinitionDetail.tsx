import { useEffect, useState } from 'react'
import { useParams, Link, useNavigate } from 'react-router-dom'
import { controlsApi, type ControlDefinitionSummaryResponse } from '../lib/api'
import { useUser } from '../contexts/UserContext'
import EntityBreadcrumbs from '../components/EntityBreadcrumbs'
import DataTable, { Column } from '../components/DataTable'
import StatCard from '../components/StatCard'
import SkeletonDetailPage from '../components/SkeletonDetailPage'
import { getContainerTypeIcon } from '../lib/icons'
import '../styles/blood-controls.css'

export default function ControlDefinitionDetail() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { canWrite } = useUser()
  const [summaryData, setSummaryData] = useState<ControlDefinitionSummaryResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (id) {
      loadSummary()
    }
  }, [id])

  const loadSummary = async () => {
    try {
      setLoading(true)
      setError(null)
      const response = await controlsApi.getDefinitionSummary(parseInt(id!))
      setSummaryData(response.data)
    } catch (err: any) {
      console.error('Failed to load control definition summary:', err)
      setError(err.response?.data?.error || 'Failed to load control definition summary')
    } finally {
      setLoading(false)
    }
  }

  if (loading) {
    return (
      <div className="blood-controls-page">
        <SkeletonDetailPage sections={2} />
      </div>
    )
  }

  if (error || !summaryData) {
    return (
      <div className="blood-controls-page">
        <div className="container mx-auto px-4 py-8 relative z-[1]">
          <div className="text-center py-8" style={{ color: 'rgb(var(--app-trend-down))' }}>
            {error || 'Control definition not found'}
          </div>
        </div>
      </div>
    )
  }

  const { control, composition, batches, stats } = summaryData
  const strains = composition?.strains || []


  const batchColumns: Column<any>[] = [
    {
      key: 'name',
      label: 'Batch Name',
      sortable: true,
      render: (value, row) => (
        <Link to={`/blood-controls/batches/${row.id}`} className="dashboard-link hover:underline font-medium">
          {value}
        </Link>
      ),
    },
    {
      key: 'productionDate',
      label: 'Production Date',
      sortable: true,
      render: (value) => value ? (
        <span className="dashboard-stat-value">{new Date(value).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })}</span>
      ) : <span className="text-app-text-muted italic">Not set</span>,
    },
    {
      key: 'inventoryTotal',
      label: 'Inventory',
      sortable: true,
      render: (_, row) => {
        const hasSpots = (row.spotCount ?? 0) > 0
        const hasMicronix = (row.micronixCount ?? 0) > 0
        const hasCryovial = (row.cryovialCount ?? 0) > 0
        const hasStaticWells = (row.staticWellCount ?? 0) > 0
        const hasAny = hasSpots || hasMicronix || hasCryovial || hasStaticWells
        const badge = (type: string, count: number, label: string, bg: string, text: string, border: string) => (
          <div key={type} className={`flex items-center gap-1.5 px-2 py-1 ${bg} ${text} border ${border} rounded-md`}>
            {getContainerTypeIcon(type)}
            <span className="font-bold">{count}</span>
            <span className="text-[10px] uppercase font-medium">{label}</span>
          </div>
        )
        return (
          <div className="flex flex-wrap gap-2 text-sm">
            {hasSpots && badge('paper', row.spotCount!, 'Spots', 'bg-amber-50', 'text-amber-700', 'border-amber-100')}
            {hasMicronix && badge('micronix_tube', row.micronixCount!, 'Micronix', 'bg-app-accent-muted', 'text-teal-700', 'border-teal-100')}
            {hasCryovial && badge('cryovial_tube', row.cryovialCount!, 'Cryovial', 'bg-app-accent-muted', 'text-app-accent-hover', 'border-blue-100')}
            {hasStaticWells && badge('static_well', row.staticWellCount!, 'Static wells', 'bg-slate-50', 'text-slate-700', 'border-slate-200')}
            {!hasAny && <span className="text-app-text-muted italic">Empty</span>}
          </div>
        )
      }
    },
    {
      key: 'status',
      label: 'Status',
      render: (_, row) => {
        const hasStock = (row.inventoryTotal || 0) > 0
        return (
          <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
            hasStock ? 'bg-app-trend-up/10 text-app-trend-up' : 'bg-app-trend-down/10 text-app-trend-down'
          }`}>
            {hasStock ? 'In Stock' : 'Exhausted'}
          </span>
        )
      },
    },
  ]

  return (
    <div className="blood-controls-page">
      <div className="container mx-auto px-4 py-8 relative z-[1]">
        <div className="mb-6 blood-controls-reveal blood-controls-reveal-1">
          <EntityBreadcrumbs
            items={[
              { label: 'Blood Controls', to: '/blood-controls' },
              { label: control.name },
            ]}
          />
          <div className="flex items-center justify-between mt-2">
            <div>
              <h1 className="text-3xl font-bold">{control.name}</h1>
              <div className="flex items-center gap-2 mt-1">
                <span className="text-sm" style={{ color: 'rgb(var(--app-text-muted))' }}>Type:</span>
                <span className="blood-controls-badge">Blood</span>
              </div>
            </div>
            {canWrite && (
              <button
                onClick={() => navigate(`/blood-controls/${control.id}/batches/new`)}
                className="blood-controls-btn-primary px-4 py-2 flex items-center gap-2"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
                Create Batch
              </button>
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
          <StatCard title="Production Runs" value={stats.totalBatches} subtitle={`Total specimens: ${stats.totalSpecimens}`} className="dashboard-card p-6 blood-controls-reveal blood-controls-reveal-2" />
          <StatCard title="Stock Availability" value={`${stats.inStockBatchesCount} / ${stats.totalBatches}`} subtitle="Batches in stock" className="dashboard-card p-6 blood-controls-reveal blood-controls-reveal-3" />
          <StatCard title="Available Containers" value={stats.totalContainers || 0} subtitle={`${stats.totalSpots} spots, ${stats.totalMicronix} micronix, ${stats.totalCryovial} cryovial, ${stats.totalStaticWells} static wells`} className="dashboard-card p-6 blood-controls-reveal blood-controls-reveal-4" />
          <StatCard title="Storage Spread" value={stats.activeLocationsCount || 0} subtitle="Unique locations" className="dashboard-card p-6 blood-controls-reveal blood-controls-reveal-5" />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          <div className="lg:col-span-1 space-y-8">
            <div className="dashboard-card p-6 blood-controls-reveal blood-controls-reveal-6">
              <h2 className="blood-controls-section-title mb-4">Definition Details</h2>
              <div className="space-y-6">
                <div>
                  <p className="text-sm" style={{ color: 'rgb(var(--app-text-muted))' }}>Target Density</p>
                  <p className="font-medium" style={{ color: 'rgb(var(--app-text))' }}>
                    {control.targetDensity != null ? (
                      <>
                        {control.targetDensity.toLocaleString()} <span className="text-sm" style={{ color: 'rgb(var(--app-text-muted))' }}>{control.unitSymbol || ''}</span>
                      </>
                    ) : (
                      'Not specified'
                    )}
                  </p>
                </div>
                {strains.length > 0 && (
                  <div className="pt-6 border-t" style={{ borderColor: 'rgb(var(--app-border))' }}>
                    <h3 className="text-sm font-semibold mb-4" style={{ color: 'rgb(var(--app-text))' }}>Biological Content (Parasite Strains)</h3>
                    <div className="space-y-4">
                      {strains.map((s) => (
                        <div key={s.id} className="space-y-1.5">
                          <div className="flex justify-between text-sm">
                            <span className="font-medium" style={{ color: 'rgb(var(--app-text))' }}>{s.name}</span>
                            <span className="font-bold" style={{ color: 'rgb(var(--app-text))' }}>{s.percentage}%</span>
                          </div>
                          <div className="w-full rounded-full h-1.5" style={{ background: 'rgb(var(--app-border))' }}>
                            <div
                              className="h-1.5 rounded-full transition-all duration-500"
                              style={{ width: `${s.percentage}%`, background: 'rgb(var(--app-accent))' }}
                            />
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
          <div className="lg:col-span-2">
            <div className="dashboard-card overflow-hidden blood-controls-reveal blood-controls-reveal-7">
              <div className="px-6 py-4 border-b flex justify-between items-center" style={{ borderColor: 'rgb(var(--app-border))', background: 'rgb(var(--app-surface))' }}>
                <h2 className="text-lg font-semibold" style={{ color: 'rgb(var(--app-text))' }}>Production History</h2>
                <span className="text-sm font-medium" style={{ color: 'rgb(var(--app-text-muted))' }}>{batches.length} batches</span>
              </div>
              <div className="p-0">
                <DataTable
                  data={batches}
                  columns={batchColumns}
                  initialSortColumn="productionDate"
                  initialSortDirection="desc"
                  onRowClick={(row) => navigate(`/blood-controls/batches/${row.id}`)}
                  emptyMessage="No batches produced for this definition yet."
                  className="border-0"
                />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

