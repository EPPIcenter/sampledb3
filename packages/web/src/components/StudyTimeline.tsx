import { useMemo, useCallback, useEffect, useRef, useState } from 'react'
// @ts-ignore - d3 modules don't have perfect types
import { scaleLinear } from 'd3-scale'
// @ts-ignore
import { axisBottom, axisLeft } from 'd3-axis'
// @ts-ignore
import { select } from 'd3-selection'
// @ts-ignore
import { timeFormat } from 'd3-time-format'
import { useNavigate } from 'react-router-dom'
import type { StudyTimelineData } from '../lib/api/studies';
import { useDateFilter } from '../contexts/DateFilterContext'
import { useTheme } from '../contexts/ThemeContext'
import { getAppAxisColors } from '../lib/chart-colors'
import DateFilterControls from './DateFilterControls'

interface StudyTimelineProps {
  data: StudyTimelineData
}

// Color palette for specimen types
const SPECIMEN_TYPE_COLORS = [
  '#3b82f6', // blue
  '#10b981', // green
  '#f59e0b', // amber
  '#ef4444', // red
  '#8b5cf6', // purple
  '#ec4899', // pink
  '#06b6d4', // cyan
  '#84cc16', // lime
  '#f97316', // orange
  '#6366f1', // indigo
  '#14b8a6', // teal
  '#a855f7', // violet
]

interface ScatterDataPoint {
  x: number // timestamp
  y: number // subject index
  subjectId: number
  subjectName: string
  specimenId: number
  specimenTypeName: string
  collectionDate: string
}

// Memoized date formatter
const formatCollectionDate = (dateString: string): string => {
  const date = new Date(dateString)
  return date.toLocaleDateString('en-US', {
            month: 'short',
            day: 'numeric',
            year: 'numeric',
  })
}

