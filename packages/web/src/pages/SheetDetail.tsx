import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import api, { collectionsApi } from '../lib/api'
import EntityBreadcrumbs from '../components/EntityBreadcrumbs'

export default function SheetDetail() {
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

  if (loading) {
    return (
      <div className="container mx-auto px-4 py-8">
        <div className="text-center py-8">Loading...</div>
      </div>
    )
  }

  if (!data?.sheet) {
    return (
      <div className="container mx-auto px-4 py-8">
        <div className="text-center py-8 text-red-600">Sheet not found</div>
      </div>
    )
  }

  const { sheet, papers } = data

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
    <div className="container mx-auto px-4 py-8">
      <div className="mb-6">
        <EntityBreadcrumbs items={breadcrumbItems} />
        <h1 className="text-3xl font-bold text-gray-900">
          Sheet: {sheet.name}
        </h1>
        {sheet.locationPath && (
          <p className="mt-1 text-sm text-gray-600 font-mono">{sheet.locationPath}</p>
        )}
      </div>

      <div className="bg-white rounded-lg shadow border border-gray-100 p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4 flex justify-between items-center">
          DBS Spots
          <span className="text-sm font-normal text-gray-500">
            {papers.reduce((sum: number, p: any) => sum + (p.container?.totalQuantity || 0), 0)} total spots
          </span>
        </h2>
        
        {papers.length === 0 ? (
          <p className="text-sm text-gray-500 italic">No spots recorded on this sheet.</p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
            {papers.map((p: any) => {
              const hasContainer = !!p.container
              const isActive = p.container?.remainingQuantity > 0
              
              return (
                <button
                  key={p.id}
                  onClick={() => navigate(`/containers/${p.id}`)}
                  className={`p-3 rounded-lg border text-left transition-all ${
                    isActive 
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
  )
}


