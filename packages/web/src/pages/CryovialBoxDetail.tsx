import { useEffect, useMemo, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { collectionsApi } from '../lib/api'
import EntityBreadcrumbs from '../components/EntityBreadcrumbs'
import CollectionGrid from '../components/CollectionGrid'
import SkeletonDetailPage from '../components/SkeletonDetailPage'

function statusColor(name: string): string {
  const key = name.toLowerCase()
  if (key.includes('active') || key.includes('in use') || key.includes('in-use')) return 'bg-green-500'
  if (key.includes('used')) return 'bg-blue-500'
  if (key.includes('archived')) return 'bg-yellow-500'
  if (key.includes('discard') || key.includes('destroy')) return 'bg-red-500'
  return 'bg-gray-400'
}

export default function CryovialBoxDetail() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const [data, setData] = useState<any | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!id) return
    const numericId = parseInt(id)
    if (Number.isNaN(numericId)) return

    const fetchData = async () => {
      try {
        const res = await collectionsApi.getCryovialBox(numericId)
        setData(res.data)
      } catch (err) {
        console.error('Failed to load cryovial box:', err)
      } finally {
        setLoading(false)
      }
    }

    fetchData()
  }, [id])

  const layout = useMemo(() => {
    if (!data?.positions) return null
    const positions = Object.keys(data.positions)
    const rowSet = new Set<string>()
    const colSet = new Set<string>()

    positions.forEach((pos) => {
      if (!pos) return
      const match = pos.match(/^([A-Z]+)(\d+)$/i)
      if (match) {
        rowSet.add(match[1].toUpperCase())
        colSet.add(String(parseInt(match[2], 10)))
      }
    })

    const rows = Array.from(rowSet).sort()
    const cols = Array.from(colSet)
      .map((c) => parseInt(c, 10))
      .sort((a, b) => a - b)
      .map((n) => String(n))

    return { rows, cols }
  }, [data])

  const legend = useMemo(() => {
    if (!data?.positions) return []
    const values = Object.values<any[]>(data.positions)
    const labels = new Set<string>()
    values.forEach((entries) => {
      entries.forEach((entry: any) => {
        const container = entry?.container
        if (container?.state?.name) labels.add(container.state.name)
        if (container) {
          labels.add(container.remainingQuantity > 0 ? 'In Use' : 'Exhausted')
        }
      })
    })
    return Array.from(labels).sort()
  }, [data])

  if (loading) {
    return <SkeletonDetailPage sections={1} />
  }

  if (!data?.box) {
    return (
      <div className="container mx-auto px-4 py-8">
        <div className="text-center py-8">Loading...</div>
      </div>
    )
  }

  if (!data?.box) {
    return (
      <div className="container mx-auto px-4 py-8">
        <div className="text-center py-8 text-red-600">Cryovial box not found</div>
      </div>
    )
  }

  const { box, positions } = data

  const breadcrumbItems = [
    { label: 'Locations', to: '/locations' },
    box.location?.id
      ? { label: box.locationPath || `Location #${box.location.id}`, to: `/locations/${box.location.id}` }
      : undefined,
    { label: `Cryovial Box ${box.name || `#${box.id}`}` },
  ].filter(Boolean) as Array<{ label: string; to?: string }>

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="mb-6">
        <EntityBreadcrumbs items={breadcrumbItems} />
        <h1 className="text-3xl font-bold text-gray-900">
          Cryovial Box {box.name || `#${box.id}`}
        </h1>
        {box.barcode && (
          <p className="mt-1 text-sm text-gray-600 font-mono">Barcode: {box.barcode}</p>
        )}
        {box.locationPath && (
          <p className="mt-1 text-sm text-gray-600 font-mono">{box.locationPath}</p>
        )}
      </div>

      {layout && (
        <div className="bg-white rounded-lg shadow p-4 mb-6">
          <div className="flex items-start justify-between mb-3 gap-4">
            <h2 className="text-lg font-semibold text-gray-900">Box Layout</h2>
            {legend.length > 0 && (
              <div className="flex flex-wrap items-center gap-3 text-[11px] text-gray-600">
                <span className="font-semibold text-gray-700">Legend:</span>
                {legend.map((name) => (
                  <span key={name} className="inline-flex items-center gap-1">
                    <span
                      className={`inline-block w-2 h-2 rounded-full ${statusColor(
                        name
                      )}`}
                    />
                    <span>{name}</span>
                  </span>
                ))}
              </div>
            )}
          </div>
          <CollectionGrid
            rows={layout.rows}
            columns={layout.cols}
            getKey={(row, col) => `${row}${col.padStart(2, '0')}`}
            getCell={(row, col) => {
              const key = `${row}${col.padStart(2, '0')}`
              return positions[key] || []
            }}
            renderCell={(value) => {
              const entries: any[] = Array.isArray(value) ? value : value ? [value as any] : []
              if (entries.length === 0) {
                return (
                  <div className="h-16 w-16 mx-auto flex items-center justify-center rounded border border-dashed border-gray-100 text-[11px] text-gray-300">
                    Empty
                  </div>
                )
              }

              // For now show the first entry prominently; additional entries could be surfaced via tooltip later.
              const entry = entries[0]
              const hasContainer = !!entry.container
              const stateName = entry.container?.state?.name
              const statusName = hasContainer ? (entry.container.remainingQuantity > 0 ? 'In Use' : 'Exhausted') : null
              const specimenId = entry.container?.specimenId
              const source = entry.container?.source
              const subjectName = source?.type === 'subject' ? source.name : source?.type === 'control' ? source.name : null
              const containerId = entry.id
              const label = 'Cryovial'

              const isClickable = !!hasContainer && !!containerId
              const tooltipParts: string[] = []
              if (entry.position) tooltipParts.push(`Position: ${entry.position}`)
              if (entry.barcode) tooltipParts.push(`Barcode: ${entry.barcode}`)
              if (label) tooltipParts.push(`Type: ${label}`)
              if (subjectName) tooltipParts.push(`${source?.type === 'subject' ? 'Subject' : 'Control'}: ${subjectName}`)
              if (specimenId) tooltipParts.push(`Specimen: #${specimenId}`)
              if (stateName) tooltipParts.push(`State: ${stateName}`)
              if (statusName) tooltipParts.push(`Status: ${statusName}`)
              const title = tooltipParts.join(' • ')

              return (
                <button
                  type="button"
                  onClick={() => {
                    if (containerId) navigate(`/containers/${containerId}`)
                  }}
                  className={`h-16 w-16 mx-auto flex flex-col items-center justify-center rounded border text-[10px] px-1 py-1 bg-white space-y-0.5
                    ${isClickable ? 'hover:border-blue-300 hover:shadow-sm cursor-pointer focus:outline-none focus:ring-2 focus:ring-blue-400' : ''}`}
                  title={title}
                >
                  {hasContainer && (
                    <div className="w-full flex items-center justify-center gap-1">
                      {stateName && (
                        <span
                          className={`inline-block w-2 h-2 rounded-full ${statusColor(
                            stateName
                          )}`}
                          title={stateName}
                        />
                      )}
                      {statusName && (
                        <span
                          className={`inline-block w-2 h-2 rounded-full ${statusName === 'In Use' ? 'bg-green-500' : 'bg-red-500'}`}
                          title={statusName}
                        />
                      )}
                    </div>
                  )}
                  <div className="font-mono truncate w-full text-center text-[8px]">
                    {entry.barcode || label}
                  </div>
                  {specimenId && (
                    <span className="text-blue-600 underline text-[9px] truncate max-w-full">
                      {subjectName || `Spec #${specimenId}`}
                    </span>
                  )}
                </button>
              )
            }}
          />
        </div>
      )}
    </div>
  )
}


