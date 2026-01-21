import { useMemo, useState } from 'react'
import type { StudySummary, StudyTimelineData } from '../lib/api'
import StatCard from './StatCard'
import StatChart from './StatChart'
import { useDateFilter, defaultMinDate } from '../contexts/DateFilterContext'

interface StudyStatsProps {
  summary: StudySummary['summary']
  timelineData?: StudyTimelineData
}

type BinSize = 'day' | 'week' | 'month' | 'quarter' | 'year'

export default function StudyStats({ summary, timelineData }: StudyStatsProps) {
  const { settings } = useDateFilter()
  const { minDate, maxDate } = settings
  const [binSize, setBinSize] = useState<BinSize>('day')

  // Filter timeline data if available to recalculate stats
  const filteredData = useMemo(() => {
    if (!timelineData) return null

    const minTimestamp = minDate ? new Date(minDate).getTime() : 0
    const maxTimestamp = maxDate ? new Date(maxDate + 'T23:59:59').getTime() : Number.MAX_SAFE_INTEGER

    const filteredSpecimens: Array<{
      id: number
      collectionDate: string
      specimenTypeId: number
      specimenTypeName: string
    }> = []

    timelineData.subjects.forEach(subject => {
      subject.specimens.forEach(specimen => {
        if (!specimen.collectionDate) {
          // Include specimens with no date if the filter is at its default or empty
          if (minDate === defaultMinDate || !minDate) {
            filteredSpecimens.push(specimen)
          }
          return
        }
        const timestamp = new Date(specimen.collectionDate).getTime()
        if (timestamp >= minTimestamp && timestamp <= maxTimestamp) {
          filteredSpecimens.push(specimen)
        }
      })
    })

    return filteredSpecimens
  }, [timelineData, minDate, maxDate])

  // Helper function to get ISO week number for a date
  const getISOWeek = (date: Date): { year: number; week: number } => {
    const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()))
    const dayNum = d.getUTCDay() || 7
    d.setUTCDate(d.getUTCDate() + 4 - dayNum)
    const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1))
    const weekNo = Math.ceil((((d.getTime() - yearStart.getTime()) / 86400000) + 1) / 7)
    return { year: d.getUTCFullYear(), week: weekNo }
  }

  // Helper function to get bin key for a date based on bin size
  const getBinKey = (dateString: string, size: BinSize): string => {
    const date = new Date(dateString)
    const year = date.getFullYear()
    const month = date.getMonth() + 1
    const day = date.getDate()
    
    switch (size) {
      case 'day':
        return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
      case 'week': {
        // Get ISO week number
        const { year: weekYear, week } = getISOWeek(date)
        return `${weekYear}-W${String(week).padStart(2, '0')}`
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
        return dateString.split('T')[0]
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

  // Recalculate stats if we have filtered data
  const displaySummary = useMemo(() => {
    if (!filteredData) {
      return summary
    }

    // Count specimen types
    const specimenTypeCounts: Record<string, number> = {}
    filteredData.forEach(spec => {
      const typeName = spec.specimenTypeName
      specimenTypeCounts[typeName] = (specimenTypeCounts[typeName] || 0) + 1
    })

    // Collection dates (only truthy ones for range and timeline)
    const collectionDates = filteredData
      .map(s => s.collectionDate)
      .filter(Boolean)
      .sort()

    const collectionDateRange = collectionDates.length > 0
      ? {
          earliest: collectionDates[0],
          latest: collectionDates[collectionDates.length - 1],
        }
      : null

    const studyDurationDays = collectionDateRange
      ? Math.ceil(
          (new Date(collectionDateRange.latest).getTime() -
            new Date(collectionDateRange.earliest).getTime()) /
            (1000 * 60 * 60 * 24)
        )
      : null

    // Collection timeline - keep as daily (will be binned later in collectionTimelineData)
    // When we have filteredData, recreate timeline from filtered dates
    // Otherwise, use the original summary timeline
    const collectionTimeline = filteredData
      ? collectionDates.reduce((acc, date) => {
          const dateOnly = date.split('T')[0]
          const existing = acc.find(x => x.date === dateOnly)
          if (existing) {
            existing.count += 1
          } else {
            acc.push({ date: dateOnly, count: 1 })
          }
          return acc
        }, [] as Array<{ date: string; count: number }>)
          .sort((a, b) => a.date.localeCompare(b.date))
      : (summary.collectionTimeline || [])

    // Calculate unique subjects with filtered specimens (for display purposes only)
    // Note: totalSubjects should always be the total enrolled subjects, not filtered
    const uniqueSubjectIds = timelineData
      ? new Set(
          timelineData.subjects
            .filter(subject => 
              subject.specimens.some(spec => {
                if (!spec.collectionDate) {
                  return minDate === defaultMinDate || !minDate
                }
                const timestamp = new Date(spec.collectionDate).getTime()
                const minTimestamp = minDate ? new Date(minDate).getTime() : 0
                const maxTimestamp = maxDate ? new Date(maxDate + 'T23:59:59').getTime() : Number.MAX_SAFE_INTEGER
                return timestamp >= minTimestamp && timestamp <= maxTimestamp
              })
            )
            .map(s => s.id)
        )
      : new Set<number>()

    const totalSpecimens = filteredData.length
    // Always use the original totalSubjects from summary - date filters should not affect total enrolled subjects
    const totalSubjects = summary.totalSubjects

    return {
      ...summary,
      totalSubjects,
      totalSpecimens,
      averageSpecimensPerSubject: totalSubjects > 0 ? totalSpecimens / totalSubjects : 0,
      specimenTypes: Object.entries(specimenTypeCounts).map(([name, count]) => ({
        name,
        count,
        percentage: totalSpecimens > 0 ? (count / totalSpecimens) * 100 : 0,
      })),
      collectionDateRange,
      studyDurationDays,
      collectionTimeline,
      // Keep enrollment timeline from original summary (it's based on subject creation dates, not filtered)
      enrollmentTimeline: summary.enrollmentTimeline,
    }
  }, [summary, filteredData, timelineData, minDate, maxDate, binSize])
  // Transform data for charts using filtered summary
  const specimenTypeChartData = useMemo(() => {
    return displaySummary.specimenTypes.map((type) => ({
      name: type.name,
      value: type.count,
    }))
  }, [displaySummary.specimenTypes])

  const containerTypeChartData = useMemo(() => {
    return Object.entries(displaySummary.containerTypes).map(([type, count]) => ({
      name: type.replace(/_/g, ' ').replace(/\b\w/g, (l) => l.toUpperCase()),
      value: count,
    }))
  }, [displaySummary.containerTypes])

  // Helper function to get date value for a bin key (for x-axis positioning)
  const getBinDateValue = (binKey: string, size: BinSize): number => {
    switch (size) {
      case 'day': {
        // binKey is in format "YYYY-MM-DD"
        return new Date(binKey).getTime()
      }
      case 'week': {
        // binKey is in format "YYYY-WW" (ISO week)
        const [yearStr, weekStr] = binKey.split('-W')
        const year = parseInt(yearStr)
        const week = parseInt(weekStr)
        // Calculate the date of the first day (Monday) of the ISO week
        // ISO week 1 is the week containing January 4th
        const jan4 = new Date(Date.UTC(year, 0, 4))
        const jan4Day = jan4.getUTCDay() || 7 // Convert Sunday (0) to 7
        // Monday of week 1 is: Jan 4 - (dayOfWeek - 1) days
        // If Jan 4 is Monday (1), then Monday is Jan 4 (4 - 0 = 4)
        // If Jan 4 is Tuesday (2), then Monday is Jan 3 (4 - 1 = 3)
        // If Jan 4 is Sunday (7), then Monday is Dec 30 of previous year (4 - 6 = -2, which wraps)
        const daysFromJan4ToMonday = jan4Day - 1
        const week1Monday = new Date(Date.UTC(year, 0, 4 - daysFromJan4ToMonday))
        // Add (week - 1) weeks to get the Monday of the target week
        const weekStart = new Date(week1Monday)
        weekStart.setUTCDate(weekStart.getUTCDate() + (week - 1) * 7)
        return weekStart.getTime()
      }
      case 'month': {
        // binKey is in format "YYYY-MM"
        const [year, month] = binKey.split('-')
        return new Date(parseInt(year), parseInt(month) - 1, 1).getTime()
      }
      case 'quarter': {
        // binKey is in format "YYYY-QN"
        const [year, quarter] = binKey.split('-Q')
        const month = (parseInt(quarter) - 1) * 3
        return new Date(parseInt(year), month, 1).getTime()
      }
      case 'year': {
        // binKey is just the year
        return new Date(parseInt(binKey), 0, 1).getTime()
      }
      default:
        return new Date(binKey).getTime()
    }
  }

  const collectionTimelineData = useMemo(() => {
    // Group collection timeline by bin size
    // displaySummary.collectionTimeline contains daily data, so we need to bin it
    const collectionGrouped = displaySummary.collectionTimeline.reduce((acc, item) => {
      const binKey = getBinKey(item.date, binSize)
      const existing = acc.find(x => x.date === binKey)
      if (existing) {
        existing.count += item.count
      } else {
        acc.push({ date: binKey, count: item.count })
      }
      return acc
    }, [] as Array<{ date: string; count: number }>)
      .sort((a, b) => a.date.localeCompare(b.date))

    // Group enrollment timeline by bin size
    // enrollmentTimeline from summary is also daily, so we need to bin it
    const enrollmentGrouped = displaySummary.enrollmentTimeline.reduce((acc, item) => {
      const binKey = getBinKey(item.date, binSize)
      const existing = acc.find(x => x.date === binKey)
      if (existing) {
        existing.count += item.count
      } else {
        acc.push({ date: binKey, count: item.count })
      }
      return acc
    }, [] as Array<{ date: string; count: number }>)
      .sort((a, b) => a.date.localeCompare(b.date))

    return {
      collection: collectionGrouped.map((item) => ({
        name: formatBinKey(item.date, binSize),
        value: item.count,
        dateValue: getBinDateValue(item.date, binSize),
      })),
      enrollment: enrollmentGrouped.map((item) => ({
        name: formatBinKey(item.date, binSize),
        value: item.count,
        dateValue: getBinDateValue(item.date, binSize),
      })),
    }
  }, [displaySummary.collectionTimeline, displaySummary.enrollmentTimeline, binSize])

  return (
    <div className="space-y-6">
      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <StatCard
          title="Total Subjects"
          value={displaySummary.totalSubjects.toLocaleString()}
          subtitle="Enrolled participants"
        />
        <StatCard
          title="Total Specimens"
          value={displaySummary.totalSpecimens.toLocaleString()}
          subtitle="Collected samples"
        />
        <StatCard
          title="Total Containers"
          value={displaySummary.totalContainers.toLocaleString()}
          subtitle="Storage containers"
        />
        <StatCard
          title="Avg per Subject"
          value={displaySummary.averageSpecimensPerSubject.toFixed(1)}
          subtitle="Specimens per participant"
        />
      </div>

      {/* Study Duration and Date Range */}
      {(displaySummary.collectionDateRange || displaySummary.studyDurationDays !== null) && (
        <div className="bg-white rounded-lg shadow p-6">
          <h3 className="text-lg font-semibold mb-4 text-gray-900">Study Period</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {displaySummary.collectionDateRange && (
              <div>
                <p className="text-sm text-gray-500 mb-1">Collection Date Range</p>
                <p className="text-gray-900 font-medium">
                  {new Date(displaySummary.collectionDateRange.earliest).toLocaleDateString('en-US', {
                    month: 'long',
                    day: 'numeric',
                    year: 'numeric',
                  })}{' '}
                  -{' '}
                  {new Date(displaySummary.collectionDateRange.latest).toLocaleDateString('en-US', {
                    month: 'long',
                    day: 'numeric',
                    year: 'numeric',
                  })}
                </p>
              </div>
            )}
            {displaySummary.studyDurationDays !== null && (
              <div>
                <p className="text-sm text-gray-500 mb-1">Study Duration</p>
                <p className="text-gray-900 font-medium">
                  {displaySummary.studyDurationDays} {displaySummary.studyDurationDays === 1 ? 'day' : 'days'}
                </p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {specimenTypeChartData.length > 0 && (
          <StatChart
            type="pie"
            data={specimenTypeChartData}
            title="Specimens by Type"
            labelThreshold={5}
            showPercentageList={true}
          />
        )}
        {containerTypeChartData.length > 0 && (
          <StatChart
            type="bar"
            data={containerTypeChartData}
            title="Containers by Type"
          />
        )}
      </div>

      {/* Bin Size Selector - Above Histograms */}
      {(collectionTimelineData.collection.length > 0 || collectionTimelineData.enrollment.length > 0) && (
        <div className="bg-white rounded-lg shadow p-4">
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
        </div>
      )}

      {/* Histogram Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {collectionTimelineData.collection.length > 0 && (
          <StatChart
            type="bar"
            data={collectionTimelineData.collection}
            title="Collection Timeline"
            xKey="name"
            yKey="value"
            dateKey="dateValue"
          />
        )}
        {collectionTimelineData.enrollment.length > 0 && (
          <StatChart
            type="bar"
            data={collectionTimelineData.enrollment}
            title="Enrollment Timeline"
            xKey="name"
            yKey="value"
            dateKey="dateValue"
          />
        )}
      </div>
    </div>
  )
}

