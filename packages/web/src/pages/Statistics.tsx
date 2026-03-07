import { useState, useEffect, useMemo } from 'react'
import { useSearchParams } from 'react-router-dom'
import { statisticsApi, type StatisticsData, type StatisticsFilters as ApiFilters } from '../lib/api'
import StatisticsFilter, { type StatisticsFilters } from '../components/StatisticsFilter'
import StatCard from '../components/StatCard'
import StatChart from '../components/StatChart'
import SkeletonCard from '../components/SkeletonCard'
import '../styles/statistics.css'

type BinSize = 'day' | 'week' | 'month' | 'quarter' | 'year'

/** Time-range presets for histogram minimum date (client-side). */
const TIME_PRESETS = [
  { label: 'Last 30 days', getMinDate: () => formatDateOffset(30) },
  { label: 'Last 6 months', getMinDate: () => formatDateOffset(180) },
  { label: 'This year', getMinDate: () => {
    const d = new Date()
    return `${d.getFullYear()}-01-01`
  }},
  { label: 'All time', getMinDate: () => '2000-01-01' },
] as const

function formatDateOffset(daysAgo: number): string {
  const d = new Date()
  d.setDate(d.getDate() - daysAgo)
  return d.toISOString().slice(0, 10)
}

/** Build human-readable filter chip labels from applied filters. */
function buildFilterChips(f: StatisticsFilters): Array<{ key: keyof StatisticsFilters; label: string }> {
  const chips: Array<{ key: keyof StatisticsFilters; label: string }> = []
  if (f.study) chips.push({ key: 'study', label: `Study: ${f.study}` })
  if (f.sourceType) {
    const label = { subject: 'Subject', control: 'Control', reagent: 'Reagent', cell_line: 'Cell Line', plasmid: 'Plasmid', standard: 'Standard' }[f.sourceType] ?? f.sourceType
    chips.push({ key: 'sourceType', label: `Source: ${label}` })
  }
  if (f.specimenTypeId) chips.push({ key: 'specimenTypeId', label: `Specimen type: ${f.specimenTypeId}` })
  if (f.containerType) {
    const label = { micronix_tube: 'Micronix Tube', cryovial_tube: 'Cryovial Tube', paper: 'Paper', static_well: 'Static Well' }[f.containerType] ?? f.containerType
    chips.push({ key: 'containerType', label: `Container: ${label}` })
  }
  if (f.tagIds?.length) chips.push({ key: 'tagIds', label: `Tags: ${f.tagIds.length} selected` })
  if (f.collectionDateFrom) chips.push({ key: 'collectionDateFrom', label: `Collection from: ${f.collectionDateFrom}` })
  if (f.collectionDateTo) chips.push({ key: 'collectionDateTo', label: `Collection to: ${f.collectionDateTo}` })
  if (f.createdFrom) chips.push({ key: 'createdFrom', label: `Created from: ${f.createdFrom}` })
  if (f.createdTo) chips.push({ key: 'createdTo', label: `Created to: ${f.createdTo}` })
  if (f.locationId || (f.locationSelections?.length ?? 0) > 0) {
    const name = f.locationSelections?.[0]?.name ?? `Location ${f.locationId ?? ''}`
    chips.push({ key: 'locationId', label: `Location: ${name}` })
  }
  return chips
}

