import { useEffect, useMemo, useState, useRef } from 'react'
import { useParams, Link, useNavigate } from 'react-router-dom'
import EntityBreadcrumbs from '../components/EntityBreadcrumbs'
import CollectionTableWithExport from '../components/CollectionTableWithExport'
import { useBag } from '../hooks/useCollections'
import { DetailPageSkeleton, PageError, fromQuery, getQueryErrorMessage } from '../ui'
import {
  COLLECTION_SHEET_TABLE_COLUMNS,
  COLLECTION_SHEET_TABLE_ROW_KEYS,
  buildSheetPaperTableRow,
  getTableColumnsFromExportConfig,
  type CollectionTableEntry,
} from '../lib/collection-table-columns'
import { useTableViewConfigurations } from '../hooks/useTableViewConfigurations'
import CollectionDeleteDialog from '../components/CollectionDeleteDialog'
import '../styles/storage.css'

export default function BagDetail() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const bagId = id != null ? parseInt(id, 10) : NaN
  const dataQuery = useBag(bagId)
  const data = dataQuery.data ?? null
  const detailStatus = fromQuery(dataQuery)
  const [viewMode, setViewMode] = useState<'sheets' | 'table'>('sheets')
  const [showDeleteCollection, setShowDeleteCollection] = useState(false)
  const [expandedSheets, setExpandedSheets] = useState<Set<number>>(new Set())
  const initializedSheets = useRef(false)
  const {
    configurations: viewConfigurations,
    selectedConfigId,
    setSelectedConfigId,
    loading: loadingConfigs,
  } = useTableViewConfigurations()

  useEffect(() => {
    initializedSheets.current = false
    setExpandedSheets(new Set())
  }, [bagId])

  // Initialize expanded sheets (default to collapsed if more than 3 sheets)
  // This hook must be called before any conditional returns to maintain hook order
  const sheets = (data?.contents?.sheets || []) as Array<{
    id: number
    name?: string
    papers?: CollectionTableEntry[]
  }>
  useEffect(() => {
    if (sheets.length > 0 && !initializedSheets.current) {
      initializedSheets.current = true
      // Default to expanded if 3 or fewer sheets, otherwise collapsed
      if (sheets.length <= 3) {
        setExpandedSheets(new Set(sheets.map((s: any) => s.id)))
      }
    }
  }, [sheets.length])

  const tableRows = useMemo(() => {
    const bag = data?.bag
    const context = bag
      ? { collectionName: bag.name ?? undefined, locationPath: bag.locationPath ?? undefined }
      : undefined
    const list: ReturnType<typeof buildSheetPaperTableRow>[] = []
    sheets.forEach((sheet: { id: number; name?: string; papers?: CollectionTableEntry[] }) => {
      (sheet.papers || []).forEach((p: CollectionTableEntry) => {
        list.push(
          buildSheetPaperTableRow(
            {
              position: p.position,
              barcode: p.barcode,
              containerType: 'paper',
              container: p.container ?? undefined,
              context,
            },
            sheet.name ?? String(sheet.id)
          )
        )
      })
    })
    return list
  }, [sheets, data?.bag])

  const tableColumns = useMemo(() => {
    if (viewMode !== 'table' || loadingConfigs || viewConfigurations.length === 0) {
      return COLLECTION_SHEET_TABLE_COLUMNS
    }
    const config = viewConfigurations.find((c) => c.name === selectedConfigId)
    const configKeys = config?.columns ?? []
    const resolved = getTableColumnsFromExportConfig(configKeys, COLLECTION_SHEET_TABLE_ROW_KEYS)
    return resolved.length > 0 ? resolved : COLLECTION_SHEET_TABLE_COLUMNS
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
            title="Could not load bag"
            message={getQueryErrorMessage(dataQuery.error, 'Failed to load bag')}
            onRetry={() => void dataQuery.refetch()}
          />
        </div>
      </div>
    )
  }

  if (!data?.bag) {
    return (
      <div className="storage-page">
        <div className="container mx-auto px-4 py-8 relative z-10">
          <div className="text-center py-8 text-app-trend-down">Bag not found</div>
        </div>
      </div>
    )
  }

  const { bag, contents } = data

  const breadcrumbItems = [
    { label: 'Locations', to: '/locations' },
    bag.location?.id
      ? { label: bag.locationPath, to: `/locations/${bag.location.id}` }
      : undefined,
    { label: `Bag ${bag.name}` },
  ].filter(Boolean) as Array<{ label: string; to?: string }>

  // Calculate statistics
  const totalSpots = sheets.reduce((sum: number, sheet: any) => 
    sum + (sheet.papers?.reduce((s: number, p: any) => s + (p.container?.totalQuantity || 0), 0) || 0), 0
  )
  const activeSpots = sheets.reduce((sum: number, sheet: any) => 
    sum + (sheet.papers?.filter((p: any) => p.container?.remainingQuantity > 0).length || 0), 0
  )

  const toggleSheet = (sheetId: number) => {
    setExpandedSheets(prev => {
      const next = new Set(prev)
      if (next.has(sheetId)) {
        next.delete(sheetId)
      } else {
        next.add(sheetId)
      }
      return next
    })
  }

  return (
    <div className="storage-page">
      <div className="container mx-auto px-4 py-8 relative z-10">
      <div className="mb-4 storage-reveal storage-reveal-1">
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
          <div>
        <EntityBreadcrumbs items={breadcrumbItems} />
        <h1 className="text-2xl font-bold">
          Bag {bag.name}
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
        {bag.locationPath && (
          <p className="mt-1 text-xs font-mono" style={{ color: 'rgb(var(--app-text-muted))' }}>{bag.locationPath}</p>
        )}
      </div>

      {/* Summary Statistics Bar */}
      <div className="storage-card p-3 mb-4 storage-reveal storage-reveal-2">
        <div className="flex flex-wrap items-center gap-4 text-xs">
          <div className="flex items-center gap-2">
            <span className="font-semibold" style={{ color: 'rgb(var(--app-text-muted))' }}>Sheets:</span>
            <span style={{ color: 'rgb(var(--app-text))' }}>{sheets.length}</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="font-semibold" style={{ color: 'rgb(var(--app-text-muted))' }}>Spots:</span>
            <span style={{ color: 'rgb(var(--app-text))' }}>{totalSpots}</span>
            {activeSpots > 0 && (
              <span style={{ color: 'rgb(var(--app-accent))' }}>({activeSpots} active)</span>
            )}
          </div>
        </div>
      </div>

      <div className="space-y-3 storage-reveal storage-reveal-3">
        <div className="flex items-center gap-2 flex-wrap">
          <h2 className="text-base font-semibold storage-section-title">Sheets in this Bag</h2>
          <div className="flex rounded-md border border-app-border overflow-hidden" role="group" aria-label="View mode">
            <button
              type="button"
              onClick={() => setViewMode('sheets')}
              className={`px-2 py-1 text-xs font-medium ${viewMode === 'sheets' ? 'bg-app-surface border-app-border' : 'bg-app-card hover:bg-app-surface'} border-r border-app-border`}
              aria-pressed={viewMode === 'sheets'}
            >
              Sheets
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
              <label htmlFor="bag-table-column-config" className="text-xs font-medium text-app-text-muted whitespace-nowrap">
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
                    id="bag-table-column-config"
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
        {viewMode === 'table' && (
          <div className="storage-card p-4">
            <CollectionTableWithExport
              columns={tableColumns}
              rows={tableRows}
              exportFilename={`bag-${bag.name || 'unnamed'}.csv`}
            />
          </div>
        )}
        {viewMode === 'sheets' && sheets.length === 0 && (
          <p className="text-xs" style={{ color: 'rgb(var(--app-text-muted))' }}>No sheets in this bag.</p>
        )}
        {viewMode === 'sheets' && sheets.map((sheet: any) => {
          const isExpanded = expandedSheets.has(sheet.id)
          const sheetSpots = sheet.papers?.reduce((sum: number, p: any) => sum + (p.container?.totalQuantity || 0), 0) || 0
          const activeSheetSpots = sheet.papers?.filter((p: any) => p.container?.remainingQuantity > 0).length || 0
          
          return (
            <div key={sheet.id} className="storage-card overflow-hidden">
              <button
                type="button"
                onClick={() => toggleSheet(sheet.id)}
                className="bg-app-surface px-3 py-2 border-b border-app-border flex justify-between items-center w-full hover:bg-app-surface transition-colors"
              >
                <div className="flex items-center gap-2">
                  <svg
                    className={`w-4 h-4 text-app-text-muted transition-transform ${isExpanded ? 'rotate-90' : ''}`}
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                  <Link 
                    to={`/collections/sheets/${sheet.id}`} 
                    onClick={(e) => e.stopPropagation()}
                    className="font-semibold text-app-accent hover:text-app-accent-hover hover:underline"
                  >
                    Sheet: {sheet.name}
                  </Link>
                </div>
                <span className="text-xs text-app-text-muted">
                  {sheetSpots} spots{activeSheetSpots > 0 && ` (${activeSheetSpots} active)`}
                </span>
              </button>
              {isExpanded && (
                <div className="p-3">
                  <div className="grid grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-1.5">
                    {sheet.papers?.map((p: any, pIdx: number) => {
                      const hasContainer = !!p.container
                      const isClickable = hasContainer && !!p.id
                      const source = p.container?.source
                      const cardLabel = p.barcode || source?.name || p.container?.specimenTypeName || `Spot ${pIdx + 1}`
                      
                      return (
                        <button
                          key={p.id}
                          type="button"
                          onClick={() => {
                            if (p.id) navigate(`/containers/${p.id}`)
                          }}
                          disabled={!isClickable}
                          className={`px-1.5 py-1 flex items-center justify-between text-left transition-colors border border-app-border rounded ${
                            isClickable
                              ? 'hover:bg-app-accent-muted hover:border-app-accent/50 cursor-pointer'
                              : 'bg-app-surface opacity-50'
                          }`}
                        >
                          <div className="min-w-0 flex-1">
                            <div className="font-medium text-[10px] text-app-text truncate">
                              {p.position ? `Pos: ${p.position}` : cardLabel}
                            </div>
                          </div>
                          <div className="flex flex-col items-end gap-0.5 flex-shrink-0 ml-1">
                            <div className={`px-1 py-0.5 rounded text-[8px] font-bold ${p.container?.remainingQuantity > 0 ? 'bg-app-trend-up/10 text-app-trend-up' : 'bg-app-trend-down/10 text-app-trend-down'}`}>
                              {p.container?.remainingQuantity > 0 ? 'ACTIVE' : 'EMPTY'}
                            </div>
                          </div>
                        </button>
                      )
                    })}
                  </div>
                </div>
              )}
            </div>
          )
        })}
      </div>
      </div>
      <CollectionDeleteDialog
        isOpen={showDeleteCollection}
        onClose={() => setShowDeleteCollection(false)}
        collectionType="bag"
        id={parseInt(id || '0', 10)}
        collectionName={String(bag.name)}
        kindLabel="Bag"
        onDeleted={() => navigate('/collections')}
      />
    </div>
  )
}


