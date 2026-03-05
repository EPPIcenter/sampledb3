import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import api, { type SearchResult } from '../lib/api'
import { useHotkey } from '../hooks/useHotkey'
import ModalPortal from './ModalPortal'

interface SearchModalProps {
  isOpen: boolean
  onClose: () => void
  /** When provided, modal opens with this query prefilled and search runs (e.g. from dashboard hero search). */
  initialQuery?: string
}

export default function SearchModal({ isOpen, onClose, initialQuery }: SearchModalProps) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<SearchResult[]>([])
  const [loading, setLoading] = useState(false)
  const [selectedIndex, setSelectedIndex] = useState(0)
  const navigate = useNavigate()
  const inputRef = useRef<HTMLInputElement>(null)
  const resultsRef = useRef<HTMLDivElement>(null)
  const prevResultsRef = useRef<SearchResult[]>(results)
  const prevOpenKeyRef = useRef<string | null>(null)
  const ignoreMouseEnterRef = useRef(false)

  // Reset selection when results change (during render to avoid extra pass)
  if (results !== prevResultsRef.current) {
    prevResultsRef.current = results
    setSelectedIndex(0)
  }

  // Sync query/results/selectedIndex when modal opens or initialQuery changes (during render to avoid extra pass)
  if (!isOpen) {
    prevOpenKeyRef.current = null
  } else {
    const openKey = initialQuery ?? ''
    if (prevOpenKeyRef.current !== openKey) {
      prevOpenKeyRef.current = openKey
      setQuery(initialQuery ?? '')
      setResults([])
      setSelectedIndex(0)
    }
  }

  // Close on Escape
  useHotkey('escape', () => {
    if (isOpen) {
      onClose()
    }
  }, { enabled: isOpen, enableOnFormTags: true })

  // Focus input when modal opens (DOM-only; state sync is done during render above)
  useEffect(() => {
    if (isOpen) {
      inputRef.current?.focus()
    }
  }, [isOpen])

  // Prevent body scroll when modal is open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden'
    } else {
      document.body.style.overflow = ''
    }
    return () => {
      document.body.style.overflow = ''
    }
  }, [isOpen])

  // Search when query changes (with ignore flag to avoid race conditions)
  useEffect(() => {
    if (query.length >= 1) {
      let ignore = false
      const timeoutId = setTimeout(() => {
        void (async () => {
          try {
            setLoading(true)
            const response = await api.get('/search', { params: { q: query, type: 'all' } })
            if (!ignore) {
              setResults(response.data.results || [])
            }
          } catch (error) {
            if (!ignore) {
              console.error('Search failed:', error)
              setResults([])
            }
          } finally {
            if (!ignore) {
              setLoading(false)
            }
          }
        })()
      }, 300)

      return () => {
        ignore = true
        clearTimeout(timeoutId)
      }
    } else {
      setResults([])
      setSelectedIndex(0)
    }
  }, [query])

  // Scroll selected item into view
  useEffect(() => {
    const el = resultsRef.current?.querySelector(`[data-result-index="${selectedIndex}"]`) as HTMLElement | null
    if (el) {
      el.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
    }
  }, [selectedIndex, results.length])

  const handleSelect = (result: SearchResult) => {
    navigate(result.url)
    setQuery('')
    setResults([])
    onClose()
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      ignoreMouseEnterRef.current = true
      setSelectedIndex(prev => (prev < results.length - 1 ? prev + 1 : prev))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      ignoreMouseEnterRef.current = true
      setSelectedIndex(prev => (prev > 0 ? prev - 1 : 0))
    } else if (e.key === 'Enter' && results.length > 0) {
      e.preventDefault()
      const selected = results[selectedIndex]
      handleSelect(selected)
    } else if (e.key === 'Escape') {
      e.preventDefault()
      onClose()
    }
  }

  // Group results by type
  const groupedResults = results.reduce((acc, result) => {
    (acc[result.type] ??= []).push(result)
    return acc
  }, {} as Record<string, SearchResult[]>)

  const getTypeLabel = (type: string) => {
    const labels: Record<string, string> = {
      specimen: 'Specimens',
      container: 'Containers',
      study: 'Studies',
      subject: 'Subjects',
      location: 'Locations',
      control_batch: 'Control Batches',
    }
    return labels[type] || type
  }

  const getTypeColor = (type: string) => {
    const colors: Record<string, string> = {
      specimen: 'bg-green-100 text-green-800',
      container: 'bg-blue-100 text-blue-800',
      study: 'bg-purple-100 text-purple-800',
      subject: 'bg-yellow-100 text-yellow-800',
      location: 'bg-indigo-100 text-indigo-800',
      control_batch: 'bg-pink-100 text-pink-800',
    }
    return colors[type] || 'bg-gray-100 text-gray-800'
  }

  if (!isOpen) return null

  return (
    <ModalPortal>
      <div className="palette-overlay">
        <div
          className="palette-overlay__backdrop"
          onClick={onClose}
          aria-hidden
        />
      <div className="palette-panel sm:my-8 sm:max-w-3xl">
        <div className="palette-panel__inner">
          <div className="palette-input-wrap">
            <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Search by barcode, ID, study code, subject name, location..."
              className="palette-input"
              autoFocus
              aria-label="Search"
            />
            {loading && <div className="palette-input-spinner" aria-hidden />}
          </div>

          <div
            ref={resultsRef}
            className="palette-results"
            onMouseMove={() => { ignoreMouseEnterRef.current = false }}
          >
            {query.length >= 1 && !loading && results.length === 0 && (
              <div className="palette-empty">
                <p>No results found</p>
                <p>Try a different search term</p>
              </div>
            )}

            {query.length === 0 && (
              <div className="palette-empty">
                <p>Start typing to search...</p>
                <p>Search across specimens, containers, studies, subjects, locations, and more</p>
              </div>
            )}

            {results.length > 0 && (
              <div className="space-y-4">
                {Object.entries(groupedResults).map(([type, typeResults]) => (
                  <div key={type}>
                    <h4 className="palette-group-title">
                      {getTypeLabel(type)}
                    </h4>
                    <div className="palette-list">
                      {typeResults.map((result, index) => {
                        let flatIndex = 0
                        for (const [t, rs] of Object.entries(groupedResults)) {
                          if (t === type) {
                            flatIndex += index
                            break
                          }
                          flatIndex += rs.length
                        }
                        const isSelected = flatIndex === selectedIndex

                        return (
                          <button
                            key={`${result.type}-${result.id}-${index}`}
                            type="button"
                            data-result-index={flatIndex}
                            onClick={() => handleSelect(result)}
                            onMouseEnter={() => {
                              if (ignoreMouseEnterRef.current) return
                              setSelectedIndex(flatIndex)
                            }}
                            className={`palette-item ${isSelected ? 'palette-item--selected' : ''}`}
                          >
                            <div className="flex items-center justify-between gap-2">
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2 flex-wrap">
                                  <span className={`palette-item__type-badge ${getTypeColor(result.type)}`}>
                                    {result.type}
                                  </span>
                                  <p className="palette-item__title truncate">{result.title}</p>
                                </div>
                                <p className="palette-item__subtitle truncate">{result.subtitle}</p>
                              </div>
                              <svg className="h-5 w-5 flex-shrink-0 opacity-60" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                              </svg>
                            </div>
                          </button>
                        )
                      })}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="palette-footer">
            <div className="palette-footer__hints">
              <div className="palette-footer__hint">
                <kbd className="palette-kbd">↑↓</kbd>
                <span>Navigate</span>
              </div>
              <div className="palette-footer__hint">
                <kbd className="palette-kbd">Enter</kbd>
                <span>Select</span>
              </div>
              <div className="palette-footer__hint">
                <kbd className="palette-kbd">Esc</kbd>
                <span>Close</span>
              </div>
            </div>
            {results.length > 0 && (
              <span className="text-xs">
                {results.length} {results.length === 1 ? 'result' : 'results'}
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
    </ModalPortal>
  )
}

