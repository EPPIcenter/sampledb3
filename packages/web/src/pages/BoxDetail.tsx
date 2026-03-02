import { useEffect, useMemo, useState, useRef } from 'react'
import { useParams, Link, useNavigate } from 'react-router-dom'
import { collectionsApi } from '../lib/api'
import EntityBreadcrumbs from '../components/EntityBreadcrumbs'
import CollectionTableWithExport from '../components/CollectionTableWithExport'
import SkeletonDetailPage from '../components/SkeletonDetailPage'
import {
  COLLECTION_SHEET_TABLE_COLUMNS,
  COLLECTION_SHEET_TABLE_ROW_KEYS,
  buildSheetPaperTableRow,
  getTableColumnsFromExportConfig,
  type CollectionTableEntry,
} from '../lib/collection-table-columns'
import { useTableViewConfigurations } from '../hooks/useTableViewConfigurations'
import '../styles/storage.css'

export default function BoxDetail() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const [data, setData] = useState<any | null>(null)
  const [loading, setLoading] = useState(true)
  const [viewMode, setViewMode] = useState<'sheets' | 'table'>('sheets')
  const [expandedSheets, setExpandedSheets] = useState<Set<number>>(new Set())
  const initializedSheets = useRef(false)
  const {
    configurations: viewConfigurations,
    selectedConfigId,
    setSelectedConfigId,
    loading: loadingConfigs,
  } = useTableViewConfigurations()

  useEffect(() => {
    if (!id) return
    const numericId = parseInt(id)
    if (Number.isNaN(numericId)) return

    const fetchData = async () => {
      try {
        const res = await collectionsApi.getBox(numericId)
        setData(res.data)
        initializedSheets.current = false // Reset initialization when box changes
        setExpandedSheets(new Set()) // Reset expanded sheets
      } catch (err) {
        console.error('Failed to load box:', err)
      } finally {
        setLoading(false)
      }
    }

    fetchData()
  }, [id])

  // Initialize expanded sheets (default to collapsed if more than 3 sheets)
  // This hook must be called before any conditional returns to maintain hook order
  const sheets = data?.contents?.sheets || []
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
    const box = data?.box
    const context = box
      ? { collectionName: box.name ?? undefined, locationPath: box.locationPath ?? undefined }
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
  }, [sheets, data?.box])

  const tableColumns = useMemo(() => {
    if (viewMode !== 'table' || loadingConfigs || viewConfigurations.length === 0) {
      return COLLECTION_SHEET_TABLE_COLUMNS
    }
    const config = viewConfigurations.find((c) => c.name === selectedConfigId)
    const configKeys = config?.columns ?? []
    const resolved = getTableColumnsFromExportConfig(configKeys, COLLECTION_SHEET_TABLE_ROW_KEYS)
    return resolved.length > 0 ? resolved : COLLECTION_SHEET_TABLE_COLUMNS
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

  if (!data?.box) {
    return (
      <div className="storage-page">
        <div className="container mx-auto px-4 py-8 relative z-10">
          <div className="text-center py-8 text-red-600">Box not found</div>
        </div>
      </div>
    )
  }

  const { box, contents } = data

  const breadcrumbItems = [
    { label: 'Locations', to: '/locations' },
    box.location?.id
      ? { label: box.locationPath || `Location #${box.location.id}`, to: `/locations/${box.location.id}` }
      : undefined,
    { label: `Box ${box.name || `#${box.id}`}` },
  ].filter(Boolean) as Array<{ label: string; to?: string }>

  const tubes = contents?.tubes || []

  // Calculate statistics
  const totalSpots = sheets.reduce((sum: number, sheet: any) => 
    sum + (sheet.papers?.reduce((s: number, p: any) => s + (p.container?.totalQuantity || 0), 0) || 0), 0
  )
  const activeTubes = tubes.filter((t: any) => t.container?.remainingQuantity > 0).length
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
        <EntityBreadcrumbs items={breadcrumbItems} />
        <h1 className="text-2xl font-bold">
          Box {box.name || `#${box.id}`}
        </h1>
        {box.locationPath && (
          <p className="mt-1 text-xs font-mono" style={{ color: 'rgb(var(--dashboard-text-muted))' }}>{box.locationPath}</p>
        )}
      </div>

      {/* Summary Statistics Bar */}
      <div className="storage-card p-3 mb-4 storage-reveal storage-reveal-2">
        <div className="flex flex-wrap items-center gap-4 text-xs">
          <div className="flex items-center gap-2">
            <span className="font-semibold" style={{ color: 'rgb(var(--dashboard-text-muted))' }}>Sheets:</span>
            <span style={{ color: 'rgb(var(--dashboard-text))' }}>{sheets.length}</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="font-semibold" style={{ color: 'rgb(var(--dashboard-text-muted))' }}>Spots:</span>
            <span style={{ color: 'rgb(var(--dashboard-text))' }}>{totalSpots}</span>
            {activeSpots > 0 && (
              <span style={{ color: 'rgb(var(--dashboard-accent))' }}>({activeSpots} active)</span>
            )}
          </div>
        </div>
      </div>

      <div className="space-y-4 storage-reveal storage-reveal-3">
        <div className="space-y-3">
          <div className="flex items-center gap-2 flex-wrap">
            <h2 className="text-base font-semibold storage-section-title">Sheets in this Box</h2>
            <div className="flex rounded-md border border-gray-200 overflow-hidden" role="group" aria-label="View mode">
              <button
                type="button"
                onClick={() => setViewMode('sheets')}
                className={`px-2 py-1 text-xs font-medium ${viewMode === 'sheets' ? 'bg-gray-100 border-gray-300' : 'bg-white hover:bg-gray-50'} border-r border-gray-200`}
                aria-pressed={viewMode === 'sheets'}
              >
                Sheets
              </button>
              <button
                type="button"
                onClick={() => setViewMode('table')}
                className={`px-2 py-1 text-xs font-medium ${viewMode === 'table' ? 'bg-gray-100 border-gray-300' : 'bg-white hover:bg-gray-50'}`}
                aria-pressed={viewMode === 'table'}
              >
                Table
              </button>
            </div>
            {viewMode === 'table' && (
              <div className="flex items-center gap-2">
                <label htmlFor="box-table-column-config" className="text-xs font-medium text-gray-600 whitespace-nowrap">
                  Columns:
                </label>
                {loadingConfigs ? (
                  <span className="text-xs text-gray-500">Loading…</span>
                ) : viewConfigurations.length === 0 ? (
                  <span className="text-xs text-gray-500">
                    <Link to="/settings?category=data-management&section=table-view-configurations" className="underline">
                      Add in Settings
                    </Link>
                  </span>
                ) : (
                  <select
                    id="box-table-column-config"
                    value={selectedConfigId}
                    onChange={(e) => setSelectedConfigId(e.target.value)}
                    className="text-xs border border-gray-200 rounded px-2 py-1 bg-white min-w-[140px]"
                    style={{ color: 'rgb(var(--dashboard-text))' }}
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
                exportFilename={`box-${box.name || 'unnamed'}.csv`}
              />
            </div>
          )}
          {viewMode === 'sheets' && sheets.length === 0 && (
            <p className="text-xs" style={{ color: 'rgb(var(--dashboard-text-muted))' }}>No sheets in this box.</p>
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
                  className="bg-gray-50 px-3 py-2 border-b border-gray-100 flex justify-between items-center w-full hover:bg-gray-100 transition-colors"
                >
                  <div className="flex items-center gap-2">
                    <svg
                      className={`w-4 h-4 text-gray-500 transition-transform ${isExpanded ? 'rotate-90' : ''}`}
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                    </svg>
                    <Link 
                      to={`/collections/sheets/${sheet.id}`} 
                      onClick={(e) => e.stopPropagation()}
                      className="font-semibold text-blue-600 hover:text-blue-800 hover:underline"
                    >
                      Sheet: {sheet.name}
                    </Link>
                  </div>
                  <span className="text-xs text-gray-500">
                    {sheetSpots} spots{activeSheetSpots > 0 && ` (${activeSheetSpots} active)`}
                  </span>
                </button>
                {isExpanded && (
                  <div className="p-3">
                    <div className="grid grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-1.5">
                      {sheet.papers?.map((p: any) => {
                        const hasContainer = !!p.container
                        const isClickable = hasContainer && !!p.id
                        
                        return (
                          <button
                            key={p.id}
                            type="button"
                            onClick={() => {
                              if (p.id) navigate(`/containers/${p.id}`)
                            }}
                            disabled={!isClickable}
                            className={`px-1.5 py-1 flex items-center justify-between text-left transition-colors border border-gray-100 rounded ${
                              isClickable
                                ? 'hover:bg-blue-50 hover:border-blue-200 cursor-pointer'
                                : 'bg-gray-50 opacity-50'
                            }`}
                          >
                            <div className="min-w-0 flex-1">
                              <div className="font-medium text-[10px] text-gray-900 truncate">
                                {p.position ? `Pos: ${p.position}` : `#${p.id}`}
                              </div>
                              {p.container?.specimenId && (
                                <div className="text-[9px] text-gray-500 truncate">
                                  Spec: {p.container.specimenId}
                                </div>
                              )}
                            </div>
                            <div className="flex flex-col items-end gap-0.5 flex-shrink-0 ml-1">
                              <div className={`px-1 py-0.5 rounded text-[8px] font-bold ${p.container?.remainingQuantity > 0 ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
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
      </div>
    </div>
  )
}


