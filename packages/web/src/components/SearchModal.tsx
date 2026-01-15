import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import api, { type SearchResult } from '../lib/api'
import { useHotkey } from '../hooks/useHotkey'

interface SearchModalProps {
  isOpen: boolean
  onClose: () => void
}

export default function SearchModal({ isOpen, onClose }: SearchModalProps) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<SearchResult[]>([])
  const [loading, setLoading] = useState(false)
  const [selectedIndex, setSelectedIndex] = useState(0)
  const navigate = useNavigate()
  const inputRef = useRef<HTMLInputElement>(null)
  const resultsRef = useRef<HTMLDivElement>(null)

  // Close on Escape
  useHotkey('escape', () => {
    if (isOpen) {
      onClose()
    }
  }, { enabled: isOpen, enableOnFormTags: true })

  // Focus input when modal opens
  useEffect(() => {
    if (isOpen) {
      inputRef.current?.focus()
      setQuery('')
      setResults([])
      setSelectedIndex(0)
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

  // Search when query changes
  useEffect(() => {
    if (query.length >= 1) {
      const timeoutId = setTimeout(() => {
        performSearch(query)
      }, 300) // Debounce 300ms

      return () => clearTimeout(timeoutId)
    } else {
      setResults([])
      setSelectedIndex(0)
    }
  }, [query])

  // Reset selection when results change
  useEffect(() => {
    setSelectedIndex(0)
  }, [results])

  // Scroll selected item into view
  useEffect(() => {
    if (resultsRef.current && results.length > 0) {
      const selectedElement = resultsRef.current.querySelector(
        `[data-result-index="${selectedIndex}"]`
      ) as HTMLElement
      if (selectedElement) {
        selectedElement.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
      }
    }
  }, [selectedIndex, results.length])

  const performSearch = async (searchQuery: string) => {
    try {
      setLoading(true)
      // Search all types
      const response = await api.get('/search', { params: { q: searchQuery, type: 'all' } })
      setResults(response.data.results || [])
    } catch (error) {
      console.error('Search failed:', error)
      setResults([])
    } finally {
      setLoading(false)
    }
  }

  const handleSelect = (result: SearchResult) => {
    navigate(result.url)
    setQuery('')
    setResults([])
    onClose()
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setSelectedIndex(prev => (prev < results.length - 1 ? prev + 1 : prev))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setSelectedIndex(prev => (prev > 0 ? prev - 1 : 0))
    } else if (e.key === 'Enter' && results.length > 0) {
      e.preventDefault()
      handleSelect(results[selectedIndex])
    } else if (e.key === 'Escape') {
      e.preventDefault()
      onClose()
    }
  }

  // Group results by type
  const groupedResults = results.reduce((acc, result) => {
    if (!acc[result.type]) {
      acc[result.type] = []
    }
    acc[result.type].push(result)
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
    <div className="fixed inset-0 z-[100] overflow-y-auto">
      <div className="flex items-center justify-center min-h-screen px-4 pt-4 pb-20 text-center sm:block sm:p-0">
        {/* Background overlay */}
        <div
          className="fixed inset-0 transition-opacity bg-gray-900/40 backdrop-blur-md"
          onClick={onClose}
        />

        {/* Modal panel */}
        <div className="relative z-10 inline-block align-bottom bg-white rounded-lg text-left overflow-hidden shadow-xl transform transition-all sm:my-8 sm:align-middle sm:max-w-3xl sm:w-full">
          <div className="bg-white px-4 pt-5 pb-4 sm:p-6 sm:pb-4">
            {/* Search input */}
            <div className="mb-4 relative">
              <input
                ref={inputRef}
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Search by barcode, ID, study code, subject name, location..."
                className="w-full form-input pl-10 h-12 text-lg"
                autoFocus
              />
              <svg
                className="absolute left-3 top-3 h-6 w-6 text-gray-400"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
                />
              </svg>
              {loading && (
                <div className="absolute right-3 top-3">
                  <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600"></div>
                </div>
              )}
            </div>

            {/* Results */}
            <div
              ref={resultsRef}
              className="max-h-[60vh] overflow-y-auto"
            >
              {query.length >= 1 && !loading && results.length === 0 && (
                <div className="py-8 text-center text-gray-500">
                  <p>No results found</p>
                  <p className="text-sm mt-2">Try a different search term</p>
                </div>
              )}

              {query.length === 0 && (
                <div className="py-8 text-center text-gray-500">
                  <p>Start typing to search...</p>
                  <p className="text-sm mt-2">Search across specimens, containers, studies, subjects, locations, and more</p>
                </div>
              )}

              {results.length > 0 && (
                <div className="space-y-4">
                  {Object.entries(groupedResults).map(([type, typeResults]) => (
                    <div key={type}>
                      <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2 px-2">
                        {getTypeLabel(type)}
                      </h4>
                      <div className="space-y-1">
                        {typeResults.map((result, index) => {
                          // Calculate flat index across all results
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
                              data-result-index={flatIndex}
                              onClick={() => handleSelect(result)}
                              onMouseEnter={() => setSelectedIndex(flatIndex)}
                              className={`w-full text-left px-4 py-3 rounded-lg transition-colors ${
                                isSelected
                                  ? 'bg-blue-50 border-2 border-blue-500'
                                  : 'bg-white border-2 border-transparent hover:bg-gray-50'
                              }`}
                            >
                              <div className="flex items-center justify-between">
                                <div className="flex-1">
                                  <div className="flex items-center space-x-2">
                                    <span className={`px-2 py-0.5 text-xs font-medium rounded ${getTypeColor(result.type)}`}>
                                      {result.type}
                                    </span>
                                    <p className="font-medium text-gray-900">{result.title}</p>
                                  </div>
                                  <p className="text-sm text-gray-500 mt-1">{result.subtitle}</p>
                                </div>
                                <svg
                                  className="h-5 w-5 text-gray-400"
                                  fill="none"
                                  stroke="currentColor"
                                  viewBox="0 0 24 24"
                                >
                                  <path
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                    strokeWidth={2}
                                    d="M9 5l7 7-7 7"
                                  />
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

            {/* Footer */}
            <div className="mt-4 pt-4 border-t border-gray-200 flex items-center justify-between text-sm text-gray-500">
              <div className="flex items-center space-x-4">
                <div className="flex items-center space-x-1">
                  <kbd className="px-1.5 py-0.5 text-xs font-semibold text-gray-800 bg-gray-100 border border-gray-300 rounded">
                    ↑↓
                  </kbd>
                  <span>Navigate</span>
                </div>
                <div className="flex items-center space-x-1">
                  <kbd className="px-1.5 py-0.5 text-xs font-semibold text-gray-800 bg-gray-100 border border-gray-300 rounded">
                    Enter
                  </kbd>
                  <span>Select</span>
                </div>
                <div className="flex items-center space-x-1">
                  <kbd className="px-1.5 py-0.5 text-xs font-semibold text-gray-800 bg-gray-100 border border-gray-300 rounded">
                    Esc
                  </kbd>
                  <span>Close</span>
                </div>
              </div>
              {results.length > 0 && (
                <div className="text-xs">
                  {results.length} {results.length === 1 ? 'result' : 'results'}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

