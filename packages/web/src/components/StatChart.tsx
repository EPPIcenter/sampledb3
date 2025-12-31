import { useMemo } from 'react'
import { BarChart, Bar, PieChart, Pie, Cell, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts'

interface ChartData {
  name: string
  value: number
  [key: string]: string | number
}

interface StatChartProps {
  type: 'bar' | 'pie' | 'line'
  data: ChartData[]
  title?: string
  dataKey?: string
  xKey?: string
  yKey?: string
  dateKey?: string // Optional key for date-based x-axis (timestamp in milliseconds)
  colors?: string[]
  labelThreshold?: number // Percentage threshold below which labels are hidden (default: 5)
  showPercentageList?: boolean // Show percentage list for pie charts
}

const DEFAULT_COLORS = [
  '#3b82f6', // blue
  '#10b981', // green
  '#f59e0b', // amber
  '#ef4444', // red
  '#8b5cf6', // purple
  '#ec4899', // pink
  '#06b6d4', // cyan
  '#84cc16', // lime
]

export default function StatChart({
  type,
  data,
  title,
  dataKey = 'value',
  xKey = 'name',
  yKey = 'value',
  dateKey,
  colors = DEFAULT_COLORS,
  labelThreshold = 5,
  showPercentageList = false
}: StatChartProps) {
  if (data.length === 0) {
    return (
      <div className="bg-white rounded-lg shadow p-6">
        {title && <h3 className="text-lg font-semibold mb-4 text-gray-900">{title}</h3>}
        <div className="flex items-center justify-center h-64 text-gray-500">
          No data available
        </div>
      </div>
    )
  }

  // Calculate total for percentage calculations
  const total = data.reduce((sum, entry) => sum + (entry[dataKey] as number), 0)

  // Calculate percentages for pie chart
  const pieDataWithPercentages = type === 'pie'
    ? data.map((entry, index) => ({
      ...entry,
      percentage: total > 0 ? ((entry[dataKey] as number) / total) * 100 : 0,
      color: colors[index % colors.length],
    }))
    : []

  // Create a map of date values to formatted names for efficient lookup
  const dateValueToNameMap = useMemo(() => {
    if (!dateKey) return new Map<number, string>()
    const map = new Map<number, string>()
    data.forEach(entry => {
      const dateValue = entry[dateKey] as number
      if (dateValue != null) {
        map.set(dateValue, entry.name)
      }
    })
    return map
  }, [data, dateKey])

  // Get custom ticks for date-based axes (use actual data point positions)
  // Limit to reasonable number of ticks to avoid overcrowding
  const dateTicks = useMemo(() => {
    if (!dateKey) return undefined
    const allTicks = data.map(entry => entry[dateKey] as number).filter((val): val is number => val != null)
    if (allTicks.length === 0) return undefined

    // Limit to max 8 ticks for better readability
    if (allTicks.length <= 8) {
      return allTicks
    }

    // Show subset: first, last, and evenly spaced in between
    const maxTicks = 8
    const step = Math.ceil(allTicks.length / (maxTicks - 1))
    const selectedTicks: number[] = []

    // Always include first tick
    selectedTicks.push(allTicks[0])

    // Add evenly spaced ticks in the middle
    for (let i = step; i < allTicks.length - 1; i += step) {
      if (selectedTicks.length < maxTicks - 1) {
        selectedTicks.push(allTicks[i])
      }
    }

    // Always include last tick if not already included
    if (selectedTicks[selectedTicks.length - 1] !== allTicks[allTicks.length - 1]) {
      selectedTicks.push(allTicks[allTicks.length - 1])
    }

    return selectedTicks
  }, [data, dateKey])

  // Calculate domain with padding for date-based axes
  const dateDomain = useMemo(() => {
    if (!dateKey) return undefined
    const dateValues = data.map(entry => entry[dateKey] as number).filter((val): val is number => val != null)
    if (dateValues.length === 0) return undefined

    const min = Math.min(...dateValues)
    const max = Math.max(...dateValues)
    const range = max - min

    // Add 5% padding on each side, but at least 1 day worth of milliseconds
    const padding = Math.max(range * 0.05, 24 * 60 * 60 * 1000) // 1 day in milliseconds

    return [min - padding, max + padding]
  }, [data, dateKey])

  // Format date ticks for display
  const formatDateTick = (tickItem: number) => {
    if (!dateKey) return String(tickItem)
    // Try to find exact match first
    const name = dateValueToNameMap.get(tickItem)
    if (name) return name
    // If no exact match, find the closest data point
    const sortedDates = Array.from(dateValueToNameMap.keys()).sort((a, b) => a - b)
    const closest = sortedDates.reduce((prev, curr) =>
      Math.abs(curr - tickItem) < Math.abs(prev - tickItem) ? curr : prev
    )
    return dateValueToNameMap.get(closest) || new Date(tickItem).toLocaleDateString()
  }

  const chartContent = (
    <ResponsiveContainer width="100%" height={300}>
      {type === 'bar' && (
        <BarChart data={data}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis
            dataKey={dateKey || xKey}
            type={dateKey ? 'number' : 'category'}
            domain={dateKey ? dateDomain : undefined}
            ticks={dateKey ? dateTicks : undefined}
            tickFormatter={dateKey ? formatDateTick : undefined}
            angle={dateKey ? -45 : undefined}
            textAnchor={dateKey ? 'end' : undefined}
            height={dateKey ? 80 : undefined}
          />
          <YAxis />
          <Tooltip
            formatter={dateKey ? ((value: any) => [value] as [number]) : undefined}
            labelFormatter={dateKey ? (label: any) => {
              const name = dateValueToNameMap.get(label as number)
              return name || new Date(label as number).toLocaleDateString()
            } : undefined}
          />
          <Legend />
          <Bar dataKey={yKey} fill={colors[0]} />
        </BarChart>
      )}
      {type === 'pie' && (
        <PieChart>
          <Pie
            data={data}
            cx="50%"
            cy="50%"
            labelLine={false}
            label={false}
            outerRadius={100}
            fill="#8884d8"
            dataKey={dataKey}
          >
            {data.map((entry, index) => (
              <Cell key={`cell-${index}`} fill={colors[index % colors.length]} />
            ))}
          </Pie>
          <Tooltip formatter={(value: any, name: any) => {
            const percentage = total > 0 ? (value / total) * 100 : 0
            return [`${value} (${percentage.toFixed(1)}%)`, name]
          }} />
        </PieChart>
      )}
      {type === 'line' && (
        <LineChart data={data}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis
            dataKey={dateKey || xKey}
            type={dateKey ? 'number' : 'category'}
            domain={dateKey ? dateDomain : undefined}
            ticks={dateKey ? dateTicks : undefined}
            tickFormatter={dateKey ? formatDateTick : undefined}
            angle={dateKey ? -45 : undefined}
            textAnchor={dateKey ? 'end' : undefined}
            height={dateKey ? 80 : undefined}
          />
          <YAxis />
          <Tooltip
            formatter={dateKey ? ((value: any) => [value] as [number]) : undefined}
            labelFormatter={dateKey ? (label: any) => {
              const name = dateValueToNameMap.get(label as number)
              return name || new Date(label as number).toLocaleDateString()
            } : undefined}
          />
          <Legend />
          <Line type="monotone" dataKey={yKey} stroke={colors[0]} strokeWidth={2} />
        </LineChart>
      )}
    </ResponsiveContainer>
  )

  return (
    <div className="bg-white rounded-lg shadow p-6">
      {title && <h3 className="text-lg font-semibold mb-4 text-gray-900">{title}</h3>}
      <div className={showPercentageList && type === 'pie' ? 'flex gap-6 items-start' : ''}>
        {chartContent}
        {showPercentageList && type === 'pie' && (
          <div className="flex-shrink-0 min-w-[200px]">
            <h4 className="text-sm font-medium text-gray-700 mb-2">Percentages</h4>
            <div className="space-y-1">
              {pieDataWithPercentages
                .sort((a, b) => b.percentage - a.percentage)
                .map((entry, index) => (
                  <div key={index} className="flex items-center gap-2 text-sm">
                    <div
                      className="w-3 h-3 rounded-full flex-shrink-0"
                      style={{ backgroundColor: entry.color }}
                    />
                    <span className="text-gray-600 flex-1">{entry.name}</span>
                    <span className="text-gray-900 font-medium">
                      {entry.percentage.toFixed(1)}%
                    </span>
                  </div>
                ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

