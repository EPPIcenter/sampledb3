import { useEffect, useState, useMemo } from 'react'
import { controlsApi, strainsApi, type ControlDefinition, type ControlBatch, type Strain } from '../lib/api'
import DataTable, { Column } from '../components/DataTable'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import StatCard from '../components/StatCard'
import SkeletonCard from '../components/SkeletonCard'
import { useUser } from '../contexts/UserContext'

export default function BloodControls() {
  const navigate = useNavigate()
  const { canWrite } = useUser()
  const [definitions, setDefinitions] = useState<ControlDefinition[]>([])
  const [batches, setBatches] = useState<Array<ControlBatch & { definitionName?: string }>>([])
  const [strains, setStrains] = useState<Strain[]>([])
  const [loading, setLoading] = useState(true)
  const [searchParams, setSearchParams] = useSearchParams()
  const activeTab = (searchParams.get('tab') as 'definitions' | 'batches') || 'definitions'

  // Filtering state
  const [searchTerm, setSearchTerm] = useState('')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  
  // Blood control specific filters
  const [strainFilters, setStrainFilters] = useState<string[]>([])
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
        tubeCount: Number(d.tubeCount || 0),
        inventoryTotal: Number(d.inventoryTotal || 0)
      })))
      setBatches((batchesRes.data.batches || []).map(b => ({
        ...b,
        specimenCount: Number(b.specimenCount || 0),
        spotCount: Number(b.spotCount || 0),
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
    const totalTubes = batches.reduce((sum, b) => sum + (b.tubeCount || 0), 0)

    return { totalDefinitions, totalBatches, totalSpots, totalTubes }
  }, [definitions, batches])

  // Filtered definitions
  const filteredDefinitions = useMemo(() => {
    return definitions.filter((def) => {
      const matchesSearch = def.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
                           (def.description || '').toLowerCase().includes(searchTerm.toLowerCase())
      
      // Blood control specific definition filters
      const matchesStrain = strainFilters.length === 0 || strainFilters.every(id => def.strains?.some(s => s.id.toString() === id))
      const matchesMinDensity = !minDensity || (def.targetDensity !== undefined && def.targetDensity >= parseFloat(minDensity))
      const matchesMaxDensity = !maxDensity || (def.targetDensity !== undefined && def.targetDensity <= parseFloat(maxDensity))

      return matchesSearch && matchesStrain && matchesMinDensity && matchesMaxDensity
    })
  }, [definitions, searchTerm, strainFilters, minDensity, maxDensity])

  // Filtered batches
  const filteredBatches = useMemo(() => {
    return batches.filter((batch) => {
      const matchesSearch = batch.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                           (batch.definitionName || '').toLowerCase().includes(searchTerm.toLowerCase())
      const matchesDateFrom = !dateFrom || (batch.productionDate && batch.productionDate >= dateFrom)
      const matchesDateTo = !dateTo || (batch.productionDate && batch.productionDate <= dateTo)
      
      // Blood control specific batch filters
      const matchesStrain = strainFilters.length === 0 || strainFilters.every(id => batch.strains?.some(s => s.id.toString() === id))
      const matchesMinDensity = !minDensity || (batch.targetDensity !== undefined && batch.targetDensity >= parseFloat(minDensity))
      const matchesMaxDensity = !maxDensity || (batch.targetDensity !== undefined && batch.targetDensity <= parseFloat(maxDensity))
      
      return matchesSearch && matchesDateFrom && matchesDateTo && matchesStrain && matchesMinDensity && matchesMaxDensity
    })
  }, [batches, searchTerm, dateFrom, dateTo, strainFilters, minDensity, maxDensity])


  const definitionColumns: Column<ControlDefinition>[] = [
    {
      key: 'name',
      label: 'Name',
      sortable: true,
      render: (value, row) => (
        <Link to={`/blood-controls/${row.id}`} className="text-blue-600 font-medium hover:underline">
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
      render: (_, row) => (
        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold bg-slate-100 text-slate-600 border border-slate-200 uppercase tracking-tight">
              {row.batchCount || 0} Batches
            </span>
          </div>
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
            {(!row.spotCount && !row.tubeCount) && <span className="text-gray-400 italic text-xs">No stock</span>}
          </div>
        </div>
      ),
    },
    {
      key: 'targetDensity',
      label: 'Target Density',
      sortable: true,
      render: (value, row) => (
        value ? (
          <div className="text-sm">
            <span className="font-medium text-gray-900">{value.toLocaleString()}</span>
            <span className="text-gray-500 ml-1">{row.unitSymbol}</span>
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

  const batchColumns: Column<ControlBatch & { definitionName?: string }>[] = [
    {
      key: 'name',
      label: 'Batch Name',
      sortable: true,
      render: (value, row) => (
        <Link to={`/blood-controls/batches/${row.id}`} className="text-blue-600 font-medium hover:underline">
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
            <span className="font-medium text-gray-900">{value.toLocaleString()}</span>
            <span className="text-gray-500 ml-1">{row.unitSymbol}</span>
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
      key: 'productionDate',
      label: 'Production Date',
      sortable: true,
      render: (value) => value ? (
        <span className="text-gray-900">{new Date(value).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })}</span>
      ) : <span className="text-gray-400 italic">Not set</span>,
    },
  ]

  return (
    <div className="container mx-auto px-4 py-8 max-w-7xl">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-8 gap-4">
        <div>
        <h1 className="text-3xl font-bold text-gray-900">Blood Controls Management</h1>
          <p className="text-gray-500 mt-1">Manage and track blood control definitions and their production batches.</p>
        </div>
        {canWrite && (
          <>
            {activeTab === 'definitions' && (
              <button
                onClick={() => navigate('/blood-controls/new')}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium flex items-center gap-2"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
                New Blood Control Definition
              </button>
            )}
            {activeTab === 'batches' && (
              <button
                onClick={() => navigate('/blood-controls/batches/new')}
                className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 font-medium flex items-center gap-2"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
                Create Batch
              </button>
            )}
          </>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
        {loading ? (
          Array.from({ length: 4 }).map((_, i) => (
            <SkeletonCard key={i} height="h-24" />
          ))
        ) : (
          <>
            <StatCard
              title="Total Definitions"
              value={stats.totalDefinitions}
              subtitle="Unique control types"
            />
            <StatCard
              title="Total Batches"
              value={stats.totalBatches}
              subtitle="Cumulative production"
            />
            <StatCard
              title="Total Spots"
              value={stats.totalSpots}
              subtitle="DBS / Paper spots available"
            />
            <StatCard
              title="Total Tubes"
              value={stats.totalTubes}
              subtitle="Vials and tubes in stock"
            />
          </>
        )}
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-100 mb-8 overflow-hidden">
        <div className="border-b border-gray-100 bg-gray-50/50">
          <nav className="flex -mb-px px-6">
            <button
              onClick={() => setActiveTab('definitions')}
              className={`px-6 py-4 text-sm font-semibold border-b-2 transition-colors ${
                activeTab === 'definitions'
                  ? 'border-blue-600 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-200'
              }`}
            >
              Control Definitions
            </button>
            <button
              onClick={() => setActiveTab('batches')}
              className={`px-6 py-4 text-sm font-semibold border-b-2 transition-colors ${
                activeTab === 'batches'
                  ? 'border-blue-600 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-200'
              }`}
            >
              Control Batches
            </button>
          </nav>
        </div>

        {/* Search & Filters */}
        <div className="p-6 border-b border-gray-100 bg-white">
          <div className="space-y-6">
            {/* Top Row: Search and Core Filters */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-x-8 gap-y-6">
              <div className="relative col-span-1 lg:col-span-6">
                <label className="block text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">Search</label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                    <svg className="h-5 w-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                    </svg>
                  </div>
                  <input
                    type="text"
                    placeholder={`Search ${activeTab === 'batches' ? 'batches' : 'definitions'}...`}
                    className="block w-full pl-10 pr-3 py-2 border border-gray-100 rounded-lg leading-5 bg-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 sm:text-sm transition-shadow"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                  />
                </div>
              </div>

            </div>

            {/* Second Row: Blood Control Filters and Dates */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-x-8 gap-y-6 pt-6 border-t border-gray-100">
              <div className="lg:col-span-6">
                <label className="block text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">
                  Strains <span className="normal-case font-medium">(Must contain ALL selected)</span>
                </label>
                <div className="flex flex-wrap gap-2 p-2 border border-gray-100 rounded-lg min-h-[42px] bg-white shadow-sm">
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
                        className={`px-3 py-1 rounded-full text-xs font-medium border transition-all ${
                          isSelected 
                            ? 'bg-blue-600 text-white border-blue-600 shadow-sm' 
                            : 'bg-gray-50 text-gray-600 border-gray-100 hover:bg-gray-100'
                        }`}
                      >
                        {s.name}
                      </button>
                    );
                  })}
                  {strainFilters.length === 0 && <span className="text-gray-400 text-sm ml-1 self-center italic">No strains selected...</span>}
                </div>
              </div>
              
              <div className="lg:col-span-3">
                <label className="block text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">
                  Density Range <span className="normal-case font-medium">(parasites/µL)</span>
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    placeholder="Min"
                    className="block w-full px-3 py-2 border border-gray-100 bg-white rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-shadow min-w-0"
                    value={minDensity}
                    onChange={(e) => setMinDensity(e.target.value)}
                  />
                  <span className="text-gray-400 font-medium text-xs">to</span>
                  <input
                    type="number"
                    placeholder="Max"
                    className="block w-full px-3 py-2 border border-gray-100 bg-white rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-shadow min-w-0"
                    value={maxDensity}
                    onChange={(e) => setMaxDensity(e.target.value)}
                  />
                </div>
              </div>

              {activeTab === 'batches' && (
                <div className="lg:col-span-3">
                  <label className="block text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">Production Date Range</label>
                  <div className="flex items-center gap-2">
                    <input
                      type="date"
                      className="block w-full px-2 py-2 border border-gray-100 bg-white rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-shadow min-w-0"
                      value={dateFrom}
                      onChange={(e) => setDateFrom(e.target.value)}
                    />
                    <span className="text-gray-400 font-medium">to</span>
                    <input
                      type="date"
                      className="block w-full px-2 py-2 border border-gray-100 bg-white rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-shadow min-w-0"
                      value={dateTo}
                      onChange={(e) => setDateTo(e.target.value)}
                    />
                  </div>
                </div>
              )}
            </div>

            {/* Clear All Action */}
            {(searchTerm || dateFrom || dateTo || strainFilters.length > 0 || minDensity || maxDensity) && (
              <div className="flex justify-end items-center pt-2 border-t border-gray-50">
                <button
                  onClick={() => {
                    setSearchTerm('')
                    setDateFrom('')
                    setDateTo('')
                    setStrainFilters([])
                    setMinDensity('')
                    setMaxDensity('')
                  }}
                  className="flex items-center gap-2 text-sm text-red-600 hover:text-red-700 font-bold px-4 py-2 bg-red-50 hover:bg-red-100 rounded-lg transition-all duration-200 active:scale-95"
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

        <div className="p-0">
          {activeTab === 'batches' ? (
            <DataTable
              data={filteredBatches}
              columns={batchColumns}
              loading={loading}
              initialSortColumn="productionDate"
              initialSortDirection="desc"
              onRowClick={(batch) => navigate(`/blood-controls/batches/${batch.id}`)}
              emptyMessage={searchTerm || dateFrom || dateTo ? "No batches matching your filters" : "No blood control batches found"}
            />
          ) : (
            <DataTable
              data={filteredDefinitions}
              columns={definitionColumns}
              loading={loading}
              initialSortColumn="name"
              initialSortDirection="asc"
              onRowClick={(def) => navigate(`/blood-controls/${def.id}`)}
              emptyMessage={searchTerm || minDensity || maxDensity ? "No definitions matching your filters" : "No blood control definitions found"}
            />
          )}
        </div>
      </div>
    </div>
  )
}


