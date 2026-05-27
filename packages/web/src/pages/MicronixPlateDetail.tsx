import { useEffect, useMemo, useState } from 'react'
import { useParams, useNavigate, useSearchParams } from 'react-router-dom'
import EntityBreadcrumbs from '../components/EntityBreadcrumbs'
import CollectionGrid from '../components/CollectionGrid'
import CollectionTableWithExport from '../components/CollectionTableWithExport'
import { useMicronixPlate } from '../hooks/useCollections'
import { DetailPageSkeleton, PageError, fromQuery, getQueryErrorMessage } from '../ui'
import {
  COLLECTION_GRID_TABLE_COLUMNS,
  COLLECTION_GRID_TABLE_ROW_KEYS,
  buildCollectionTableRow,
  getTableColumnsFromExportConfig,
  type CollectionTableEntry,
} from '../lib/collection-table-columns'
import { useTableViewConfigurations } from '../hooks/useTableViewConfigurations'
import { Link } from 'react-router-dom'
import CollectionDeleteDialog from '../components/CollectionDeleteDialog'
import '../styles/storage.css'

function statusColor(name: string): string {
  const key = name.toLowerCase()
  if (key.includes('active') || key.includes('in use') || key.includes('in-use')) return 'bg-app-trend-up/100'
  if (key.includes('used')) return 'bg-app-accent-muted0'
  if (key.includes('archived')) return 'bg-yellow-500'
  if (key.includes('discard') || key.includes('destroy')) return 'bg-app-trend-down/100'
  return 'bg-gray-400'
}

