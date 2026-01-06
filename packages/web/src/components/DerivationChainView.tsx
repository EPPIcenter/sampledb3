import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { derivationsApi, type Derivation } from '../lib/api'
import { getContainerTypeIcon, getContainerTypeName } from '../lib/icons'

interface DerivationChainViewProps {
  containerId: number
  onClose?: () => void
}

export default function DerivationChainView({ containerId, onClose }: DerivationChainViewProps) {
  const navigate = useNavigate()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [chain, setChain] = useState<{
    ancestors: Array<{ container: any; derivation: Derivation }>
    descendants: Array<{ container: any; derivation: Derivation }>
    current: any
  } | null>(null)

  useEffect(() => {
    loadChain()
  }, [containerId])

  const loadChain = async () => {
    try {
      setLoading(true)
      setError(null)
      const response = await derivationsApi.getChain(containerId)
      setChain(response.data)
    } catch (err: any) {
      console.error('Failed to load derivation chain:', err)
      setError(err.response?.data?.error || 'Failed to load derivation chain')
    } finally {
      setLoading(false)
    }
  }

  if (loading) {
    return (
      <div className="bg-white rounded-lg border border-gray-100 p-6">
        <div className="text-center text-gray-500">Loading derivation chain...</div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="bg-white rounded-lg border border-gray-100 p-6">
        <div className="text-center text-red-600">{error}</div>
      </div>
    )
  }

  if (!chain) {
    return (
      <div className="bg-white rounded-lg border border-gray-100 p-6">
        <div className="text-center text-gray-500">No derivation chain found</div>
      </div>
    )
  }

  const { ancestors, descendants, current } = chain

  return (
    <div className="bg-white rounded-lg border border-gray-100 p-6">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-xl font-bold text-gray-900">Derivation Chain</h2>
        {onClose && (
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 transition-colors"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        )}
      </div>

      <div className="space-y-6">
        {/* Ancestors (parents) */}
        {ancestors.length > 0 && (
          <div>
            <h3 className="text-sm font-semibold text-gray-700 mb-3 uppercase tracking-wide">
              Ancestors ({ancestors.length})
            </h3>
            <div className="space-y-3">
              {ancestors.map((item, idx) => (
                <div key={item.derivation.id} className="flex items-center gap-3">
                  <div className="flex-shrink-0 w-8 h-8 flex items-center justify-center bg-gray-100 rounded-full text-xs font-medium text-gray-600">
                    {ancestors.length - idx}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      {getContainerTypeIcon(item.container?.containerType)}
                      <span className="font-medium text-gray-900">
                        {getContainerTypeName(item.container?.containerType)}
                      </span>
                      <span className="text-xs text-gray-500">
                        ({item.derivation.derivationType})
                      </span>
                    </div>
                    {item.container?.collection?.barcode && (
                      <div className="text-xs text-gray-600 font-mono">
                        {item.container.collection.barcode}
                      </div>
                    )}
                  </div>
                  <button
                    onClick={() => navigate(`/containers/${item.container.id}`)}
                    className="text-sm text-blue-600 hover:text-blue-800 hover:underline flex-shrink-0"
                  >
                    View →
                  </button>
                </div>
              ))}
              <div className="flex items-center gap-2 text-gray-400 ml-4">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
                <span className="text-xs">derived from</span>
              </div>
            </div>
          </div>
        )}

        {/* Current Container */}
        <div className="bg-blue-50 border-2 border-blue-200 rounded-lg p-4">
          <div className="flex items-center gap-3">
            <div className="flex-shrink-0 w-8 h-8 flex items-center justify-center bg-blue-600 rounded-full text-xs font-medium text-white">
              C
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                {getContainerTypeIcon(current?.containerType)}
                <span className="font-semibold text-gray-900">
                  {getContainerTypeName(current?.containerType)} (Current)
                </span>
              </div>
              {current?.collection?.barcode && (
                <div className="text-xs text-gray-600 font-mono">
                  {current.collection.barcode}
                </div>
              )}
            </div>
            <button
              onClick={() => navigate(`/containers/${current.id}`)}
              className="text-sm text-blue-600 hover:text-blue-800 hover:underline flex-shrink-0"
            >
              View →
            </button>
          </div>
        </div>

        {/* Descendants (children) */}
        {descendants.length > 0 && (
          <div>
            <div className="flex items-center gap-2 text-gray-400 mb-3">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
              <span className="text-xs">derived to</span>
            </div>
            <h3 className="text-sm font-semibold text-gray-700 mb-3 uppercase tracking-wide">
              Descendants ({descendants.length})
            </h3>
            <div className="space-y-3">
              {descendants.map((item, idx) => (
                <div key={item.derivation.id} className="flex items-center gap-3">
                  <div className="flex-shrink-0 w-8 h-8 flex items-center justify-center bg-gray-100 rounded-full text-xs font-medium text-gray-600">
                    {idx + 1}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      {getContainerTypeIcon(item.container?.containerType)}
                      <span className="font-medium text-gray-900">
                        {getContainerTypeName(item.container?.containerType)}
                      </span>
                      <span className="text-xs text-gray-500">
                        ({item.derivation.derivationType})
                      </span>
                    </div>
                    {item.container?.collection?.barcode && (
                      <div className="text-xs text-gray-600 font-mono">
                        {item.container.collection.barcode}
                      </div>
                    )}
                    {item.derivation.derivationDate && (
                      <div className="text-xs text-gray-500">
                        {new Date(item.derivation.derivationDate).toLocaleDateString()}
                      </div>
                    )}
                  </div>
                  <button
                    onClick={() => navigate(`/containers/${item.container.id}`)}
                    className="text-sm text-blue-600 hover:text-blue-800 hover:underline flex-shrink-0"
                  >
                    View →
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {ancestors.length === 0 && descendants.length === 0 && (
          <div className="text-center text-gray-500 py-8">
            This container has no derivation relationships.
          </div>
        )}
      </div>
    </div>
  )
}

