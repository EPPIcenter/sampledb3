import { useEffect, useState, useRef } from 'react'
import { useParams, Link, useNavigate } from 'react-router-dom'
import { collectionsApi } from '../lib/api'
import EntityBreadcrumbs from '../components/EntityBreadcrumbs'
import SkeletonDetailPage from '../components/SkeletonDetailPage'
import '../styles/storage.css'

export default function BagDetail() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const [data, setData] = useState<any | null>(null)
  const [loading, setLoading] = useState(true)
  const [expandedSheets, setExpandedSheets] = useState<Set<number>>(new Set())
  const initializedSheets = useRef(false)

  useEffect(() => {
    if (!id) return
    const numericId = parseInt(id)
    if (Number.isNaN(numericId)) return

    const fetchData = async () => {
      try {
        const res = await collectionsApi.getBag(numericId)
        setData(res.data)
        initializedSheets.current = false // Reset initialization when bag changes
        setExpandedSheets(new Set()) // Reset expanded sheets
      } catch (err) {
        console.error('Failed to load bag:', err)
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

  if (loading) {
    return (
      <div className="storage-page">
        <div className="container mx-auto px-4 py-8 relative z-10">
          <SkeletonDetailPage sections={1} />
        </div>
      </div>
    )
  }

  if (!data?.bag) {
    return (
      <div className="storage-page">
        <div className="container mx-auto px-4 py-8 relative z-10">
          <div className="text-center py-8 text-red-600">Bag not found</div>
        </div>
      </div>
    )
  }

  const { bag, contents } = data

  const breadcrumbItems = [
    { label: 'Locations', to: '/locations' },
    bag.location?.id
      ? { label: bag.locationPath || `Location #${bag.location.id}`, to: `/locations/${bag.location.id}` }
      : undefined,
    { label: `Bag ${bag.name || `#${bag.id}`}` },
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
        <EntityBreadcrumbs items={breadcrumbItems} />
        <h1 className="text-2xl font-bold">
          Bag {bag.name || `#${bag.id}`}
        </h1>
        {bag.locationPath && (
          <p className="mt-1 text-xs font-mono" style={{ color: 'rgb(var(--dashboard-text-muted))' }}>{bag.locationPath}</p>
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

      <div className="space-y-3 storage-reveal storage-reveal-3">
        <h2 className="text-base font-semibold storage-section-title">Sheets in this Bag</h2>
        {sheets.length === 0 && (
          <p className="text-xs" style={{ color: 'rgb(var(--dashboard-text-muted))' }}>No sheets in this bag.</p>
        )}
        {sheets.map((sheet: any) => {
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
  )
}