export default function StudyTimeline({ data }: StudyTimelineProps) {
  const navigate = useNavigate()
  const { theme } = useTheme()
  const { settings, setMinDate, setMaxDate, reset } = useDateFilter()
  const { minDate, maxDate } = settings
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const [tooltip, setTooltip] = useState<{
    point: ScatterDataPoint
    x: number
    y: number
  } | null>(null)

  // Create color mapping for specimen types
  const specimenTypeColorMap = useMemo(() => {
    const map = new Map<string, string>()
    data.specimenTypes.forEach((type, index) => {
      map.set(type.name, SPECIMEN_TYPE_COLORS[index % SPECIMEN_TYPE_COLORS.length])
    })
    return map
  }, [data.specimenTypes])

  // Pre-calculate timestamp boundaries once
  const timestampBounds = useMemo(() => {
    const minTimestamp = minDate ? new Date(minDate).getTime() : 0
    const maxTimestamp = maxDate ? new Date(maxDate + 'T23:59:59').getTime() : Number.MAX_SAFE_INTEGER
    return { minTimestamp, maxTimestamp }
  }, [minDate, maxDate])

  // Process all points
  const { allPoints, filteredSubjects, dateRange, yAxisLabels, seriesData } = useMemo(() => {
    const points: ScatterDataPoint[] = []
    const { minTimestamp, maxTimestamp } = timestampBounds
    
    // First pass: filter and collect ALL points
    data.subjects.forEach((subject, subjectIndex) => {
      subject.specimens.forEach((specimen) => {
        if (!specimen.collectionDate) return
        
        const timestamp = new Date(specimen.collectionDate).getTime()
        if (timestamp >= minTimestamp && timestamp <= maxTimestamp) {
          points.push({
            x: timestamp,
            y: subjectIndex, // Will be remapped below
            subjectId: subject.id,
            subjectName: subject.name,
            specimenId: specimen.id,
            specimenTypeName: specimen.specimenTypeName,
            collectionDate: specimen.collectionDate,
          })
        }
      })
    })

    // Get unique subject IDs from filtered points
    const subjectIdsWithData = new Set(points.map(p => p.subjectId))
    const filtered = data.subjects.filter(s => subjectIdsWithData.has(s.id))
    
    // Create subject index map for remapping
    const indexMap = new Map<number, number>()
    filtered.forEach((subject, index) => {
      indexMap.set(subject.id, index)
    })

    // Remap y-axis indices for all points
    const remappedPoints = points.map(point => ({
      ...point,
      y: indexMap.get(point.subjectId) ?? 0,
    }))

    // Group by specimen type
    const seriesMap = new Map<string, ScatterDataPoint[]>()
    remappedPoints.forEach((point) => {
      const typeName = point.specimenTypeName
      if (!seriesMap.has(typeName)) {
        seriesMap.set(typeName, [])
      }
      seriesMap.get(typeName)!.push(point)
    })

    const series = Array.from(seriesMap.entries()).map(([typeName, points]) => ({
      name: typeName,
      points,
      color: specimenTypeColorMap.get(typeName) || '#6b7280',
    }))

    // Calculate date range from all points
    const range = remappedPoints.length > 0
      ? {
          min: Math.min(...remappedPoints.map((p) => p.x)),
          max: Math.max(...remappedPoints.map((p) => p.x)),
      }
    : null

    // Prepare Y-axis labels
    const labels = filtered.map((s) => s.name)

    return {
      allPoints: remappedPoints,
      filteredSubjects: filtered,
      dateRange: range,
      yAxisLabels: labels,
      seriesData: series,
    }
  }, [data.subjects, timestampBounds, specimenTypeColorMap])

  // Get max date from original data for the date input
  const maxAvailableDate = useMemo(() => {
    if (data.dateRange && data.dateRange.latest) {
      return data.dateRange.latest.split('T')[0]
    }
    // Find max date from all specimens
    let max = ''
    data.subjects.forEach(subject => {
      subject.specimens.forEach(specimen => {
        if (specimen.collectionDate) {
          const dateStr = specimen.collectionDate.split('T')[0]
          if (dateStr > max) {
            max = dateStr
          }
        }
      })
    })
    return max
  }, [data])

  // Create spatial index for fast hit-testing (simple grid-based approach)
  const spatialIndex = useMemo(() => {
    if (allPoints.length === 0) return new Map<string, ScatterDataPoint[]>()
    
    const index = new Map<string, ScatterDataPoint[]>()
    const cellSize = 1000000000 // 1 billion ms = ~11.5 days
    
    allPoints.forEach(point => {
      const cellX = Math.floor(point.x / cellSize)
      const cellY = Math.floor(point.y)
      const key = `${cellX},${cellY}`
      
      if (!index.has(key)) {
        index.set(key, [])
      }
      index.get(key)!.push(point)
    })
    
    return index
  }, [allPoints])

  // Draw chart on canvas
  const drawChart = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas || !dateRange || allPoints.length === 0) return

    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const dpr = window.devicePixelRatio || 1
    const margin = { top: 10, right: 20, bottom: 140, left: 120 } // Increased bottom margin for legend
    const width = (canvas.width / dpr) - margin.left - margin.right
    const height = (canvas.height / dpr) - margin.top - margin.bottom

    // Clear canvas
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    ctx.save()
    ctx.translate(margin.left, margin.top)

    const axisColors = getAppAxisColors()

    // Create scales
    const xScale = scaleLinear()
      .domain([dateRange.min, dateRange.max])
      .range([0, width])

    const yScale = scaleLinear()
      .domain([-0.5, Math.max(0, filteredSubjects.length - 0.5)])
      .range([height, 0])

    // Draw grid (theme-aware)
    ctx.strokeStyle = axisColors.border
    ctx.lineWidth = 1
    ctx.setLineDash([3, 3])
    
    // Vertical grid lines
    const xTicks = xScale.ticks(10)
    xTicks.forEach((tick: number) => {
      const x = xScale(tick)
      ctx.beginPath()
      ctx.moveTo(x, 0)
      ctx.lineTo(x, height)
      ctx.stroke()
    })

    // Horizontal grid lines
    const yTicks = yScale.ticks(filteredSubjects.length)
    yTicks.forEach((tick: number) => {
      const y = yScale(tick)
      ctx.beginPath()
      ctx.moveTo(0, y)
      ctx.lineTo(width, y)
      ctx.stroke()
    })

    ctx.setLineDash([])

    // Draw points
    seriesData.forEach(series => {
      ctx.fillStyle = series.color
      ctx.beginPath()
      series.points.forEach(point => {
        const x = xScale(point.x)
        const y = yScale(point.y)
        ctx.moveTo(x, y)
        ctx.arc(x, y, 3, 0, 2 * Math.PI)
      })
      ctx.fill()
    })

    ctx.restore()

    // Draw axes using D3 (on SVG overlay for crisp text)
    const container = canvas.parentElement
    if (!container) return

    // Remove existing SVG if any
    select(container).select('svg.axis-overlay').remove()

    const axisSvg = select(container)
      .append('svg')
      .attr('class', 'axis-overlay')
      .style('position', 'absolute')
      .style('top', '0')
      .style('left', '0')
      .style('pointer-events', 'none')
      .style('z-index', '1')

    const axisDpr = window.devicePixelRatio || 1
    axisSvg.attr('width', canvas.width / axisDpr).attr('height', canvas.height / axisDpr)

      // X-axis
      const xAxis = axisBottom(xScale)
        .tickFormat((d: any) => {
          const date = new Date(d as number)
          return timeFormat('%Y')(date)
        })
        .tickSize(-height)
        .tickSizeOuter(0)

    const xAxisG = axisSvg.append('g')
      .attr('class', 'x-axis')
      .attr('transform', `translate(${margin.left},${height + margin.top})`)
      .call(xAxis)

    xAxisG.selectAll('text')
      .style('fill', axisColors.text)
      .style('font-size', '12px')
      .attr('transform', 'rotate(-45)')
      .attr('text-anchor', 'end')
      .attr('dx', '-0.5em')
      .attr('dy', '0.5em')

    xAxisG.selectAll('line, path')
      .style('stroke', axisColors.border)
      .style('stroke-width', '1')

    xAxisG.append('text')
      .attr('x', width / 2)
      .attr('y', 50)
      .attr('fill', axisColors.text)
      .style('font-size', '14px')
      .style('text-anchor', 'middle')
      .text('Collection Date')

      // Y-axis
      const yAxis = axisLeft(yScale)
        .tickValues(filteredSubjects.map((_, i) => i))
        .tickFormat((_d: any, i: number) => yAxisLabels[i] || '')
        .tickSize(-width)
        .tickSizeOuter(0)

    const yAxisG = axisSvg.append('g')
      .attr('class', 'y-axis')
      .attr('transform', `translate(${margin.left},${margin.top})`)
      .call(yAxis)

    yAxisG.selectAll('text')
      .style('fill', axisColors.text)
      .style('font-size', '12px')

    yAxisG.selectAll('line, path')
      .style('stroke', axisColors.border)
      .style('stroke-width', '1')

    yAxisG.append('text')
      .attr('transform', 'rotate(-90)')
      .attr('y', -80)
      .attr('x', -height / 2)
      .attr('fill', axisColors.text)
      .style('font-size', '14px')
      .style('text-anchor', 'middle')
      .text('Subject')
  }, [theme, allPoints, dateRange, filteredSubjects, yAxisLabels, seriesData])

  // Handle mouse move for tooltip
  const handleMouseMove = useCallback((event: MouseEvent) => {
    const canvas = canvasRef.current
    if (!canvas || !dateRange || allPoints.length === 0) {
      setTooltip(null)
      return
    }

    const rect = canvas.getBoundingClientRect()
    const mouseX = event.clientX - rect.left
    const mouseY = event.clientY - rect.top

    const dpr = window.devicePixelRatio || 1
    const margin = { top: 10, right: 20, bottom: 140, left: 120 } // Increased bottom margin for legend
    const canvasWidth = canvas.width / dpr
    const canvasHeight = canvas.height / dpr
    const width = canvasWidth - margin.left - margin.right
    const height = canvasHeight - margin.top - margin.bottom

    // Check if mouse is within chart area
    if (mouseX < margin.left || mouseX > canvasWidth - margin.right ||
        mouseY < margin.top || mouseY > canvasHeight - margin.bottom) {
      setTooltip(null)
      return
    }

    // Transform to data coordinates
    const xScale = scaleLinear()
      .domain([dateRange.min, dateRange.max])
      .range([0, width])
    const yScale = scaleLinear()
      .domain([-0.5, Math.max(0, filteredSubjects.length - 0.5)])
      .range([height, 0])

    const dataX = xScale.invert(mouseX - margin.left)
    const dataY = yScale.invert(mouseY - margin.top)

    // Find nearest point using spatial index
    const hitRadiusX = ((dateRange.max - dateRange.min) / width) * 10
    const hitRadiusY = ((filteredSubjects.length) / height) * 10

    let nearestPoint: ScatterDataPoint | null = null
    let minDistance = Infinity

    // Search nearby cells in spatial index
    const cellX = Math.floor(dataX / 1000000000)
    const cellY = Math.floor(dataY)
    
    for (let dx = -1; dx <= 1; dx++) {
      for (let dy = -1; dy <= 1; dy++) {
        const key = `${cellX + dx},${cellY + dy}`
        const points = spatialIndex.get(key) || []
        
        points.forEach((point: ScatterDataPoint) => {
          const distX = point.x - dataX
          const distY = point.y - dataY
          const normalizedDist = Math.sqrt(
            (distX / hitRadiusX) ** 2 + (distY / hitRadiusY) ** 2
          )
          
          if (normalizedDist < minDistance && normalizedDist < 1) {
            minDistance = normalizedDist
            nearestPoint = point
          }
        })
      }
    }

    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- nearestPoint may be null
    if (nearestPoint) {
      setTooltip({
        point: nearestPoint,
        x: event.clientX,
        y: event.clientY,
      })
    } else {
      setTooltip(null)
    }
  }, [allPoints, dateRange, filteredSubjects, spatialIndex])

  // Handle click
  const handleClick = useCallback((event: MouseEvent) => {
    const canvas = canvasRef.current
    if (!canvas || !dateRange || allPoints.length === 0) return

    const rect = canvas.getBoundingClientRect()
    const mouseX = event.clientX - rect.left
    const mouseY = event.clientY - rect.top

    const dpr = window.devicePixelRatio || 1
    const margin = { top: 10, right: 20, bottom: 140, left: 120 } // Increased bottom margin for legend
    const canvasWidth = canvas.width / dpr
    const canvasHeight = canvas.height / dpr
    const width = canvasWidth - margin.left - margin.right
    const height = canvasHeight - margin.top - margin.bottom

    if (mouseX < margin.left || mouseX > canvasWidth - margin.right ||
        mouseY < margin.top || mouseY > canvasHeight - margin.bottom) {
      return
    }

    const xScale = scaleLinear()
      .domain([dateRange.min, dateRange.max])
      .range([0, width])
    const yScale = scaleLinear()
      .domain([-0.5, Math.max(0, filteredSubjects.length - 0.5)])
      .range([height, 0])

    const dataX = xScale.invert(mouseX - margin.left)
    const dataY = yScale.invert(mouseY - margin.top)

    const hitRadiusX = ((dateRange.max - dateRange.min) / width) * 10
    const hitRadiusY = ((filteredSubjects.length) / height) * 10

    let nearestPoint: ScatterDataPoint | null = null
    let minDistance = Infinity

    const cellX = Math.floor(dataX / 1000000000)
    const cellY = Math.floor(dataY)
    
    for (let dx = -1; dx <= 1; dx++) {
      for (let dy = -1; dy <= 1; dy++) {
        const key = `${cellX + dx},${cellY + dy}`
        const points = spatialIndex.get(key) || []
        
        points.forEach((point: ScatterDataPoint) => {
          const distX = point.x - dataX
          const distY = point.y - dataY
          const normalizedDist = Math.sqrt(
            (distX / hitRadiusX) ** 2 + (distY / hitRadiusY) ** 2
          )
          
          if (normalizedDist < minDistance && normalizedDist < 1) {
            minDistance = normalizedDist
            nearestPoint = point
          }
        })
      }
    }

    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- nearestPoint may be null
    if (nearestPoint) {
      const point = nearestPoint as ScatterDataPoint
      navigate(`/specimens/${point.specimenId}`)
    }
  }, [dateRange, filteredSubjects, spatialIndex, navigate])

  // Set up canvas and event listeners
  useEffect(() => {
    const canvas = canvasRef.current
    const container = containerRef.current
    if (!canvas || !container) return

    const updateCanvasSize = () => {
      const rect = container.getBoundingClientRect()
      const dpr = window.devicePixelRatio || 1
      const height = Math.max(400, filteredSubjects.length * 10 + 100)
      canvas.width = rect.width * dpr
      canvas.height = height * dpr
      canvas.style.width = `${rect.width}px`
      canvas.style.height = `${height}px`
      
      const ctx = canvas.getContext('2d')
      if (ctx) {
        ctx.scale(dpr, dpr)
      }
      
      drawChart()
    }

    updateCanvasSize()
    const resizeObserver = new ResizeObserver(updateCanvasSize)
    resizeObserver.observe(container)
    
    canvas.addEventListener('mousemove', handleMouseMove)
    canvas.addEventListener('mouseleave', () => setTooltip(null))
    canvas.addEventListener('click', handleClick)

    return () => {
      resizeObserver.disconnect()
      canvas.removeEventListener('mousemove', handleMouseMove)
      canvas.removeEventListener('mouseleave', () => setTooltip(null))
      canvas.removeEventListener('click', handleClick)
      // Clean up SVG overlay
      select(container).select('svg.axis-overlay').remove()
    }
  }, [drawChart, handleMouseMove, handleClick, filteredSubjects.length])

  if (allPoints.length === 0) {
    return (
      <div className="bg-app-card rounded-lg shadow p-6">
        <div className="mb-4">
          <h3 className="text-lg font-semibold text-app-text">Collection Timeline</h3>
          <p className="text-sm text-app-text-muted mt-1">
            Each dot represents a specimen. Click to view details.
          </p>
        </div>
        <div className="mb-4 flex gap-4 items-end">
          <div>
            <label className="block text-sm font-medium text-app-text mb-1">
              From Date
            </label>
            <input
              type="date"
              value={minDate}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setMinDate(e.target.value)}
              className="px-3 py-2 border border-app-border rounded-lg focus:ring-2 focus:ring-app-accent focus:border-app-accent"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-app-text mb-1">
              To Date
            </label>
            <input
              type="date"
              value={maxDate}
              max={maxAvailableDate}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setMaxDate(e.target.value)}
              className="px-3 py-2 border border-app-border rounded-lg focus:ring-2 focus:ring-app-accent focus:border-app-accent"
            />
          </div>
          <button
            onClick={reset}
            className="px-4 py-2 text-sm text-app-text bg-app-surface rounded-lg hover:bg-app-surface/80 transition-colors"
          >
            Reset
          </button>
        </div>
        <div className="flex items-center justify-center h-64 text-app-text-muted">
          No collection data available in the selected date range
        </div>
      </div>
    )
  }

  return (
    <div className="bg-app-card rounded-lg shadow p-6">
      <div className="mb-4">
        <h3 className="text-lg font-semibold text-app-text">Collection Timeline</h3>
        <p className="text-sm text-app-text-muted mt-1">
          Each dot represents a specimen. Click to view details.
        </p>
      </div>

      {/* Date Filter Controls */}
      <DateFilterControls
        maxAvailableDate={maxAvailableDate}
        showCount={true}
        filteredCount={allPoints.length}
        totalCount={data.subjects.reduce((sum, s) => sum + s.specimens.length, 0)}
      />

      <div 
        ref={containerRef}
        className="overflow-x-auto relative"
        style={{ position: 'relative' }}
      >
        <canvas
          ref={canvasRef}
          style={{ 
            display: 'block',
            cursor: 'pointer',
          }}
        />
        {/* Legend */}
        <div 
          className="absolute flex flex-wrap gap-4 justify-center"
          style={{ 
            pointerEvents: 'none',
            bottom: '10px',
            left: '50%',
            transform: 'translateX(-50%)',
            width: 'calc(100% - 140px)', // Account for left/right margins
            marginLeft: '120px',
            marginRight: '20px',
          }}
        >
          {seriesData.map(series => (
            <div key={series.name} className="flex items-center gap-2">
              <div 
                className="w-3 h-3 rounded-full"
                style={{ backgroundColor: series.color }}
              />
              <span className="text-xs text-app-text-muted">{series.name}</span>
            </div>
          ))}
        </div>
        {/* Tooltip */}
        {tooltip && (
          <div
            className="bg-app-card p-3 border border-app-border rounded-lg shadow-lg pointer-events-none z-50 fixed"
            style={{
              left: `${tooltip.x}px`,
              top: `${tooltip.y}px`,
              transform: 'translate(-50%, -100%)',
              marginTop: '-8px',
              maxWidth: '200px',
            }}
          >
            <p className="font-semibold text-app-text">{tooltip.point.subjectName}</p>
            <p className="text-sm text-app-text-muted">{tooltip.point.specimenTypeName}</p>
            <p className="text-xs text-app-text-muted">
              {formatCollectionDate(tooltip.point.collectionDate)}
            </p>
            <p className="text-xs text-app-text-muted mt-1">Click to view specimen</p>
          </div>
        )}
      </div>
    </div>
  )
}
