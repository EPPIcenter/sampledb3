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
      <div className="bg-app-card rounded-lg border border-app-border p-6">
        <div className="text-center text-app-text-muted">Loading derivation chain...</div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="bg-app-card rounded-lg border border-app-border p-6">
        <div className="text-center text-app-trend-down">{error}</div>
      </div>
    )
  }

  if (!chain) {
    return (
      <div className="bg-app-card rounded-lg border border-app-border p-6">
        <div className="text-center text-app-text-muted">No derivation chain found</div>
      </div>
    )
  }

  const { ancestors, descendants, current } = chain

  return (
    <div className="bg-app-card rounded-lg border border-app-border p-6">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-xl font-bold text-app-text">Derivation Chain</h2>
        {onClose && (
          <button
            onClick={onClose}
            className="text-app-text-muted hover:text-app-text transition-colors"
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
            <h3 className="text-sm font-semibold text-app-text mb-3 uppercase tracking-wide">
              Ancestors ({ancestors.length})
            </h3>
            <div className="space-y-3">
              {ancestors.map((item, idx) => (
                <div key={item.derivation.id} className="flex items-center gap-3">
                  <div className="flex-shrink-0 w-8 h-8 flex items-center justify-center bg-app-surface rounded-full text-xs font-medium text-app-text-muted">
                    {ancestors.length - idx}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      {getContainerTypeIcon(item.container?.containerType)}
                      <span className="font-medium text-app-text">
                        {getContainerTypeName(item.container?.containerType)}
                      </span>
                      <span className="text-xs text-app-text-muted">
                        ({item.derivation.derivationType})
                      </span>
                    </div>
                    {item.container?.collection?.barcode && (
                      <div className="text-xs text-app-text-muted font-mono">
                        {item.container.collection.barcode}
                      </div>
                    )}
                  </div>
                  <button
                    onClick={() => navigate(`/containers/${item.container.id}`)}
                    className="text-sm text-app-accent hover:text-app-accent-hover hover:underline flex-shrink-0"
                  >
                    View →
                  </button>
                </div>
              ))}
              <div className="flex items-center gap-2 text-app-text-muted ml-4">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
                <span className="text-xs">derived from</span>
              </div>
            </div>
          </div>
        )}

        {/* Current Container */}
        <div className="bg-app-accent-muted border-2 border-app-accent rounded-lg p-4">
          <div className="flex items-center gap-3">
            <div className="flex-shrink-0 w-8 h-8 flex items-center justify-center bg-app-accent rounded-full text-xs font-medium text-white">
              C
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                {getContainerTypeIcon(current?.containerType)}
                <span className="font-semibold text-app-text">
                  {getContainerTypeName(current?.containerType)} (Current)
                </span>
              </div>
              {current?.collection?.barcode && (
                <div className="text-xs text-app-text-muted font-mono">
                  {current.collection.barcode}
                </div>
              )}
            </div>
            <button
              onClick={() => navigate(`/containers/${current.id}`)}
              className="text-sm text-app-accent hover:text-app-accent-hover hover:underline flex-shrink-0"
            >
              View →
            </button>
          </div>
        </div>

        {/* Descendants (children) */}
        {descendants.length > 0 && (
          <div>
            <div className="flex items-center gap-2 text-app-text-muted mb-3">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
              <span className="text-xs">derived to</span>
            </div>
            <h3 className="text-sm font-semibold text-app-text mb-3 uppercase tracking-wide">
              Descendants ({descendants.length})
            </h3>
            <div className="space-y-3">
              {descendants.map((item, idx) => (
                <div key={item.derivation.id} className="flex items-center gap-3">
                  <div className="flex-shrink-0 w-8 h-8 flex items-center justify-center bg-app-surface rounded-full text-xs font-medium text-app-text-muted">
                    {idx + 1}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      {getContainerTypeIcon(item.container?.containerType)}
                      <span className="font-medium text-app-text">
                        {getContainerTypeName(item.container?.containerType)}
                      </span>
                      <span className="text-xs text-app-text-muted">
                        ({item.derivation.derivationType})
                      </span>
                    </div>
                    {item.container?.collection?.barcode && (
                      <div className="text-xs text-app-text-muted font-mono">
                        {item.container.collection.barcode}
                      </div>
                    )}
                    {item.derivation.derivationDate && (
                      <div className="text-xs text-app-text-muted">
                        {new Date(item.derivation.derivationDate).toLocaleDateString()}
                      </div>
                    )}
                  </div>
                  <button
                    onClick={() => navigate(`/containers/${item.container.id}`)}
                    className="text-sm text-app-accent hover:text-app-accent-hover hover:underline flex-shrink-0"
                  >
                    View →
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {ancestors.length === 0 && descendants.length === 0 && (
          <div className="text-center text-app-text-muted py-8">
            This container has no derivation relationships.
          </div>
        )}
      </div>
    </div>
  )
}

