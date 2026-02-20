import { useEffect, useMemo, useState } from 'react'
import { useParams, useNavigate, useSearchParams } from 'react-router-dom'
import { collectionsApi } from '../lib/api'
import EntityBreadcrumbs from '../components/EntityBreadcrumbs'
import CollectionTableWithExport from '../components/CollectionTableWithExport'
import SkeletonDetailPage from '../components/SkeletonDetailPage'
import {
  COLLECTION_GRID_TABLE_COLUMNS,
  buildCollectionTableRow,
  type CollectionTableEntry,
} from '../lib/collection-table-columns'
import '../styles/storage.css'

export default function SheetDetail() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const [data, setData] = useState<any | null>(null)
  const [loading, setLoading] = useState(true)
  const [viewMode, setViewMode] = useState<'cards' | 'table'>('cards')

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

  if (loading) {
    return (
      <div className="storage-page">
        <div className="container mx-auto px-4 py-8 relative z-10">
          <SkeletonDetailPage sections={1} />
        </div>
      </div>
    )
  }

  if (!data?.sheet) {
    return (
      <div className="storage-page">
        <div className="container mx-auto px-4 py-8 relative z-10">
          <div className="text-center py-8 text-red-600">Sheet not found</div>
        </div>
      </div>
    )
  }

  const { sheet, papers } = data

  const tableRows = useMemo(() => {
    return papers.map((p: CollectionTableEntry) =>
      buildCollectionTableRow({
        position: p.position,
        barcode: p.barcode,
        container: p.container ?? undefined,
      })
    )
  }, [papers])

  const breadcrumbItems = [
    { label: 'Locations', to: '/locations' },
    sheet.location?.id
      ? { label: sheet.locationPath || `Location #${sheet.location.id}`, to: `/locations/${sheet.location.id}` }
      : undefined,
    sheet.bag ? { label: sheet.bag.name || `Bag #${sheet.bag.id}`, to: `/collections/bags/${sheet.bag.id}` } : undefined,
    sheet.box ? { label: sheet.box.name || `Box #${sheet.box.id}`, to: `/collections/boxes/${sheet.box.id}` } : undefined,
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
          <p className="mt-1 text-sm font-mono" style={{ color: 'rgb(var(--dashboard-text-muted))' }}>{sheet.locationPath}</p>
        )}
      </div>

      <div className="storage-card p-6 storage-reveal storage-reveal-2">
        <div className="flex flex-wrap items-center justify-between gap-4 mb-4">
          <div className="flex items-center gap-2 flex-wrap">
            <h2 className="text-lg font-semibold storage-section-title">
              DBS Spots
            </h2>
            <span className="text-sm font-normal" style={{ color: 'rgb(var(--dashboard-text-muted))' }}>
              {papers.reduce((sum: number, p: any) => sum + (p.container?.totalQuantity || 0), 0)} total spots
            </span>
            {papers.length > 0 && (
              <div className="flex rounded-md border border-gray-200 overflow-hidden" role="group" aria-label="View mode">
                <button
                  type="button"
                  onClick={() => setViewMode('cards')}
                  className={`px-2 py-1 text-xs font-medium ${viewMode === 'cards' ? 'bg-gray-100 border-gray-300' : 'bg-white hover:bg-gray-50'} border-r border-gray-200`}
                  aria-pressed={viewMode === 'cards'}
                >
                  Cards
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
            )}
          </div>
        </div>

        {papers.length === 0 ? (
          <p className="text-sm italic" style={{ color: 'rgb(var(--dashboard-text-muted))' }}>No spots recorded on this sheet.</p>
        ) : viewMode === 'table' ? (
          <CollectionTableWithExport
            columns={COLLECTION_GRID_TABLE_COLUMNS}
            rows={tableRows}
            exportFilename={`sheet-${sheet.name || 'unnamed'}.csv`}
          />
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
            {papers.map((p: any) => {
              const hasContainer = !!p.container
              const isActive = p.container?.remainingQuantity > 0
              
              // Check if this paper should be highlighted
              // Normalize positions for comparison (trim whitespace, handle null/undefined)
              const normalizePos = (pos: string | null | undefined) => {
                if (!pos) return null
                return pos.toString().trim().toUpperCase()
              }
              
              const normalizedTarget = normalizePos(targetPosition)
              const normalizedPaper = normalizePos(p.position)
              
              // Try multiple matching strategies
              const isHighlighted = (targetPosition || targetContainerId) && (
                // 1. Direct normalized position match (case-insensitive, trimmed)
                (normalizedTarget && normalizedPaper && normalizedTarget === normalizedPaper) ||
                // 2. Match by ID if target is #ID format
                (targetPosition && targetPosition.trim().startsWith('#') && targetPosition.trim() === `#${p.id}`) ||
                // 3. Match if paper has no position but target matches the ID format
                (!p.position && normalizedTarget === `#${p.id}`.toUpperCase()) ||
                // 4. Match by container ID (fallback when position is missing)
                (targetContainerId && targetContainerId === String(p.id)) ||
                // 5. If position is null/empty, try matching by container ID from position param
                (!p.position && targetPosition && !normalizedTarget?.startsWith('#') && targetPosition.trim() === String(p.id))
              )
              
              return (
                <button
                  key={p.id}
                  onClick={() => navigate(`/containers/${p.id}`)}
                  data-highlighted-position={isHighlighted ? 'true' : 'false'}
                  className={`p-3 rounded-lg border text-left transition-all ${
                    isHighlighted
                      ? 'ring-4 ring-yellow-400 ring-offset-2 border-yellow-500 shadow-lg bg-yellow-50'
                      : isActive 
                        ? 'border-green-200 bg-green-50 hover:border-green-400 hover:shadow-md' 
                        : 'border-gray-100 bg-gray-50 hover:border-gray-200 hover:shadow-md'
                  }`}
                >
                  <div className="flex justify-between items-start mb-1">
                    <span className="text-xs font-mono font-bold text-gray-700">
                      {p.position || `#${p.id}`}
                    </span>
                    <div className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${isActive ? 'bg-green-200 text-green-800' : 'bg-gray-200 text-gray-600'}`}>
                      {isActive ? 'IN USE' : 'EMPTY'}
                    </div>
                  </div>
                  {p.barcode && (
                    <div className="text-[10px] text-gray-500 mb-1">
                      Barcode: {p.barcode}
                    </div>
                  )}
                  {p.container?.specimenId && (
                    <div className="text-xs font-medium text-blue-600 mt-2">
                      Specimen #{p.container.specimenId}
                    </div>
                  )}
                  <div className="text-[10px] text-gray-400 mt-1">
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


