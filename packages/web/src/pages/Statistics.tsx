import { useState, useEffect, useMemo } from 'react'
import { useSearchParams } from 'react-router-dom'
import { statisticsApi, type StatisticsData, type StatisticsFilters as ApiFilters } from '../lib/api'
import StatisticsFilter, { type StatisticsFilters } from '../components/StatisticsFilter'
import StatCard from '../components/StatCard'
import StatChart from '../components/StatChart'

type BinSize = 'day' | 'week' | 'month' | 'quarter' | 'year'

export default function Statistics() {
  const [data, setData] = useState<StatisticsData | null>(null)
  const [loading, setLoading] = useState(true)
  const [filters, setFilters] = useState<StatisticsFilters>({})
  const [appliedFilters, setAppliedFilters] = useState<StatisticsFilters>({})
  const [searchParams, setSearchParams] = useSearchParams()
  const binSize = (searchParams.get('bin') as BinSize) || 'day'
  const histogramMinDate = searchParams.get('minDate') || '2000-01-01'

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
      if (filtersToApply.stateId) apiFilters.state_id = filtersToApply.stateId
      if (filtersToApply.collectionDateFrom) apiFilters.collection_date_from = filtersToApply.collectionDateFrom
      if (filtersToApply.collectionDateTo) apiFilters.collection_date_to = filtersToApply.collectionDateTo
      if (filtersToApply.createdFrom) apiFilters.created_from = filtersToApply.createdFrom
      if (filtersToApply.createdTo) apiFilters.created_to = filtersToApply.createdTo
      if (filtersToApply.locationRoot) apiFilters.location_root = filtersToApply.locationRoot
      if (filtersToApply.locationLevelI) apiFilters.location_level_i = filtersToApply.locationLevelI
      if (filtersToApply.locationLevelII) apiFilters.location_level_ii = filtersToApply.locationLevelII
      if (filtersToApply.locationId) apiFilters.location_id = filtersToApply.locationId

      const response = await statisticsApi.get(apiFilters)
      setData(response.data)
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

  const containerStateChartData = useMemo(() => {
    if (!data) return []
    return Object.entries(data.containers.byState).map(([name, value]) => ({
      name,
      value,
    }))
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
    
    // Filter by minimum date and group by bin size
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
    
    // Filter by minimum date and group by bin size
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

  const locationRootChartData = useMemo(() => {
    if (!data) return []
    return Object.entries(data.storage.byLocationRoot).map(([name, value]) => ({
      name,
      value,
    }))
  }, [data])

  if (loading && !data) {
    return (
      <div className="container mx-auto px-4 py-8">
        <div className="text-center py-8">Loading statistics...</div>
      </div>
    )
  }

  if (!data) {
    return (
      <div className="container mx-auto px-4 py-8">
        <div className="text-center py-8 text-red-600">Failed to load statistics</div>
      </div>
    )
  }

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="mb-6">
        <h1 className="text-3xl font-bold text-gray-900">Statistics & Analytics</h1>
        <p className="text-gray-500 mt-1">Comprehensive statistics about specimens, containers, and storage utilization</p>
      </div>

      {/* Histogram Controls - At the top */}
      <div className="bg-white rounded-lg shadow p-4 mb-6">
        <div className="flex items-center gap-6 flex-wrap">
          <div className="flex items-center gap-4">
            <label className="text-sm font-medium text-gray-700">
              Histogram Bin Size:
            </label>
            <select
              value={binSize}
              onChange={(e) => setBinSize(e.target.value as BinSize)}
              className="px-3 py-2 border border-gray-100 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            >
              <option value="day">Daily</option>
              <option value="week">Weekly</option>
              <option value="month">Monthly</option>
              <option value="quarter">Quarterly</option>
              <option value="year">Yearly</option>
            </select>
          </div>
          <div className="flex items-center gap-4">
            <label className="text-sm font-medium text-gray-700">
              Minimum Date:
            </label>
            <input
              type="date"
              value={histogramMinDate}
              onChange={(e) => setHistogramMinDate(e.target.value)}
              className="px-3 py-2 border border-gray-100 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
            <button
              onClick={() => setHistogramMinDate('2000-01-01')}
              className="px-4 py-2 text-sm text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
            >
              Reset
            </button>
          </div>
        </div>
      </div>

      <StatisticsFilter 
        filters={appliedFilters} 
        onChange={setFilters} 
        onSubmit={handleFilterSubmit}
        isLoading={loading}
      />

      {/* Loading Overlay */}
      {loading && data && (
        <div className="mb-6 p-4 bg-blue-50 border border-blue-200 rounded-lg flex items-center gap-3">
          <svg className="animate-spin h-5 w-5 text-blue-600" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
          </svg>
          <span className="text-blue-800 font-medium">Updating statistics...</span>
        </div>
      )}

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
        <StatCard
          title="Total Specimens"
          value={data.specimens.total}
          subtitle={`Across ${Object.keys(data.specimens.byStudy).length} studies`}
        />
        <StatCard
          title="Total Containers"
          value={data.containers.total}
          subtitle={`Avg ${data.containers.averagePerSpecimen.toFixed(2)} per specimen`}
        />
        <StatCard
          title="Container Types"
          value={Object.keys(data.containers.byType).length}
          subtitle="Different container types in use"
        />
        <StatCard
          title="Storage Locations"
          value={data.storage.byLocation.length}
          subtitle="Active storage locations"
        />
      </div>

      {/* Specimen Statistics */}
      <div className="mb-8">
        <h2 className="text-2xl font-bold text-gray-900 mb-4">Specimen Overview</h2>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <StatChart
            type="pie"
            data={sourceTypeChartData}
            title="Specimens by Source Type"
            showPercentageList={true}
          />
          <StatChart
            type="bar"
            data={specimenTypeChartData}
            title="Top Specimen Types"
          />
          <StatChart
            type="bar"
            data={studyChartData}
            title="Specimens by Study"
          />
          <StatChart
            type="bar"
            data={collectionTimelineData}
            title="Collection Timeline"
            xKey="name"
            yKey="value"
          />
        </div>
      </div>

      {/* Container Statistics */}
      <div className="mb-8">
        <h2 className="text-2xl font-bold text-gray-900 mb-4">Container Overview</h2>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <StatChart
            type="pie"
            data={containerTypeChartData}
            title="Containers by Type"
            showPercentageList={true}
          />
          <StatChart
            type="bar"
            data={containerStateChartData}
            title="Containers by State"
          />
          <StatChart
            type="bar"
            data={creationTimelineData}
            title="Creation Timeline"
            xKey="name"
            yKey="value"
          />
        </div>
      </div>

      {/* Storage Statistics */}
      <div className="mb-8">
        <h2 className="text-2xl font-bold text-gray-900 mb-4">Storage Utilization</h2>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <StatChart
            type="bar"
            data={locationChartData}
            title="Top Storage Locations"
          />
          <StatChart
            type="pie"
            data={locationRootChartData}
            title="Containers by Location Root"
            showPercentageList={true}
          />
        </div>
      </div>
    </div>
  )
}

