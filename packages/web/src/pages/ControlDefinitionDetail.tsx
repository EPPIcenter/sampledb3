import { useEffect, useState } from 'react'
import { useParams, Link, useNavigate } from 'react-router-dom'
import { controlsApi, type ControlDefinitionSummaryResponse } from '../lib/api'
import EntityBreadcrumbs from '../components/EntityBreadcrumbs'
import DataTable, { Column } from '../components/DataTable'
import StatCard from '../components/StatCard'
import SkeletonDetailPage from '../components/SkeletonDetailPage'
import '../styles/blood-controls.css'

export default function ControlDefinitionDetail() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
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
          <div className="text-center py-8" style={{ color: 'rgb(var(--dashboard-trend-down))' }}>
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
      ) : <span className="text-gray-400 italic">Not set</span>,
    },
    {
      key: 'inventoryTotal',
      label: 'Inventory',
      sortable: true,
      render: (_, row) => (
        <div className="flex gap-3 text-sm">
          {row.spotCount !== undefined && row.spotCount > 0 && (
            <div className="flex items-center gap-1.5 px-2 py-1 bg-amber-50 text-amber-700 border border-amber-100 rounded-md">
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
              </svg>
              <span className="font-bold">{row.spotCount}</span>
              <span className="text-[10px] uppercase font-medium">Spots</span>
            </div>
          )}
          {row.tubeCount !== undefined && row.tubeCount > 0 && (
            <div className="flex items-center gap-1.5 px-2 py-1 bg-blue-50 text-blue-700 border border-blue-100 rounded-md">
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z" />
              </svg>
              <span className="font-bold">{row.tubeCount}</span>
              <span className="text-[10px] uppercase font-medium">Tubes</span>
            </div>
          )}
          {(!row.spotCount && !row.tubeCount) && <span className="text-gray-400 italic">Empty</span>}
        </div>
      )
    },
    {
      key: 'status',
      label: 'Status',
      render: (_, row) => {
        const hasStock = (row.inventoryTotal || 0) > 0
        return (
          <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
            hasStock ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
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
                <span className="text-sm" style={{ color: 'rgb(var(--dashboard-text-muted))' }}>Type:</span>
                <span className="blood-controls-badge">Blood</span>
              </div>
            </div>
            <div className="flex space-x-3" />
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
          <StatCard title="Production Runs" value={stats.totalBatches} subtitle={`Total specimens: ${stats.totalSpecimens}`} className="dashboard-card p-6 blood-controls-reveal blood-controls-reveal-2" />
          <StatCard title="Stock Availability" value={`${stats.inStockBatchesCount} / ${stats.totalBatches}`} subtitle="Batches in stock" className="dashboard-card p-6 blood-controls-reveal blood-controls-reveal-3" />
          <StatCard title="Available Containers" value={stats.totalContainers || 0} subtitle={`${stats.totalSpots} spots, ${stats.totalTubes} tubes`} className="dashboard-card p-6 blood-controls-reveal blood-controls-reveal-4" />
          <StatCard title="Storage Spread" value={stats.activeLocationsCount || 0} subtitle="Unique locations" className="dashboard-card p-6 blood-controls-reveal blood-controls-reveal-5" />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          <div className="lg:col-span-1 space-y-8">
            <div className="dashboard-card p-6 blood-controls-reveal blood-controls-reveal-6">
              <h2 className="blood-controls-section-title mb-4">Definition Details</h2>
              <div className="space-y-6">
                <div>
                  <p className="text-sm" style={{ color: 'rgb(var(--dashboard-text-muted))' }}>Target Density</p>
                  <p className="font-medium" style={{ color: 'rgb(var(--dashboard-text))' }}>
                    {control.targetDensity !== undefined && control.targetDensity !== null ? (
                      <>
                        {control.targetDensity.toLocaleString()} <span className="text-sm" style={{ color: 'rgb(var(--dashboard-text-muted))' }}>{control.unitSymbol || ''}</span>
                      </>
                    ) : (
                      'Not specified'
                    )}
                  </p>
                </div>
                {strains.length > 0 && (
                  <div className="pt-6 border-t" style={{ borderColor: 'rgb(var(--dashboard-border))' }}>
                    <h3 className="text-sm font-semibold mb-4" style={{ color: 'rgb(var(--dashboard-text))' }}>Biological Content (Parasite Strains)</h3>
                    <div className="space-y-4">
                      {strains.map((s) => (
                        <div key={s.id} className="space-y-1.5">
                          <div className="flex justify-between text-sm">
                            <span className="font-medium" style={{ color: 'rgb(var(--dashboard-text))' }}>{s.name}</span>
                            <span className="font-bold" style={{ color: 'rgb(var(--dashboard-text))' }}>{s.percentage}%</span>
                          </div>
                          <div className="w-full rounded-full h-1.5" style={{ background: 'rgb(var(--dashboard-border))' }}>
                            <div
                              className="h-1.5 rounded-full transition-all duration-500"
                              style={{ width: `${s.percentage}%`, background: 'rgb(var(--dashboard-accent))' }}
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
              <div className="px-6 py-4 border-b flex justify-between items-center" style={{ borderColor: 'rgb(var(--dashboard-border))', background: 'rgb(var(--dashboard-surface))' }}>
                <h2 className="text-lg font-semibold" style={{ color: 'rgb(var(--dashboard-text))' }}>Production History</h2>
                <span className="text-sm font-medium" style={{ color: 'rgb(var(--dashboard-text-muted))' }}>{batches.length} batches</span>
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