export default function Statistics() {
  const [data, setData] = useState<StatisticsData | null>(null)
  const [loading, setLoading] = useState(true)
  const [filters, setFilters] = useState<StatisticsFilters>({})
  const [appliedFilters, setAppliedFilters] = useState<StatisticsFilters>({})
  const [searchParams, setSearchParams] = useSearchParams()
  const binParam = searchParams.get('bin')
  const binSize: BinSize =
    binParam === 'week' || binParam === 'month' || binParam === 'quarter' || binParam === 'year'
      ? binParam
      : 'day'
  const histogramMinDate = searchParams.get('minDate') ?? '2000-01-01'

  const setBinSize = (size: BinSize) => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev)
      next.set('bin', size)
      return next
    })
  }

  const setHistogramMinDate = (date: string) => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev)
      next.set('minDate', date)
      return next
    })
  }

  // Load initial statistics
  useEffect(() => {
    loadStatistics(appliedFilters)
  }, [])

  const loadStatistics = async (filtersToApply: StatisticsFilters) => {
    try {
      setLoading(true)
      // Convert frontend filters to API format
      const apiFilters: ApiFilters = {}
      if (filtersToApply.study) apiFilters.study = filtersToApply.study
      if (filtersToApply.sourceType) apiFilters.source_type = filtersToApply.sourceType
      if (filtersToApply.specimenTypeId) apiFilters.specimen_type_id = filtersToApply.specimenTypeId
      if (filtersToApply.containerType) apiFilters.container_type = filtersToApply.containerType
      if (filtersToApply.tagIds && filtersToApply.tagIds.length > 0) {
        apiFilters.tag_ids = filtersToApply.tagIds.map(id => parseInt(id)).filter(id => !isNaN(id))
      }
      if (filtersToApply.collectionDateFrom) apiFilters.collection_date_from = filtersToApply.collectionDateFrom
      if (filtersToApply.collectionDateTo) apiFilters.collection_date_to = filtersToApply.collectionDateTo
      if (filtersToApply.createdFrom) apiFilters.created_from = filtersToApply.createdFrom
      if (filtersToApply.createdTo) apiFilters.created_to = filtersToApply.createdTo
      if (filtersToApply.locationId) apiFilters.location_id = filtersToApply.locationId

      const response = await statisticsApi.get(apiFilters)
      const raw = response.data
      const specimens = raw.specimens
      const containers = raw.containers
      const storage = raw.storage
      setData({
        specimens: {
          total: specimens.total,
          bySourceType: specimens.bySourceType,
          bySpecimenType: specimens.bySpecimenType,
          byStudy: specimens.byStudy,
          collectionTimeline: Array.isArray(specimens.collectionTimeline) ? specimens.collectionTimeline : [],
          creationTimeline: Array.isArray(specimens.creationTimeline) ? specimens.creationTimeline : [],
        },
        containers: {
          total: containers.total,
          byType: containers.byType,
          byTags: containers.byTags,
          byState: containers.byState,
          averagePerSpecimen: typeof containers.averagePerSpecimen === 'number' ? containers.averagePerSpecimen : 0,
        },
        storage: {
          byLocation: Array.isArray(storage.byLocation) ? storage.byLocation : [],
          byRootLocation: storage.byRootLocation,
        },
      })
      setAppliedFilters(filtersToApply)
    } catch (error) {
      console.error('Failed to load statistics:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleFilterSubmit = (newFilters: StatisticsFilters) => {
    loadStatistics(newFilters)
  }

  const handleRemoveFilter = (key: keyof StatisticsFilters) => {
    const next = { ...appliedFilters }
    if (key === 'locationId') {
      delete next.locationId
      delete next.locationSelections
    } else {
      delete next[key]
    }
    setFilters(next)
    loadStatistics(next)
  }

  const hasActiveFilters = Object.keys(appliedFilters).length > 0
  const filterChips = useMemo(() => buildFilterChips(appliedFilters), [appliedFilters])
  const isEmptyWithFilters = data !== null && data.specimens.total === 0 && hasActiveFilters

  /** Section one-liners derived from current data. */
  const specimenSummary = useMemo(() => {
    if (!data) return ''
    const n = data.specimens.total
    const studies = Object.keys(data.specimens.byStudy).length
    const specimenTypeEntries = Object.entries(data.specimens.bySpecimenType).sort((a, b) => b[1] - a[1])
    const topType = specimenTypeEntries.length > 0 ? specimenTypeEntries[0][0] : '—'
    return `${n.toLocaleString()} specimens across ${studies} studies; top type: ${topType}`
  }, [data])
  const containerSummary = useMemo(() => {
    if (!data) return ''
    const n = data.containers.total
    const types = Object.keys(data.containers.byType).length
    const avg = data.containers.averagePerSpecimen.toFixed(1)
    return `${n.toLocaleString()} containers across ${types} types; avg ${avg} per specimen`
  }, [data])
  const storageSummary = useMemo(() => {
    if (!data) return ''
    const n = data.storage.byLocation.length
    const locs = data.storage.byLocation
    const firstLoc = locs.length > 0 ? locs[0].location : '—'
    const topName = firstLoc.length > 25 ? firstLoc.slice(0, 25) + '…' : firstLoc
    return `${n} locations; top: ${topName}`
  }, [data])

  // Transform data for charts
  const sourceTypeChartData = useMemo(() => {
    if (!data) return []
    return Object.entries(data.specimens.bySourceType).map(([name, value]) => ({
      name: name.charAt(0).toUpperCase() + name.slice(1).replace('_', ' '),
      value,
    }))
  }, [data])

  const specimenTypeChartData = useMemo(() => {
    if (!data) return []
    return Object.entries(data.specimens.bySpecimenType)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([name, value]) => ({ name, value }))
  }, [data])

  const studyChartData = useMemo(() => {
    if (!data) return []
    return Object.entries(data.specimens.byStudy)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([name, value]) => ({ name, value }))
  }, [data])

  const containerTypeChartData = useMemo(() => {
    if (!data) return []
    return Object.entries(data.containers.byType).map(([name, value]) => ({
      name: name.replace('_', ' ').replace(/\b\w/g, l => l.toUpperCase()),
      value,
    }))
  }, [data])

  const containerTagChartData = useMemo(() => {
    if (!data) return []
    return Object.entries(data.containers.byTags)
      .sort((a, b) => b[1] - a[1])
      .map(([name, value]) => ({ name, value }))
  }, [data])

  // Helper function to get bin key for a date based on bin size
  const getBinKey = (dateString: string, size: BinSize): string => {
    const date = new Date(dateString)
    const year = date.getFullYear()
    const month = date.getMonth() + 1
    const day = date.getDate()
    
    switch (size) {
      case 'day':
        return dateString
      case 'week': {
        // Get week number (ISO week)
        const d = new Date(Date.UTC(year, month - 1, day))
        d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7))
        const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1))
        const weekNo = Math.ceil((((d.getTime() - yearStart.getTime()) / 86400000) + 1) / 7)
        return `${year}-W${String(weekNo).padStart(2, '0')}`
      }
      case 'month':
        return `${year}-${String(month).padStart(2, '0')}`
      case 'quarter': {
        const quarter = Math.floor((month - 1) / 3) + 1
        return `${year}-Q${quarter}`
      }
      case 'year':
        return String(year)
      default:
        return dateString
    }
  }

  // Helper function to format bin key for display
  const formatBinKey = (key: string, size: BinSize): string => {
    switch (size) {
      case 'day': {
        const date = new Date(key)
        return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
      }
      case 'week': {
        const [year, week] = key.split('-W')
        return `${year} Week ${week}`
      }
      case 'month': {
        const [year, month] = key.split('-')
        const date = new Date(parseInt(year), parseInt(month) - 1, 1)
        return date.toLocaleDateString('en-US', { month: 'short', year: 'numeric' })
      }
      case 'quarter':
        return key.replace('-Q', ' Q')
      case 'year':
        return key
      default:
        return key
    }
  }

  const collectionTimelineData = useMemo(() => {
    if (!data) return []
    const minTimestamp = histogramMinDate ? new Date(histogramMinDate).getTime() : 0
    const grouped = data.specimens.collectionTimeline
      .filter(({ date }) => {
        const dateTimestamp = new Date(date).getTime()
        return dateTimestamp >= minTimestamp
      })
      .reduce((acc, { date, count }) => {
        const binKey = getBinKey(date, binSize)
        const existing = acc.find(x => x.date === binKey)
        if (existing) {
          existing.count += count
        } else {
          acc.push({ date: binKey, count })
        }
        return acc
      }, [] as Array<{ date: string; count: number }>)
      .sort((a, b) => a.date.localeCompare(b.date))

    return grouped.map(({ date, count }) => ({
      name: formatBinKey(date, binSize),
      value: count,
    }))
  }, [data, binSize, histogramMinDate])

  const creationTimelineData = useMemo(() => {
    if (!data) return []
    const minTimestamp = histogramMinDate ? new Date(histogramMinDate).getTime() : 0
    const grouped = data.specimens.creationTimeline
      .filter(({ date }) => {
        const dateTimestamp = new Date(date).getTime()
        return dateTimestamp >= minTimestamp
      })
      .reduce((acc, { date, count }) => {
        const binKey = getBinKey(date, binSize)
        const existing = acc.find(x => x.date === binKey)
        if (existing) {
          existing.count += count
        } else {
          acc.push({ date: binKey, count })
        }
        return acc
      }, [] as Array<{ date: string; count: number }>)
      .sort((a, b) => a.date.localeCompare(b.date))

    return grouped.map(({ date, count }) => ({
      name: formatBinKey(date, binSize),
      value: count,
    }))
  }, [data, binSize, histogramMinDate])

  const locationChartData = useMemo(() => {
    if (!data) return []
    return data.storage.byLocation.slice(0, 10).map(({ location, count }) => ({
      name: location.length > 30 ? location.substring(0, 30) + '...' : location,
      value: count,
      fullName: location,
    }))
  }, [data])

  const byRootLocationChartData = useMemo(() => {
    if (!data) return []
    return Object.entries(data.storage.byRootLocation).map(([name, value]) => ({
      name,
      value,
    }))
  }, [data])

  if (loading && !data) {
    return (
      <div className="statistics-page relative z-10 min-h-full">
        <div className="container mx-auto px-4 py-8 relative z-10">
          <div className="mb-6">
            <div className="statistics-skeleton h-9 w-64 rounded animate-pulse" />
            <div className="statistics-skeleton mt-2 h-5 w-96 rounded animate-pulse" />
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
            {Array.from({ length: 4 }).map((_, i) => (
              <SkeletonCard key={i} height="h-24" className="statistics-card border border-slate-200" />
            ))}
          </div>
          <div className="text-center py-8" style={{ color: 'rgb(var(--app-text-muted))' }}>
            Loading statistics…
          </div>
        </div>
      </div>
    )
  }

  if (!data) {
    return (
      <div className="statistics-page relative z-10 min-h-full">
        <div className="container mx-auto px-4 py-8 relative z-10">
          <div className="mb-6">
            <h1 className="text-3xl font-bold">Statistics & Analytics</h1>
            <p className="mt-1" style={{ color: 'rgb(var(--app-text-muted))' }}>Comprehensive statistics about specimens, containers, and storage utilization</p>
          </div>
          <div className="statistics-card p-6 text-center" style={{ color: 'rgb(var(--app-trend-down))' }}>
            Failed to load statistics
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="statistics-page relative z-10 min-h-full">
      <div className="container mx-auto px-4 py-8 relative z-10">
        {/* Hero */}
        <div className="mb-6">
          <h1 className="text-3xl font-bold">Statistics & Analytics</h1>
          <p className="mt-1" style={{ color: 'rgb(var(--app-text-muted))' }}>
            Comprehensive statistics about specimens, containers, and storage utilization
          </p>
        </div>

        <StatisticsFilter
          filters={appliedFilters}
          onChange={setFilters}
          onSubmit={handleFilterSubmit}
          isLoading={loading}
          className="statistics-card mb-6"
        />

        {/* Filter chips */}
        {filterChips.length > 0 && (
          <div className="flex flex-wrap items-center gap-2 mb-4">
            {filterChips.map(({ key, label }) => (
              <span
                key={key}
                className="statistics-chip inline-flex items-center gap-1.5 pl-3 pr-1 py-1"
              >
                <span>{label}</span>
                <button
                  type="button"
                  onClick={() => handleRemoveFilter(key)}
                  className="rounded p-0.5 hover:bg-black/10 focus:outline-none focus-visible:ring-2"
                  style={{ color: 'rgb(var(--app-text))' }}
                  aria-label={`Remove ${label}`}
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </span>
            ))}
            <button
              type="button"
              onClick={() => {
                setFilters({})
                loadStatistics({})
              }}
              className="statistics-link text-sm"
            >
              Clear all
            </button>
          </div>
        )}

        {/* Loading overlay when refreshing with data */}
        {loading && (
          <div className="mb-6 p-4 rounded-lg flex items-center gap-3 border" style={{ backgroundColor: 'rgb(var(--app-accent-muted))', borderColor: 'rgb(var(--app-accent) / 0.3)' }}>
            <svg className="animate-spin h-5 w-5 flex-shrink-0" style={{ color: 'rgb(var(--app-accent-hover))' }} fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
            </svg>
            <span className="font-medium" style={{ color: 'rgb(var(--app-accent-hover))' }}>Updating statistics…</span>
          </div>
        )}

        {/* Unified empty state */}
        {isEmptyWithFilters && (
          <div className="statistics-card p-6 mb-8 text-center">
            <p className="text-lg font-medium mb-2" style={{ color: 'rgb(var(--app-text))' }}>
              No data for this filter combination
            </p>
            <p className="text-sm mb-4" style={{ color: 'rgb(var(--app-text-muted))' }}>
              Try broadening or clearing filters to see statistics.
            </p>
            <button
              type="button"
              onClick={() => {
                setFilters({})
                loadStatistics({})
              }}
              className="statistics-btn-primary px-4 py-2 rounded-lg text-sm"
            >
              Clear filters
            </button>
          </div>
        )}

        {/* Summary Cards */}
        {!isEmptyWithFilters && (
          <>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
              <StatCard
                title="Total Specimens"
                value={data.specimens.total}
                subtitle={`Across ${Object.keys(data.specimens.byStudy).length} studies`}
                className="statistics-card p-6"
              />
              <StatCard
                title="Total Containers"
                value={data.containers.total}
                subtitle={`Avg ${data.containers.averagePerSpecimen.toFixed(2)} per specimen`}
                className="statistics-card p-6"
              />
              <StatCard
                title="Storage Locations"
                value={data.storage.byLocation.length}
                subtitle="Active storage locations"
                className="statistics-card p-6"
              />
              <StatCard
                title="Container Types"
                value={Object.keys(data.containers.byType).length}
                subtitle="Different container types in use"
                className="statistics-card p-6"
              />
            </div>

            {/* Timeline chart display: bin/date apply only to Collection and Creation timeline charts */}
            <div className="statistics-card p-4 mb-8">
              <h3 className="text-sm font-semibold mb-1" style={{ color: 'rgb(var(--app-text))' }}>
                Timeline chart display
              </h3>
              <p className="text-sm mb-4" style={{ color: 'rgb(var(--app-text-muted))' }}>
                Bin size and date range apply only to the Collection Timeline and Creation Timeline charts below.
              </p>
              <div className="flex flex-wrap items-center gap-4 md:gap-6">
                <div className="flex items-center gap-2">
                  <label className="text-sm font-medium" style={{ color: 'rgb(var(--app-text))' }}>
                    Bin size:
                  </label>
                  <select
                    value={binSize}
                    onChange={(e) => setBinSize(e.target.value as BinSize)}
                    className="px-3 py-2 rounded-lg border text-sm focus:ring-2 focus:ring-offset-0"
                    style={{ borderColor: 'rgb(var(--app-border))', outlineColor: 'rgb(var(--app-accent))' }}
                  >
                    <option value="day">Daily</option>
                    <option value="week">Weekly</option>
                    <option value="month">Monthly</option>
                    <option value="quarter">Quarterly</option>
                    <option value="year">Yearly</option>
                  </select>
                </div>
                <div className="flex items-center gap-2">
                  <label className="text-sm font-medium" style={{ color: 'rgb(var(--app-text))' }}>
                    Min date:
                  </label>
                  <input
                    type="date"
                    value={histogramMinDate}
                    onChange={(e) => setHistogramMinDate(e.target.value)}
                    className="px-3 py-2 rounded-lg border text-sm focus:ring-2 focus:ring-offset-0"
                    style={{ borderColor: 'rgb(var(--app-border))', outlineColor: 'rgb(var(--app-accent))' }}
                  />
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  {TIME_PRESETS.map((preset) => (
                    <button
                      key={preset.label}
                      type="button"
                      onClick={() => setHistogramMinDate(preset.getMinDate())}
                      className="statistics-link text-sm px-2 py-1 rounded hover:underline"
                    >
                      {preset.label}
                    </button>
                  ))}
                  <button
                    type="button"
                    onClick={() => setHistogramMinDate('2000-01-01')}
                    className="text-sm px-3 py-1.5 rounded border transition-colors hover:bg-slate-100"
                    style={{ borderColor: 'rgb(var(--app-border))', color: 'rgb(var(--app-text-muted))' }}
                  >
                    Reset
                  </button>
                </div>
              </div>
            </div>
          </>
        )}

        {/* Specimen Statistics */}
        {!isEmptyWithFilters && (
          <div className="mb-8">
            <h2 className="statistics-section-title mb-1">Specimen Overview</h2>
            <p className="text-sm mb-4" style={{ color: 'rgb(var(--app-text-muted))' }}>{specimenSummary}</p>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <StatChart
                type="pie"
                data={sourceTypeChartData}
                title="Specimens by Source Type"
                showPercentageList={true}
                cardClassName="statistics-card p-6"
              />
              <StatChart
                type="bar"
                data={specimenTypeChartData}
                title="Top Specimen Types"
                cardClassName="statistics-card p-6"
              />
              <StatChart
                type="bar"
                data={studyChartData}
                title="Specimens by Study"
                cardClassName="statistics-card p-6"
              />
              <StatChart
                type="bar"
                data={collectionTimelineData}
                title="Collection Timeline"
                xKey="name"
                yKey="value"
                cardClassName="statistics-card p-6"
              />
            </div>
          </div>
        )}

        {/* Container Statistics */}
        {!isEmptyWithFilters && (
          <div className="mb-8">
            <h2 className="statistics-section-title mb-1">Container Overview</h2>
            <p className="text-sm mb-4" style={{ color: 'rgb(var(--app-text-muted))' }}>{containerSummary}</p>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <StatChart
                type="pie"
                data={containerTypeChartData}
                title="Containers by Type"
                showPercentageList={true}
                cardClassName="statistics-card p-6"
              />
              <StatChart
                type="bar"
                data={containerTagChartData}
                title="Containers by Tags"
                cardClassName="statistics-card p-6"
              />
              <StatChart
                type="bar"
                data={creationTimelineData}
                title="Creation Timeline"
                xKey="name"
                yKey="value"
                cardClassName="statistics-card p-6"
              />
            </div>
          </div>
        )}

        {/* Storage Statistics */}
        {!isEmptyWithFilters && (
          <div className="mb-8">
            <h2 className="statistics-section-title mb-1">Storage Utilization</h2>
            <p className="text-sm mb-4" style={{ color: 'rgb(var(--app-text-muted))' }}>{storageSummary}</p>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <StatChart
                type="bar"
                data={locationChartData}
                title="Top Storage Locations"
                cardClassName="statistics-card p-6"
              />
              <StatChart
                type="pie"
                data={byRootLocationChartData}
                title="Containers by Root Location"
                showPercentageList={true}
                cardClassName="statistics-card p-6"
              />
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

