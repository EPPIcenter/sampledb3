import { useEffect, useRef, useState, useMemo } from 'react'
import { controlsApi, strainsApi, type ControlDefinition, type ControlBatch, type Strain } from '../lib/api'
import DataTable, { Column } from '../components/DataTable'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import StatCard from '../components/StatCard'
import SkeletonCard from '../components/SkeletonCard'
import { useUser } from '../contexts/UserContext'
import { useFocusSearchOnSlash } from '../hooks/useHotkey'
import { getContainerTypeIcon } from '../lib/icons'
import { getCompositionKey } from '../lib/composition-key'
import '../styles/blood-controls.css'

export interface CompositionGroup {
  id: number
  compositionKey: string
  strains: Array<{ id: number; name: string; percentage?: number }>
  definitions: ControlDefinition[]
}

const PAGE_SIZE = 25

export default function BloodControls() {
  const navigate = useNavigate()
  const { canWrite } = useUser()
  const [definitions, setDefinitions] = useState<ControlDefinition[]>([])
  const [batches, setBatches] = useState<Array<ControlBatch & { definitionName?: string }>>([])
  const [strains, setStrains] = useState<Strain[]>([])
  const [loading, setLoading] = useState(true)
  const [searchParams, setSearchParams] = useSearchParams()
  const activeTab = (searchParams.get('tab') as 'definitions' | 'batches') || 'definitions'

  // Pagination state (per tab)
  const [definitionsPage, setDefinitionsPage] = useState(1)
  const [batchesPage, setBatchesPage] = useState(1)

  // Filtering state
  const [searchTerm, setSearchTerm] = useState('')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const searchInputRef = useRef<HTMLInputElement>(null)
  useFocusSearchOnSlash(searchInputRef)

  // Blood control specific filters
  const [strainFilters, setStrainFilters] = useState<string[]>([])
  const [strainMatchMode, setStrainMatchMode] = useState<'exact' | 'contains'>('contains')
  const [minDensity, setMinDensity] = useState('')
  const [maxDensity, setMaxDensity] = useState('')

  const setActiveTab = (tab: 'definitions' | 'batches') => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev)
      next.set('tab', tab)
      return next
    })
  }

  useEffect(() => {
    loadData()
  }, [])

  // Reset pagination when filters change so we don't land on an empty page
  useEffect(() => {
    setDefinitionsPage(1)
    setBatchesPage(1)
  }, [searchTerm, dateFrom, dateTo, strainFilters, strainMatchMode, minDensity, maxDensity])

  const loadData = async () => {
    try {
      setLoading(true)
      const [defsRes, batchesRes, strainsRes] = await Promise.all([
        controlsApi.list(),
        controlsApi.listAllBatches(),
        strainsApi.list(),
      ])
      setDefinitions((defsRes.data.controls || []).map(d => ({
        ...d,
        specimenCount: Number(d.specimenCount || 0),
        batchCount: Number(d.batchCount || 0),
        spotCount: Number(d.spotCount || 0),
        micronixCount: Number(d.micronixCount || 0),
        cryovialCount: Number(d.cryovialCount || 0),
        staticWellCount: Number(d.staticWellCount || 0),
        tubeCount: Number(d.tubeCount || 0),
        inventoryTotal: Number(d.inventoryTotal || 0)
      })))
      setBatches((batchesRes.data.batches || []).map(b => ({
        ...b,
        specimenCount: Number(b.specimenCount || 0),
        spotCount: Number(b.spotCount || 0),
        micronixCount: Number(b.micronixCount || 0),
        cryovialCount: Number(b.cryovialCount || 0),
        staticWellCount: Number(b.staticWellCount || 0),
        tubeCount: Number(b.tubeCount || 0),
        inventoryTotal: Number(b.inventoryTotal || 0)
      })))
      setStrains(strainsRes.data)
    } catch (error) {
      console.error('Failed to load controls data:', error)
    } finally {
      setLoading(false)
    }
  }

  // Summary stats
  const stats = useMemo(() => {
    const totalDefinitions = definitions.length
    const totalBatches = batches.length
    const totalSpots = batches.reduce((sum, b) => sum + (b.spotCount || 0), 0)
    const totalMicronix = batches.reduce((sum, b) => sum + (b.micronixCount || 0), 0)
    const totalCryovial = batches.reduce((sum, b) => sum + (b.cryovialCount || 0), 0)
    const totalStaticWells = batches.reduce((sum, b) => sum + (b.staticWellCount || 0), 0)

    return { totalDefinitions, totalBatches, totalSpots, totalMicronix, totalCryovial, totalStaticWells }
  }, [definitions, batches])

  // Filtered definitions
  const filteredDefinitions = useMemo(() => {
    return definitions.filter((def) => {
      const matchesSearch = def.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
                           (def.description || '').toLowerCase().includes(searchTerm.toLowerCase())
      
      // Blood control specific definition filters
      const defStrainIds = (def.strains ?? []).map((s) => s.id.toString())
      const matchesContains = strainFilters.length === 0 || strainFilters.every((id) => def.strains?.some((s) => s.id.toString() === id))
      const matchesExact = strainFilters.length === 0 || (strainFilters.length === defStrainIds.length && strainFilters.every((id) => defStrainIds.includes(id)))
      const matchesStrain = strainMatchMode === 'exact' ? matchesExact : matchesContains
      const matchesMinDensity = !minDensity || (def.targetDensity !== undefined && def.targetDensity >= parseFloat(minDensity))
      const matchesMaxDensity = !maxDensity || (def.targetDensity !== undefined && def.targetDensity <= parseFloat(maxDensity))

      return matchesSearch && matchesStrain && matchesMinDensity && matchesMaxDensity
    })
  }, [definitions, searchTerm, strainFilters, strainMatchMode, minDensity, maxDensity])

  // Filtered batches
  const filteredBatches = useMemo(() => {
    return batches.filter((batch) => {
      const matchesSearch = batch.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                           (batch.definitionName || '').toLowerCase().includes(searchTerm.toLowerCase())
      const matchesDateFrom = !dateFrom || (batch.productionDate && batch.productionDate >= dateFrom)
      const matchesDateTo = !dateTo || (batch.productionDate && batch.productionDate <= dateTo)
      
      // Blood control specific batch filters
      const batchStrainIds = (batch.strains ?? []).map((s) => s.id.toString())
      const matchesContains = strainFilters.length === 0 || strainFilters.every((id) => batch.strains?.some((s) => s.id.toString() === id))
      const matchesExact = strainFilters.length === 0 || (strainFilters.length === batchStrainIds.length && strainFilters.every((id) => batchStrainIds.includes(id)))
      const matchesStrain = strainMatchMode === 'exact' ? matchesExact : matchesContains
      const matchesMinDensity = !minDensity || (batch.targetDensity !== undefined && batch.targetDensity >= parseFloat(minDensity))
      const matchesMaxDensity = !maxDensity || (batch.targetDensity !== undefined && batch.targetDensity <= parseFloat(maxDensity))
      
      return matchesSearch && matchesDateFrom && matchesDateTo && matchesStrain && matchesMinDensity && matchesMaxDensity
    })
  }, [batches, searchTerm, dateFrom, dateTo, strainFilters, strainMatchMode, minDensity, maxDensity])

  // Group definitions by composition (strain signature) for composition-centric view
  const compositionGroups = useMemo((): CompositionGroup[] => {
    const map = new Map<string, ControlDefinition[]>()
    for (const def of filteredDefinitions) {
      const key = getCompositionKey((def.strains ?? []).map(s => ({ id: s.id, percentage: s.percentage })))
      if (!key) continue
      if (!map.has(key)) map.set(key, [])
      map.get(key)!.push(def)
    }
    return Array.from(map.entries()).map(([compositionKey, defs], index) => ({
      id: index + 1,
      compositionKey,
      strains: defs[0].strains ?? [],
      definitions: defs.sort((a, b) => (a.targetDensity ?? 0) - (b.targetDensity ?? 0)),
    }))
  }, [filteredDefinitions])

  const definitionColumns: Column<ControlDefinition>[] = [
    {
      key: 'name',
      label: 'Name',
      sortable: true,
      render: (value, row) => (
        <Link to={`/blood-controls/${row.id}`} className="dashboard-link font-medium hover:underline">
          {value}
        </Link>
      ),
    },
    {
      key: 'strains',
      label: 'Biological Content',
      render: (_, row) => {
        if (!row.strains || row.strains.length === 0) {
          return <span className="text-gray-400 italic text-xs">No strains</span>;
        }
        return (
          <div className="space-y-2 max-w-sm">
            {/* Visual proportion bar */}
            <div className="flex h-2 bg-gray-100 rounded-full overflow-hidden">
              {row.strains.map((s: any, idx: number) => {
                const percentage = s.percentage || 0
                const colors = [
                  'bg-blue-500',
                  'bg-emerald-500',
                  'bg-amber-500',
                  'bg-purple-500',
                  'bg-rose-500',
                  'bg-cyan-500',
                ]
                return (
                  <div
                    key={s.id || idx}
                    className={colors[idx % colors.length]}
                    style={{ width: `${percentage}%` }}
                    title={`${s.name}: ${percentage}%`}
                  />
                )
              })}
            </div>
            {/* Strain names with percentages */}
            <div className="flex flex-wrap gap-1.5">
              {row.strains.map((s: any) => (
                <span 
                  key={s.id} 
                  className="inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium bg-blue-50 text-blue-700 border border-blue-100"
                  title={s.percentage ? `${s.percentage}%` : undefined}
                >
                  {s.name}
                  {s.percentage !== undefined && (
                    <span className="ml-1 text-blue-600 font-semibold">({s.percentage}%)</span>
                  )}
                </span>
              ))}
            </div>
          </div>
        );
      }
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
          <div className="flex flex-col gap-2">
            <div className="flex items-center gap-2">
              <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold bg-slate-100 text-slate-600 border border-slate-200 uppercase tracking-tight">
                {row.batchCount || 0} Batches
              </span>
            </div>
            <div className="flex flex-wrap gap-2 text-sm">
              {hasSpots && badge('paper', row.spotCount!, 'Spots', 'bg-amber-50', 'text-amber-700', 'border-amber-100')}
              {hasMicronix && badge('micronix_tube', row.micronixCount!, 'Micronix', 'bg-teal-50', 'text-teal-700', 'border-teal-100')}
              {hasCryovial && badge('cryovial_tube', row.cryovialCount!, 'Cryovial', 'bg-blue-50', 'text-blue-700', 'border-blue-100')}
              {hasStaticWells && badge('static_well', row.staticWellCount!, 'Static wells', 'bg-slate-50', 'text-slate-700', 'border-slate-200')}
              {!hasAny && <span className="text-gray-400 italic text-xs">No stock</span>}
            </div>
          </div>
        )
      },
    },
    {
      key: 'targetDensity',
      label: 'Target Density',
      sortable: true,
      render: (value, row) => (
        value ? (
          <div className="text-sm">
            <span className="dashboard-stat-value font-medium">{value.toLocaleString()}</span>
            <span className="dashboard-stat-muted ml-1">{row.unitSymbol}</span>
          </div>
        ) : <span className="text-gray-400">N/A</span>
      ),
    },
    {
      key: 'description',
      label: 'Description',
      render: (value) => <span className="text-gray-600 line-clamp-1 max-w-xs">{value || '-'}</span>
    },
  ]

  const compositionColumns: Column<CompositionGroup>[] = [
    {
      key: 'strains',
      label: 'Composition (parasite strains)',
      render: (_, row) => {
        if (!row.strains || row.strains.length === 0) return <span className="text-gray-400 italic text-xs">No strains</span>
        return (
          <div className="space-y-2 max-w-sm">
            <div className="flex h-2 bg-gray-100 rounded-full overflow-hidden">
              {row.strains.map((s, idx) => {
                const pct = s.percentage ?? 0
                const colors = ['bg-blue-500', 'bg-emerald-500', 'bg-amber-500', 'bg-purple-500', 'bg-rose-500', 'bg-cyan-500']
                return <div key={s.id} className={colors[idx % colors.length]} style={{ width: `${pct}%` }} title={`${s.name}: ${pct}%`} />
              })}
            </div>
            <div className="flex flex-wrap gap-1.5">
              {row.strains.map((s) => (
                <span key={s.id} className="inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium bg-blue-50 text-blue-700 border border-blue-100">
                  {s.name}
                  {s.percentage !== undefined && <span className="ml-1 text-blue-600 font-semibold">({s.percentage}%)</span>}
                </span>
              ))}
            </div>
          </div>
        )
      },
    },
    {
      key: 'definitions',
      label: 'Densities',
      render: (_, row) => (
        <span className="dashboard-stat-value font-medium">{row.definitions.length} density variant{row.definitions.length !== 1 ? 's' : ''}</span>
      ),
    },
    {
      key: 'batches',
      label: 'Total batches',
      render: (_, row) => {
        const total = row.definitions.reduce((sum, d) => sum + (d.batchCount ?? 0), 0)
        return <span className="font-medium">{total}</span>
      },
    },
    {
      key: 'inventory',
      label: 'Inventory',
      render: (_, row) => {
        const totalSpots = row.definitions.reduce((s, d) => s + (d.spotCount ?? 0), 0)
        const totalMicronix = row.definitions.reduce((s, d) => s + (d.micronixCount ?? 0), 0)
        const totalCryovial = row.definitions.reduce((s, d) => s + (d.cryovialCount ?? 0), 0)
        const hasAny = totalSpots > 0 || totalMicronix > 0 || totalCryovial > 0
        if (!hasAny) return <span className="text-gray-400 italic text-xs">No stock</span>
        return (
          <div className="flex flex-wrap gap-2 text-sm">
            {totalSpots > 0 && (
              <div className="flex items-center gap-1.5 px-2 py-1 bg-amber-50 text-amber-700 border border-amber-100 rounded-md">
                {getContainerTypeIcon('paper')}
                <span className="font-bold">{totalSpots}</span>
                <span className="text-[10px] uppercase font-medium">Spots</span>
              </div>
            )}
            {totalMicronix > 0 && (
              <div className="flex items-center gap-1.5 px-2 py-1 bg-teal-50 text-teal-700 border border-teal-100 rounded-md">
                {getContainerTypeIcon('micronix_tube')}
                <span className="font-bold">{totalMicronix}</span>
                <span className="text-[10px] uppercase font-medium">Micronix</span>
              </div>
            )}
            {totalCryovial > 0 && (
              <div className="flex items-center gap-1.5 px-2 py-1 bg-blue-50 text-blue-700 border border-blue-100 rounded-md">
                {getContainerTypeIcon('cryovial_tube')}
                <span className="font-bold">{totalCryovial}</span>
                <span className="text-[10px] uppercase font-medium">Cryovial</span>
              </div>
            )}
          </div>
        )
      },
    },
    {
      key: 'action',
      label: '',
      render: (_, row) => (
        <Link
          to={`/blood-controls/compositions/${encodeURIComponent(row.compositionKey)}`}
          className="blood-controls-btn-secondary px-3 py-1.5 text-sm inline-flex items-center gap-1"
        >
          View
        </Link>
      ),
    },
  ]

  const batchColumns: Column<ControlBatch & { definitionName?: string }>[] = [
    {
      key: 'name',
      label: 'Batch Name',
      sortable: true,
      render: (value, row) => (
        <Link to={`/blood-controls/batches/${row.id}`} className="dashboard-link font-medium hover:underline">
          {value}
        </Link>
      ),
    },
    {
      key: 'targetDensity',
      label: 'Target Density',
      sortable: true,
      render: (value, row) => (
        value ? (
          <div className="text-sm">
            <span className="dashboard-stat-value font-medium">{value.toLocaleString()}</span>
            <span className="dashboard-stat-muted ml-1">{row.unitSymbol}</span>
          </div>
        ) : <span className="text-gray-400">N/A</span>
      ),
    },
    {
      key: 'strains',
      label: 'Biological Content',
      render: (_, row) => {
        if (!row.strains || row.strains.length === 0) {
          return <span className="text-gray-400 italic text-xs">No strains</span>;
        }
        return (
          <div className="space-y-2 max-w-sm">
            {/* Visual proportion bar */}
            <div className="flex h-2 bg-gray-100 rounded-full overflow-hidden">
              {row.strains.map((s: any, idx: number) => {
                const percentage = s.percentage || 0
                const colors = [
                  'bg-blue-500',
                  'bg-emerald-500',
                  'bg-amber-500',
                  'bg-purple-500',
                  'bg-rose-500',
                  'bg-cyan-500',
                ]
                return (
                  <div
                    key={s.id || idx}
                    className={colors[idx % colors.length]}
                    style={{ width: `${percentage}%` }}
                    title={`${s.name}: ${percentage}%`}
                  />
                )
              })}
            </div>
            {/* Strain names with percentages */}
            <div className="flex flex-wrap gap-1.5">
              {row.strains.map((s: any) => (
                <span 
                  key={s.id} 
                  className="inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium bg-blue-50 text-blue-700 border border-blue-100"
                  title={s.percentage ? `${s.percentage}%` : undefined}
                >
                  {s.name}
                  {s.percentage !== undefined && (
                    <span className="ml-1 text-blue-600 font-semibold">({s.percentage}%)</span>
                  )}
                </span>
              ))}
            </div>
          </div>
        );
      }
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
            {hasMicronix && badge('micronix_tube', row.micronixCount!, 'Micronix', 'bg-teal-50', 'text-teal-700', 'border-teal-100')}
            {hasCryovial && badge('cryovial_tube', row.cryovialCount!, 'Cryovial', 'bg-blue-50', 'text-blue-700', 'border-blue-100')}
            {hasStaticWells && badge('static_well', row.staticWellCount!, 'Static wells', 'bg-slate-50', 'text-slate-700', 'border-slate-200')}
            {!hasAny && <span className="text-gray-400 italic">Empty</span>}
          </div>
        )
      }
    },
    {
      key: 'productionDate',
      label: 'Production Date',
      sortable: true,
      render: (value) => value ? (
        <span className="dashboard-stat-value">{new Date(value).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })}</span>
      ) : <span className="text-gray-400 italic">Not set</span>,
    },
  ]

  return (
    <div className="blood-controls-page">
      <div className="container mx-auto px-4 py-8 max-w-7xl relative z-[1]">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-8 gap-4 blood-controls-reveal blood-controls-reveal-1">
          <div>
            <h1 className="text-3xl font-bold">Blood Controls Management</h1>
            <p className="mt-1 text-sm" style={{ color: 'rgb(var(--dashboard-text-muted))' }}>Manage and track blood control definitions and their production batches.</p>
          </div>
          {canWrite && activeTab === 'definitions' && (
            <button
              onClick={() => navigate('/blood-controls/new')}
              className="blood-controls-btn-primary px-4 py-2 flex items-center gap-2"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              New Blood Control Definition
            </button>
          )}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-6 mb-8">
          {loading ? (
            Array.from({ length: 6 }).map((_, i) => (
              <SkeletonCard key={i} height="h-24" className={`blood-controls-reveal blood-controls-reveal-${Math.min(i + 2, 6)}`} />
            ))
          ) : (
            <>
              <StatCard title="Total Definitions" value={stats.totalDefinitions} subtitle="Unique control types" className="dashboard-card p-6 blood-controls-reveal blood-controls-reveal-2" />
              <StatCard title="Total Batches" value={stats.totalBatches} subtitle="Cumulative production" className="dashboard-card p-6 blood-controls-reveal blood-controls-reveal-3" />
              <StatCard title="Total Spots" value={stats.totalSpots} subtitle="DBS / Paper spots available" className="dashboard-card p-6 blood-controls-reveal blood-controls-reveal-4" />
              <StatCard title="Total Micronix" value={stats.totalMicronix} subtitle="Micronix tubes in stock" className="dashboard-card p-6 blood-controls-reveal blood-controls-reveal-5" />
              <StatCard title="Total Cryovial" value={stats.totalCryovial} subtitle="Cryovial tubes in stock" className="dashboard-card p-6 blood-controls-reveal blood-controls-reveal-5" />
              <StatCard title="Total Static Wells" value={stats.totalStaticWells} subtitle="Static wells in stock" className="dashboard-card p-6 blood-controls-reveal blood-controls-reveal-5" />
            </>
          )}
        </div>

        <div className="dashboard-card rounded-xl mb-8 overflow-hidden blood-controls-reveal blood-controls-reveal-6">
          <div className="border-b blood-controls-tabs" style={{ borderColor: 'rgb(var(--dashboard-border))', background: 'rgb(var(--dashboard-surface) / 0.5)' }}>
            <nav className="flex -mb-px px-6">
              <button
                onClick={() => setActiveTab('definitions')}
                className={`px-6 py-4 text-sm font-semibold border-b-2 transition-colors ${activeTab === 'definitions' ? 'blood-controls-tab-active' : ''}`}
              >
                Compositions
              </button>
              <button
                onClick={() => setActiveTab('batches')}
                className={`px-6 py-4 text-sm font-semibold border-b-2 transition-colors ${activeTab === 'batches' ? 'blood-controls-tab-active' : ''}`}
              >
                Control Batches
              </button>
            </nav>
          </div>

          {/* Search & Filters */}
          <div className="p-6">
            <div className="space-y-6">
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-x-8 gap-y-6">
                <div className="relative col-span-1 lg:col-span-6">
                  <label className="block blood-controls-filter-label mb-2">Search</label>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none" style={{ color: 'rgb(var(--dashboard-text-muted))' }}>
                      <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                      </svg>
                    </div>
                    <input
                      ref={searchInputRef}
                      type="text"
                      placeholder={`Search ${activeTab === 'batches' ? 'batches' : 'definitions'}...`}
                      className="block w-full pl-10 pr-3 py-2 border rounded-lg leading-5 bg-white sm:text-sm transition-shadow"
                      style={{ borderColor: 'rgb(var(--dashboard-border))' }}
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                    />
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-12 gap-x-8 gap-y-6 pt-6 border-t" style={{ borderColor: 'rgb(var(--dashboard-border))' }}>
                <div className="lg:col-span-6">
                  <div className="flex flex-wrap items-center gap-3 mb-2">
                    <label className="block blood-controls-filter-label mb-0">Strains</label>
                    <div className="flex rounded-lg border overflow-hidden" style={{ borderColor: 'rgb(var(--dashboard-border))' }}>
                      <button
                        type="button"
                        onClick={() => setStrainMatchMode('contains')}
                        className={`px-3 py-1.5 text-xs font-medium transition-colors ${strainMatchMode === 'contains' ? 'blood-controls-pill-selected rounded-none' : 'blood-controls-pill rounded-none border-0'}`}
                      >
                        Contains
                      </button>
                      <button
                        type="button"
                        onClick={() => setStrainMatchMode('exact')}
                        className={`px-3 py-1.5 text-xs font-medium transition-colors ${strainMatchMode === 'exact' ? 'blood-controls-pill-selected rounded-none' : 'blood-controls-pill rounded-none border-0'}`}
                      >
                        Exact
                      </button>
                    </div>
                    <span className="text-xs" style={{ color: 'rgb(var(--dashboard-text-muted))' }}>
                      {strainMatchMode === 'contains' ? 'Must contain all selected' : 'Exact strains only'}
                    </span>
                  </div>
                  <div className="flex flex-wrap gap-2 p-2 border rounded-lg min-h-[42px] bg-white" style={{ borderColor: 'rgb(var(--dashboard-border))' }}>
                    {strains.map(s => {
                      const isSelected = strainFilters.includes(s.id.toString());
                      return (
                        <button
                          key={s.id}
                          onClick={() => {
                            if (isSelected) {
                              setStrainFilters(prev => prev.filter(id => id !== s.id.toString()));
                            } else {
                              setStrainFilters(prev => [...prev, s.id.toString()]);
                            }
                          }}
                          className={`px-3 py-1 rounded-full text-xs font-medium border transition-all ${isSelected ? 'blood-controls-pill-selected' : 'blood-controls-pill'}`}
                        >
                          {s.name}
                        </button>
                      );
                    })}
                    {strainFilters.length === 0 && <span className="text-sm ml-1 self-center italic" style={{ color: 'rgb(var(--dashboard-text-muted))' }}>No strains selected...</span>}
                  </div>
                </div>
                <div className="lg:col-span-3">
                  <label className="block blood-controls-filter-label mb-2">
                    Density Range <span className="normal-case font-medium">(parasites/µL)</span>
                  </label>
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      placeholder="Min"
                      className="block w-full px-3 py-2 border rounded-lg text-sm min-w-0 bg-white"
                      style={{ borderColor: 'rgb(var(--dashboard-border))' }}
                      value={minDensity}
                      onChange={(e) => setMinDensity(e.target.value)}
                    />
                    <span className="font-medium text-xs" style={{ color: 'rgb(var(--dashboard-text-muted))' }}>to</span>
                    <input
                      type="number"
                      placeholder="Max"
                      className="block w-full px-3 py-2 border rounded-lg text-sm min-w-0 bg-white"
                      style={{ borderColor: 'rgb(var(--dashboard-border))' }}
                      value={maxDensity}
                      onChange={(e) => setMaxDensity(e.target.value)}
                    />
                  </div>
                </div>
                {activeTab === 'batches' && (
                  <div className="lg:col-span-3">
                    <label className="block blood-controls-filter-label mb-2">Production Date Range</label>
                    <div className="flex items-center gap-2">
                      <input
                        type="date"
                        className="block w-full px-2 py-2 border rounded-lg text-sm min-w-0 bg-white"
                        style={{ borderColor: 'rgb(var(--dashboard-border))' }}
                        value={dateFrom}
                        onChange={(e) => setDateFrom(e.target.value)}
                      />
                      <span className="font-medium" style={{ color: 'rgb(var(--dashboard-text-muted))' }}>to</span>
                      <input
                        type="date"
                        className="block w-full px-2 py-2 border rounded-lg text-sm min-w-0 bg-white"
                        style={{ borderColor: 'rgb(var(--dashboard-border))' }}
                        value={dateTo}
                        onChange={(e) => setDateTo(e.target.value)}
                      />
                    </div>
                  </div>
                )}
              </div>

              {(searchTerm || dateFrom || dateTo || strainFilters.length > 0 || minDensity || maxDensity) && (
                <div className="flex justify-end items-center pt-2 border-t" style={{ borderColor: 'rgb(var(--dashboard-border))' }}>
                  <button
                    onClick={() => {
                      setSearchTerm('')
                      setDateFrom('')
                      setDateTo('')
                      setStrainFilters([])
                      setMinDensity('')
                      setMaxDensity('')
                    }}
                    className="blood-controls-btn-danger flex items-center gap-2 text-sm px-4 py-2 rounded-lg"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                    </svg>
                    Reset All Filters
                  </button>
                </div>
              )}
            </div>
          </div>

          <div className="pt-0">
            {activeTab === 'batches' ? (
              <DataTable
                data={filteredBatches}
                columns={batchColumns}
                loading={loading}
                initialSortColumn="productionDate"
                initialSortDirection="desc"
                onRowClick={(batch) => navigate(`/blood-controls/batches/${batch.id}`)}
                emptyMessage="No control batches match the current filters."
                pagination={{
                  page: batchesPage,
                  pageSize: PAGE_SIZE,
                  onPageChange: setBatchesPage,
                  showPagination: true,
                }}
                className="border-0"
              />
            ) : (
              <DataTable
                data={compositionGroups}
                columns={compositionColumns}
                loading={loading}
                initialSortColumn="strains"
                initialSortDirection="asc"
                onRowClick={(row) => navigate(`/blood-controls/compositions/${encodeURIComponent(row.compositionKey)}`)}
                emptyMessage="No compositions match the current filters. Create a control definition to get started."
                pagination={{
                  page: definitionsPage,
                  pageSize: PAGE_SIZE,
                  onPageChange: setDefinitionsPage,
                  showPagination: true,
                }}
                className="border-0"
              />
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
