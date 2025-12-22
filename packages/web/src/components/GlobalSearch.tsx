import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import api from '../lib/api'

interface SearchResult {
  type: 'specimen' | 'container' | 'study' | 'subject'
  id: number
  title: string
  subtitle: string
  url: string
  data: any
}

export default function GlobalSearch() {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<SearchResult[]>([])
  const [isOpen, setIsOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const navigate = useNavigate()
  const searchRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (searchRef.current && !searchRef.current.contains(event.target as Node)) {
        setIsOpen(false)
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  useEffect(() => {
    if (query.length >= 1) {
      const timeoutId = setTimeout(() => {
        performSearch(query)
      }, 300) // Debounce 300ms

      return () => clearTimeout(timeoutId)
    } else {
      setResults([])
      setIsOpen(false)
    }
  }, [query])

  const performSearch = async (searchQuery: string) => {
    try {
      setLoading(true)
      const response = await api.get('/search', { params: { q: searchQuery } })
      setResults(response.data.results || [])
      setIsOpen(true)
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
    setIsOpen(false)
    inputRef.current?.blur()
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && results.length > 0) {
      handleSelect(results[0])
    } else if (e.key === 'Escape') {
      setIsOpen(false)
      inputRef.current?.blur()
    }
  }

  return (
    <div ref={searchRef} className="relative w-80 flex items-center">
      <div className="relative w-full">
        <label htmlFor="global-search" className="sr-only">
          Global search
        </label>
        <input
          ref={inputRef}
          id="global-search"
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onFocus={() => query.length >= 1 && setIsOpen(true)}
          onKeyDown={handleKeyDown}
          placeholder="Search by barcode, ID, study code, or subject name..."
          className="form-input pl-10 h-9"
          role="combobox"
          aria-autocomplete="list"
          aria-expanded={isOpen}
          aria-controls="global-search-results"
        />
        <svg
          className="absolute left-3 top-2.5 h-5 w-5 text-gray-400"
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
          <div className="absolute right-3 top-2.5">
            <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-blue-600"></div>
          </div>
        )}
        {isOpen && results.length > 0 && (
          <div
            id="global-search-results"
            role="listbox"
            aria-label="Search results"
            className="absolute z-[9999] w-full top-full mt-1 bg-white border border-gray-100 rounded-lg shadow-lg max-h-96 overflow-y-auto"
          >
            {results.map((result, index) => (
              <button
                key={`${result.type}-${result.id}-${index}`}
                onClick={() => handleSelect(result)}
                className="w-full px-4 py-3 text-left hover:bg-gray-50 focus:bg-gray-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 border-b border-gray-100 last:border-b-0"
                role="option"
              >
                <div className="flex items-center justify-between">
                  <div className="flex-1">
                    <div className="flex items-center space-x-2">
                      <span className={`px-2 py-0.5 text-xs font-medium rounded ${
                        result.type === 'specimen' ? 'bg-green-100 text-green-800' :
                        result.type === 'container' ? 'bg-blue-100 text-blue-800' :
                        result.type === 'study' ? 'bg-purple-100 text-purple-800' :
                        'bg-yellow-100 text-yellow-800'
                      }`}>
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
            ))}
          </div>
        )}

        {isOpen && query.length >= 1 && !loading && results.length === 0 && (
          <div className="absolute z-[9999] w-full top-full mt-1 bg-white border border-gray-100 rounded-lg shadow-lg p-4 text-center text-gray-500">
            No results found
          </div>
        )}
      </div>
    </div>
  )
}