export default function MicronixPlateDetail() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const plateId = id != null ? parseInt(id, 10) : NaN
  const dataQuery = useMicronixPlate(plateId)
  const data = dataQuery.data ?? null
  const detailStatus = fromQuery(dataQuery)
  const [viewMode, setViewMode] = useState<'grid' | 'table'>('grid')
  const [showDeleteCollection, setShowDeleteCollection] = useState(false)
  const {
    configurations: viewConfigurations,
    selectedConfigId,
    setSelectedConfigId,
    loading: loadingConfigs,
  } = useTableViewConfigurations()

  // Get target position from URL query params
  const targetPosition = searchParams.get('position')

  // Scroll to highlighted container when page loads
  useEffect(() => {
    if (targetPosition && data?.wells) {
      // Small delay to ensure DOM is rendered
      setTimeout(() => {
        const highlightedElement = document.querySelector('[data-highlighted-position="true"]')
        if (highlightedElement) {
          highlightedElement.scrollIntoView({ behavior: 'smooth', block: 'center' })
        }
      }, 100)
    }
  }, [targetPosition, data])

  const layout = useMemo(() => {
    // Always return the full 96-well plate format (8 rows × 12 columns)
    const rows = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H']
    const cols = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11', '12']
    return { rows, cols }
  }, [])

  const legend = useMemo(() => {
    if (!data?.wells) return []
    const values = Object.values<any>(data.wells)
    const labels = new Set<string>()
    values.forEach((entry) => {
      const container = entry?.container
      if (container?.state?.name) labels.add(container.state.name)
      if (container) {
        labels.add(container.remainingQuantity > 0 ? 'In Use' : 'Exhausted')
      }
    })
    return Array.from(labels).sort()
  }, [data])

  const tableRows = useMemo(() => {
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- layout/data.wells may be unset before load
    if (!layout || !data?.wells) return []
    const wells = data.wells as Record<string, (CollectionTableEntry & { type?: string }) | undefined>
    const plate = data.plate
    const context = plate
      ? { collectionName: plate.name ?? undefined, locationPath: plate.locationPath ?? undefined }
      : undefined
    const rows: ReturnType<typeof buildCollectionTableRow>[] = []
    layout.rows.forEach((row) => {
      layout.cols.forEach((col) => {
        const key = `${row}${col.padStart(2, '0')}`
        const entry = wells[key]
        if (entry == null) {
          rows.push(
            buildCollectionTableRow({
              position: key,
              barcode: undefined,
              containerType: undefined,
              container: undefined,
              context,
            })
          )
        } else {
          rows.push(
            buildCollectionTableRow({
              position: key,
              barcode: entry.barcode,
              containerType: entry.type ?? undefined,
              container: entry.container ?? undefined,
              context,
            })
          )
        }
      })
    })
    return rows
  }, [data, layout])

  const tableColumns = useMemo(() => {
    if (viewMode !== 'table' || loadingConfigs || viewConfigurations.length === 0) {
      return COLLECTION_GRID_TABLE_COLUMNS
    }
    const config = viewConfigurations.find((c) => c.name === selectedConfigId)
    const configKeys = config?.columns ?? []
    const resolved = getTableColumnsFromExportConfig(configKeys, COLLECTION_GRID_TABLE_ROW_KEYS)
    return resolved.length > 0 ? resolved : COLLECTION_GRID_TABLE_COLUMNS
  }, [viewMode, loadingConfigs, viewConfigurations, selectedConfigId])

  if (detailStatus === 'loading') {
    return (
      <div className="storage-page">
        <div className="container mx-auto px-4 py-8 relative z-10">
          <DetailPageSkeleton sections={1} />
        </div>
      </div>
    )
  }

  if (detailStatus === 'error') {
    return (
      <div className="storage-page">
        <div className="container mx-auto px-4 py-8 relative z-10">
          <PageError
            title="Could not load micronix plate"
            message={getQueryErrorMessage(dataQuery.error, 'Failed to load micronix plate')}
            onRetry={() => void dataQuery.refetch()}
          />
        </div>
      </div>
    )
  }

  if (!data?.plate) {
    return (
      <div className="storage-page">
        <div className="container mx-auto px-4 py-8 relative z-10">
          <div className="text-center py-8 text-app-trend-down">Micronix plate not found</div>
        </div>
      </div>
    )
  }

  const { plate, wells } = data

  const breadcrumbItems = [
    { label: 'Locations', to: '/locations' },
    plate.location?.id != null
      ? { label: plate.locationPath, to: `/locations/${plate.location.id}` }
      : undefined,
    { label: `Micronix Plate ${plate.name}` },
  ].filter(Boolean) as Array<{ label: string; to?: string }>

  return (
    <div className="storage-page">
      <div className="container mx-auto px-4 py-8 relative z-10">
      <div className="mb-6 storage-reveal storage-reveal-1">
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
          <div>
        <EntityBreadcrumbs items={breadcrumbItems} />
        <h1 className="text-3xl font-bold">
          Micronix Plate {plate.name}
        </h1>
          </div>
          <button
            type="button"
            onClick={() => setShowDeleteCollection(true)}
            className="shrink-0 px-3 py-1.5 text-sm rounded border text-app-trend-down border-app-trend-down/50 hover:bg-app-trend-down/10"
          >
            Delete collection…
          </button>
        </div>
        {plate.barcode && (
          <p className="mt-1 text-sm font-mono" style={{ color: 'rgb(var(--app-text-muted))' }}>Barcode: {plate.barcode}</p>
        )}
        {plate.locationPath && (
          <p className="mt-1 text-sm font-mono" style={{ color: 'rgb(var(--app-text-muted))' }}>{plate.locationPath}</p>
        )}
      </div>

      <div className="storage-card p-4 mb-6 storage-reveal storage-reveal-2">
          <div className="flex items-start justify-between mb-3 gap-4 flex-wrap">
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="text-lg font-semibold storage-section-title">Plate Layout</h2>
              <div className="flex rounded-md border border-app-border overflow-hidden" role="group" aria-label="View mode">
                <button
                  type="button"
                  onClick={() => setViewMode('grid')}
                  className={`px-2 py-1 text-xs font-medium ${viewMode === 'grid' ? 'bg-app-surface border-app-border' : 'bg-app-card hover:bg-app-surface'} border-r border-app-border`}
                  aria-pressed={viewMode === 'grid'}
                >
                  Grid
                </button>
                <button
                  type="button"
                  onClick={() => setViewMode('table')}
                  className={`px-2 py-1 text-xs font-medium ${viewMode === 'table' ? 'bg-app-surface border-app-border' : 'bg-app-card hover:bg-app-surface'}`}
                  aria-pressed={viewMode === 'table'}
                >
                  Table
                </button>
              </div>
              {viewMode === 'table' && (
                <div className="flex items-center gap-2">
                  <label htmlFor="plate-table-column-config" className="text-xs font-medium text-app-text-muted whitespace-nowrap">
                    Columns:
                  </label>
                  {loadingConfigs ? (
                    <span className="text-xs text-app-text-muted">Loading…</span>
                  ) : viewConfigurations.length === 0 ? (
                    <span className="text-xs text-app-text-muted">
                      <Link to="/settings?category=data-management&section=table-view-configurations" className="underline">
                        Add in Settings
                      </Link>
                    </span>
                  ) : (
                    <select
                      id="plate-table-column-config"
                      value={selectedConfigId}
                      onChange={(e) => setSelectedConfigId(e.target.value)}
                      className="text-xs border border-app-border rounded px-2 py-1 bg-app-card min-w-[140px]"
                      style={{ color: 'rgb(var(--app-text))' }}
                      aria-label="Column configuration for table view"
                    >
                      {viewConfigurations.map((config) => (
                        <option key={config.name} value={config.name}>
                          {config.name}
                        </option>
                      ))}
                    </select>
                  )}
                </div>
              )}
            </div>
            {legend.length > 0 && viewMode === 'grid' && (
              <div className="flex flex-wrap items-center gap-3 text-[11px]" style={{ color: 'rgb(var(--app-text-muted))' }}>
                <span className="font-semibold" style={{ color: 'rgb(var(--app-text))' }}>Legend:</span>
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
          {viewMode === 'grid' && (
          <CollectionGrid
            theme="storage"
            rows={layout.rows}
            columns={layout.cols}
            getKey={(row, col) => `${row}${col.padStart(2, '0')}`}
            getCell={(row, col) => {
              const key = `${row}${col.padStart(2, '0')}`
              return wells[key]
            }}
            renderCell={(value, coords) => {
              if (!value) {
                return (
                  <div className="h-16 w-16 mx-auto flex items-center justify-center rounded border border-dashed border-app-border text-[11px] text-app-border">
                    Empty
                  </div>
                )
              }
              const entry: any = value
              const hasContainer = !!entry.container
              const stateName = entry.container?.state?.name
              const statusName = hasContainer ? (entry.container.remainingQuantity > 0 ? 'In Use' : 'Exhausted') : null
              const specimenId = entry.container?.specimenId
              const source = entry.container?.source
              const subjectName = source?.type === 'subject' ? source.name : source?.type === 'control' ? source.name : null
              const containerId = entry.id

              // Check if this cell should be highlighted
              const cellKey = `${coords.row}${coords.column.padStart(2, '0')}`
              const entryPosition = entry.position
              // Normalize position for comparison (handle both "A1" and "A01" formats)
              const normalizePosition = (pos: string | null | undefined) => {
                if (!pos) return null
                const match = pos.match(/^([A-Z]+)(\d+)$/i)
                if (match) {
                  return `${match[1].toUpperCase()}${parseInt(match[2], 10).toString().padStart(2, '0')}`
                }
                return pos.toUpperCase()
              }
              const normalizedTarget = normalizePosition(targetPosition)
              const isHighlighted = targetPosition && (
                normalizedTarget === cellKey ||
                (entryPosition && (
                  normalizedTarget === normalizePosition(entryPosition) ||
                  targetPosition.toUpperCase() === entryPosition.toUpperCase()
                ))
              )

              const isClickable = !!hasContainer && !!containerId
              const tooltipParts: string[] = []
              if (entry.position) tooltipParts.push(`Position: ${entry.position}`)
              if (entry.barcode) tooltipParts.push(`Barcode: ${entry.barcode}`)
              if (subjectName) tooltipParts.push(`${source?.type === 'subject' ? 'Subject' : 'Control'}: ${subjectName}`)
              if (entry.container?.specimenTypeName) tooltipParts.push(`Specimen type: ${entry.container.specimenTypeName}`)
              if (stateName) tooltipParts.push(`State: ${stateName}`)
              if (statusName) tooltipParts.push(`Status: ${statusName}`)
              const title = tooltipParts.join(' • ')

              return (
                <button
                  type="button"
                  onClick={() => {
                    if (containerId) navigate(`/containers/${containerId}`)
                  }}
                  data-highlighted-position={isHighlighted ? 'true' : 'false'}
                  className={`h-16 w-16 mx-auto flex flex-col items-center justify-center rounded border text-[10px] px-1 py-1 bg-app-card space-y-0.5 transition-all
                    ${isHighlighted ? 'ring-2 ring-app-accent ring-offset-2 ring-offset-app-bg border-app-accent shadow-md bg-app-accent-muted text-app-accent-on-tint' : ''}
                    ${isClickable ? 'hover:shadow-sm hover:border-app-accent/50 cursor-pointer focus:outline-none focus:ring-2 focus:ring-app-accent' : ''}`}
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
                          className={`inline-block w-2 h-2 rounded-full ${statusName === 'In Use' ? 'bg-app-trend-up/100' : 'bg-app-trend-down/100'}`}
                          title={statusName}
                        />
                      )}
                    </div>
                  )}
                  <div className="font-mono truncate w-full text-center text-[8px]">
                    {entry.barcode || ''}
                  </div>
                  {(subjectName || entry.container?.specimenTypeName) && (
                    <span className="text-app-accent underline text-[9px] truncate max-w-full">
                      {subjectName || entry.container.specimenTypeName}
                    </span>
                  )}
                </button>
              )
            }}
          />
          )}
          {viewMode === 'table' && (
            <CollectionTableWithExport
              columns={tableColumns}
              rows={tableRows}
              exportFilename={`micronix-plate-${plate.name || 'unnamed'}.csv`}
            />
          )}
        </div>
      </div>
      <CollectionDeleteDialog
        isOpen={showDeleteCollection}
        onClose={() => setShowDeleteCollection(false)}
        collectionType="micronix_plate"
        id={parseInt(id || '0', 10)}
        collectionName={String(plate.name)}
        kindLabel="Micronix plate"
        onDeleted={() => navigate('/collections')}
      />
    </div>
  )
}


