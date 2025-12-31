import { useEffect, useState, useRef } from 'react'
import { useParams, Link, useNavigate } from 'react-router-dom'
import { collectionsApi } from '../lib/api'
import EntityBreadcrumbs from '../components/EntityBreadcrumbs'
import SkeletonDetailPage from '../components/SkeletonDetailPage'

export default function BoxDetail() {
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

  if (loading) {
    return <SkeletonDetailPage sections={1} />
  }

  if (!data?.box) {
    return (
      <div className="container mx-auto px-4 py-8">
        <div className="text-center py-8 text-red-600">Box not found</div>
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
    <div className="container mx-auto px-4 py-8">
      <div className="mb-4">
        <EntityBreadcrumbs items={breadcrumbItems} />
        <h1 className="text-2xl font-bold text-gray-900">
          Box {box.name || `#${box.id}`}
        </h1>
        {box.locationPath && (
          <p className="mt-1 text-xs text-gray-600 font-mono">{box.locationPath}</p>
        )}
      </div>

      {/* Summary Statistics Bar */}
      <div className="bg-white rounded-lg shadow p-3 mb-4">
        <div className="flex flex-wrap items-center gap-4 text-xs">
          <div className="flex items-center gap-2">
            <span className="font-semibold text-gray-700">Tubes:</span>
            <span className="text-gray-900">{tubes.length}</span>
            {activeTubes > 0 && (
              <span className="text-green-600">({activeTubes} active)</span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <span className="font-semibold text-gray-700">Sheets:</span>
            <span className="text-gray-900">{sheets.length}</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="font-semibold text-gray-700">Spots:</span>
            <span className="text-gray-900">{totalSpots}</span>
            {activeSpots > 0 && (
              <span className="text-green-600">({activeSpots} active)</span>
            )}
          </div>
        </div>
      </div>

      <div className="space-y-4">
        <div className="bg-white rounded-lg shadow p-4">
          <h2 className="text-base font-semibold text-gray-900 mb-2">Tubes</h2>
          {tubes.length === 0 && (
            <p className="text-xs text-gray-500">No tubes in this box.</p>
          )}
          {tubes.length > 0 && (
            <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-2">
              {tubes.map((tube: any) => {
                const hasContainer = !!tube.container
                const isClickable = hasContainer && !!tube.id
                
                return (
                  <button
                    key={tube.id}
                    type="button"
                    onClick={() => {
                      if (tube.id) navigate(`/containers/${tube.id}`)
                    }}
                    disabled={!isClickable}
                    className={`flex items-center justify-between rounded border px-2 py-1.5 text-xs text-left transition-colors ${
                      isClickable
                        ? 'hover:border-blue-300 hover:bg-blue-50 cursor-pointer focus:outline-none focus:ring-2 focus:ring-blue-400'
                        : 'bg-gray-50 opacity-50 cursor-default'
                    }`}
                  >
                    <div className="min-w-0 flex-1">
                      <div className="font-semibold text-gray-900 truncate">
                        {tube.boxPosition}
                      </div>
                      <div className="text-[10px] text-gray-600 truncate">
                        {tube.label}
                      </div>
                      {tube.container?.specimenId && (
                        <div className="mt-0.5 text-[9px] text-gray-500 truncate">
                          Spec: {tube.container.specimenId}
                        </div>
                      )}
                    </div>
                    <div className="flex flex-col items-end gap-0.5 flex-shrink-0 ml-1">
                      <div className={`px-1 py-0.5 rounded text-[8px] font-bold ${tube.container?.remainingQuantity > 0 ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                        {tube.container?.remainingQuantity > 0 ? 'ACTIVE' : 'EMPTY'}
                      </div>
                    </div>
                  </button>
                )
              })}
            </div>
          )}
        </div>

        <div className="space-y-3">
          <h2 className="text-base font-semibold text-gray-900">Sheets in this Box</h2>
          {sheets.length === 0 && (
            <p className="text-xs text-gray-500">No sheets in this box.</p>
          )}
          {sheets.map((sheet: any) => {
            const isExpanded = expandedSheets.has(sheet.id)
            const sheetSpots = sheet.papers?.reduce((sum: number, p: any) => sum + (p.container?.totalQuantity || 0), 0) || 0
            const activeSheetSpots = sheet.papers?.filter((p: any) => p.container?.remainingQuantity > 0).length || 0
            
            return (
              <div key={sheet.id} className="bg-white rounded-lg shadow border border-gray-100 overflow-hidden">
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


