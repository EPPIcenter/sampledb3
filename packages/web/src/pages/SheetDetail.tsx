import { useEffect, useMemo, useState } from 'react'
import { useParams, useNavigate, useSearchParams } from 'react-router-dom'
import { collectionsApi } from '../lib/api'
import EntityBreadcrumbs from '../components/EntityBreadcrumbs'
import CollectionTableWithExport from '../components/CollectionTableWithExport'
import SkeletonDetailPage from '../components/SkeletonDetailPage'
import {
  COLLECTION_GRID_TABLE_COLUMNS,
  COLLECTION_GRID_TABLE_ROW_KEYS,
  buildCollectionTableRow,
  getTableColumnsFromExportConfig,
  type CollectionTableEntry,
} from '../lib/collection-table-columns'
import { useTableViewConfigurations } from '../hooks/useTableViewConfigurations'
import { Link } from 'react-router-dom'
import '../styles/storage.css'

export default function SheetDetail() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const [data, setData] = useState<any | null>(null)
  const [loading, setLoading] = useState(true)
  const [viewMode, setViewMode] = useState<'cards' | 'table'>('cards')
  const {
    configurations: viewConfigurations,
    selectedConfigId,
    setSelectedConfigId,
    loading: loadingConfigs,
  } = useTableViewConfigurations()

  // Get target position and containerId from URL query params
  const targetPosition = searchParams.get('position')
  const targetContainerId = searchParams.get('containerId')

  useEffect(() => {
    if (!id) return
    const numericId = parseInt(id)
    if (Number.isNaN(numericId)) return

    const fetchData = async () => {
      try {
        const res = await collectionsApi.getSheet(numericId)
        setData(res.data)
      } catch (err) {
        console.error('Failed to load sheet:', err)
      } finally {
        setLoading(false)
      }
    }

    fetchData()
  }, [id])

  // Scroll to highlighted container when page loads
  useEffect(() => {
    if (targetPosition && data?.papers) {
      // Small delay to ensure DOM is rendered
      setTimeout(() => {
        const highlightedElement = document.querySelector('[data-highlighted-position="true"]')
        if (highlightedElement) {
          highlightedElement.scrollIntoView({ behavior: 'smooth', block: 'center' })
        }
      }, 100)
    }
  }, [targetPosition, data])

  // Derive once so hooks below can run unconditionally (Rules of Hooks)
  const sheet = data?.sheet ?? null
  const papers = data?.papers ?? []

  const tableRows = useMemo(() => {
    const context = sheet
      ? { collectionName: sheet.name ?? undefined, locationPath: sheet.locationPath ?? undefined }
      : undefined
    return papers.map((p: CollectionTableEntry) =>
      buildCollectionTableRow({
        position: p.position,
        barcode: p.barcode,
        containerType: 'paper',
        container: p.container ?? undefined,
        context,
      })
    )
  }, [papers, sheet])

  const tableColumns = useMemo(() => {
    if (viewMode !== 'table' || loadingConfigs || viewConfigurations.length === 0) {
      return COLLECTION_GRID_TABLE_COLUMNS
    }
    const config = viewConfigurations.find((c) => c.name === selectedConfigId)
    const configKeys = config?.columns ?? []
    const resolved = getTableColumnsFromExportConfig(configKeys, COLLECTION_GRID_TABLE_ROW_KEYS)
    return resolved.length > 0 ? resolved : COLLECTION_GRID_TABLE_COLUMNS
  }, [viewMode, loadingConfigs, viewConfigurations, selectedConfigId])

  if (loading) {
    return (
      <div className="storage-page">
        <div className="container mx-auto px-4 py-8 relative z-10">
          <SkeletonDetailPage sections={1} />
        </div>
      </div>
    )
  }

  if (!sheet) {
    return (
      <div className="storage-page">
        <div className="container mx-auto px-4 py-8 relative z-10">
          <div className="text-center py-8 text-app-trend-down">Sheet not found</div>
        </div>
      </div>
    )
  }

  const breadcrumbItems = [
    { label: 'Locations', to: '/locations' },
    sheet.location?.id
      ? { label: sheet.locationPath, to: `/locations/${sheet.location.id}` }
      : undefined,
    sheet.bag ? { label: sheet.bag.name, to: `/collections/bags/${sheet.bag.id}` } : undefined,
    sheet.box ? { label: sheet.box.name, to: `/collections/boxes/${sheet.box.id}` } : undefined,
    { label: `Sheet: ${sheet.name}` },
  ].filter(Boolean) as Array<{ label: string; to?: string }>

  return (
    <div className="storage-page">
      <div className="container mx-auto px-4 py-8 relative z-10">
      <div className="mb-6 storage-reveal storage-reveal-1">
        <EntityBreadcrumbs items={breadcrumbItems} />
        <h1 className="text-3xl font-bold">
          Sheet: {sheet.name}
        </h1>
        {sheet.locationPath && (
          <p className="mt-1 text-sm font-mono" style={{ color: 'rgb(var(--app-text-muted))' }}>{sheet.locationPath}</p>
        )}
      </div>

      <div className="storage-card p-6 storage-reveal storage-reveal-2">
        <div className="flex flex-wrap items-center justify-between gap-4 mb-4">
          <div className="flex items-center gap-2 flex-wrap">
            <h2 className="text-lg font-semibold storage-section-title">
              DBS Spots
            </h2>
            <span className="text-sm font-normal" style={{ color: 'rgb(var(--app-text-muted))' }}>
              {papers.reduce((sum: number, p: any) => sum + (p.container?.totalQuantity || 0), 0)} total spots
            </span>
            {papers.length > 0 && (
              <div className="flex rounded-md border border-app-border overflow-hidden" role="group" aria-label="View mode">
                <button
                  type="button"
                  onClick={() => setViewMode('cards')}
                  className={`px-2 py-1 text-xs font-medium ${viewMode === 'cards' ? 'bg-app-surface border-app-border' : 'bg-app-card hover:bg-app-surface'} border-r border-app-border`}
                  aria-pressed={viewMode === 'cards'}
                >
                  Cards
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
            )}
            {viewMode === 'table' && papers.length > 0 && (
              <div className="flex items-center gap-2">
                <label htmlFor="sheet-table-column-config" className="text-xs font-medium text-app-text-muted whitespace-nowrap">
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
                      id="sheet-table-column-config"
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
        </div>

        {papers.length === 0 ? (
          <p className="text-sm italic" style={{ color: 'rgb(var(--app-text-muted))' }}>No spots recorded on this sheet.</p>
        ) : viewMode === 'table' ? (
          <CollectionTableWithExport
            columns={tableColumns}
            rows={tableRows}
            exportFilename={`sheet-${sheet.name || 'unnamed'}.csv`}
          />
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
            {papers.map((p: any, index: number) => {
              const isActive = p.container?.remainingQuantity > 0
              const source = p.container?.source
              const sourceName = source?.name ?? null
              const specimenTypeName = p.container?.specimenTypeName ?? null
              const cardTitle = p.barcode || sourceName || specimenTypeName || `Spot ${index + 1}`
              const subtitle = p.barcode && sourceName ? sourceName : specimenTypeName
              
              const normalizePos = (pos: string | null | undefined) => {
                if (!pos) return null
                return pos.toString().trim().toUpperCase()
              }
              
              const normalizedTarget = normalizePos(targetPosition)
              const normalizedPaper = normalizePos(p.position)
              
              const isHighlighted = (targetPosition || targetContainerId) && (
                (normalizedTarget && normalizedPaper && normalizedTarget === normalizedPaper) ||
                (targetContainerId && targetContainerId === String(p.id))
              )
              
              return (
                <button
                  key={p.id}
                  onClick={() => navigate(`/containers/${p.id}`)}
                  data-highlighted-position={isHighlighted ? 'true' : 'false'}
                  className={`p-3 rounded-lg border text-left transition-all ${
                    isHighlighted
                      ? 'ring-2 ring-app-accent ring-offset-2 ring-offset-app-bg border-app-accent shadow-md bg-app-accent-muted'
                      : isActive 
                        ? 'border-app-trend-up/30 bg-app-trend-up/10 hover:border-green-400 hover:shadow-md' 
                        : 'border-app-border bg-app-surface hover:border-app-border hover:shadow-md'
                  }`}
                >
                  <div className="flex justify-between items-start mb-1">
                    <span
                      className={`text-xs font-mono font-bold truncate ${isHighlighted ? 'text-app-accent-on-tint' : 'text-app-text'}`}
                    >
                      {p.position || cardTitle}
                    </span>
                    <div
                      className={`px-1.5 py-0.5 rounded text-[10px] font-bold shrink-0 ml-2 ${
                        isActive
                          ? 'bg-green-200 text-app-trend-up'
                          : isHighlighted
                            ? 'bg-app-accent/25 text-app-accent-on-tint'
                            : 'bg-app-surface text-app-text-muted'
                      }`}
                    >
                      {isActive ? 'IN USE' : 'EMPTY'}
                    </div>
                  </div>
                  {subtitle && (
                    <div
                      className={`text-xs font-medium mt-2 ${isHighlighted ? 'text-app-accent-on-tint' : 'text-app-accent'}`}
                    >
                      {subtitle}
                    </div>
                  )}
                  <div
                    className={`text-[10px] mt-1 ${isHighlighted ? 'text-app-accent-on-tint/80' : 'text-app-text-muted'}`}
                  >
                    {p.container?.remainingQuantity} spots remaining
                  </div>
                </button>
              )
            })}
          </div>
        )}
      </div>
      </div>
    </div>
  )
}


