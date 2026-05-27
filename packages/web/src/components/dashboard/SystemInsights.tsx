import { Link } from 'react-router-dom'
import { useMemo } from 'react'
import StatChart from '../StatChart'
import { StatisticsData } from '../../lib/api/statistics';
import SkeletonCard from '../SkeletonCard'
import { useTheme } from '../../contexts/ThemeContext'
import { getAppChartColors } from '../../lib/chart-colors'

interface SystemInsightsProps {
  data: StatisticsData | null
  loading?: boolean
}

export default function SystemInsights({ data, loading }: SystemInsightsProps) {
  const { theme } = useTheme()
  const chartColors = useMemo(() => getAppChartColors(), [theme])

  if (loading || !data) {
    return (
      <section className="mb-8" aria-labelledby="system-insights-title">
        <h2 id="system-insights-title" className="dashboard-section-title mb-4">System Insights</h2>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {Array.from({ length: 4 }).map((_, i) => (
            <SkeletonCard key={i} height="h-64" />
          ))}
        </div>
      </section>
    )
  }

  // Prepare data for charts
  const sourceTypeData = Object.entries(data.specimens.bySourceType).map(([name, value]) => ({
    name,
    value,
  }))

  const specimenTypeData = Object.entries(data.specimens.bySpecimenType)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 10)
    .map(([name, value]) => ({
      name,
      value,
    }))

  const containerTypeData = Object.entries(data.containers.byType)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 10)
    .map(([name, value]) => ({
      name,
      value,
    }))

  const studyData = Object.entries(data.specimens.byStudy)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 10)
    .map(([name, value]) => ({
      name,
      value,
    }))

  // Prepare collection timeline data (last 90 days for better visibility)
  const ninetyDaysAgo = new Date()
  ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90)
  
  // Get raw timeline data
  const rawTimelineData = data.specimens.collectionTimeline
    .filter((item) => new Date(item.date) >= ninetyDaysAgo)
    .map((item) => ({
      name: new Date(item.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
      value: item.count,
      date: new Date(item.date).getTime(),
    }))
    .sort((a, b) => a.date - b.date)
  
  // If we have more than 30 data points, aggregate by week for better visualization
  let collectionTimelineData: Array<{ name: string; value: number; date: number }>
  if (rawTimelineData.length > 30) {
    const weekMap = new Map<string, { name: string; value: number; date: number }>()
    
    rawTimelineData.forEach((item) => {
      const weekStart = new Date(item.date)
      weekStart.setDate(weekStart.getDate() - weekStart.getDay()) // Start of week
      const weekKey = weekStart.toISOString().split('T')[0]
      
      const existing = weekMap.get(weekKey)
      if (existing) {
        existing.value += item.value
      } else {
        weekMap.set(weekKey, {
          name: weekStart.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
          value: item.value,
          date: weekStart.getTime(),
        })
      }
    })
    
    collectionTimelineData = Array.from(weekMap.values()).sort((a, b) => a.date - b.date)
  } else {
    collectionTimelineData = rawTimelineData
  }

  const hasCharts = sourceTypeData.length > 0 || collectionTimelineData.length > 0 || 
                    containerTypeData.length > 0 || studyData.length > 0

  if (!hasCharts) {
    return (
      <section className="mb-8" aria-labelledby="system-insights-title">
        <div className="flex items-center justify-between mb-4">
          <h2 id="system-insights-title" className="dashboard-section-title">System Insights</h2>
          <Link to="/statistics" className="dashboard-link text-sm" aria-label="View full statistics">
            View Full Statistics →
          </Link>
        </div>
        <div className="dashboard-card p-6">
          <div className="text-center py-8 text-[rgb(var(--app-text-muted))]">No data available for insights</div>
        </div>
      </section>
    )
  }

  return (
    <section className="mb-8" aria-labelledby="system-insights-title">
      <div className="flex items-center justify-between mb-4">
        <h2 id="system-insights-title" className="dashboard-section-title">System Insights</h2>
        <Link to="/statistics" className="dashboard-link text-sm transition-colors" aria-label="View full statistics">
          View Full Statistics →
        </Link>
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {sourceTypeData.length > 0 && (
          <StatChart
            type="pie"
            data={sourceTypeData}
            title="Specimens by Source Type"
            showPercentageList={true}
            colors={chartColors}
            cardClassName="dashboard-card p-6"
          />
        )}

        {collectionTimelineData.length > 0 && (
          <StatChart
            type="line"
            data={collectionTimelineData}
            title="Collection Activity (Last 90 Days)"
            dateKey="date"
            xKey="name"
            yKey="value"
            colors={chartColors}
            cardClassName="dashboard-card p-6"
          />
        )}

        {containerTypeData.length > 0 && (
          <StatChart
            type="bar"
            data={containerTypeData}
            title="Container Types Distribution"
            xKey="name"
            yKey="value"
            colors={chartColors}
            cardClassName="dashboard-card p-6"
          />
        )}

        {studyData.length > 0 && (
          <StatChart
            type="bar"
            data={studyData}
            title="Top Studies by Specimen Count"
            xKey="name"
            yKey="value"
            colors={chartColors}
            cardClassName="dashboard-card p-6"
          />
        )}
      </div>
    </section>
  )
}

