import { useState, useEffect, useCallback, useRef } from 'react'
import api, { type SearchResult, type CollectionSearchResult } from '../lib/api'

export type CollectionType = 'micronix_plate' | 'cryovial_box' | 'box' | 'bag'

interface Collection {
  id: number
  name: string
  barcode?: string
  locationId?: number
  locationPath?: string
}

interface CollectionPickerProps {
  collectionType: CollectionType
  value?: string // Collection name or barcode
  onChange: (nameOrBarcode: string) => void
  allowCreate?: boolean
  onCreateClick?: () => void
}

export default function CollectionPicker({
  collectionType,
  value,
  onChange,
  allowCreate = false,
  onCreateClick,
}: CollectionPickerProps) {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState(value || '')
  const [loading, setLoading] = useState(false)
  const [collections, setCollections] = useState<Collection[]>([])
  const [error, setError] = useState<string | null>(null)
  const [validatedCollection, setValidatedCollection] = useState<Collection | null>(null)
  const debounceTimeoutRef = useRef<number | null>(null)
  const isSearchingRef = useRef(false)
  const containerRef = useRef<HTMLDivElement>(null)
  const prevValueRef = useRef<string | undefined>(value)

  // Sync search state when value prop changes (during render to avoid extra pass)
  const currentValue = value || ''
  if (currentValue !== prevValueRef.current) {
    prevValueRef.current = currentValue
    setSearch(currentValue)
    setValidatedCollection((prev) => {
      if (!prev) return null
      if (prev.name === currentValue || prev.barcode === currentValue) return prev
      return null
    })
  }

  // Consolidated search effect with proper debouncing and ignore flag for race conditions
  useEffect(() => {
    let ignore = false

    // Clear any pending debounce
    if (debounceTimeoutRef.current) {
      clearTimeout(debounceTimeoutRef.current)
    }

    // If search is empty, clear results and validation
    if (search.length === 0) {
      setCollections([])
      setValidatedCollection(null)
      setError(null)
      if (open) {
        setOpen(false)
      }
      return () => {
        ignore = true
        if (debounceTimeoutRef.current) {
          clearTimeout(debounceTimeoutRef.current)
        }
      }
    }

    // Debounce search requests
    debounceTimeoutRef.current = window.setTimeout(async () => {
      // Prevent concurrent searches
      if (isSearchingRef.current) {
        return
      }

      try {
        isSearchingRef.current = true
        setLoading(true)
        setError(null)

        // Use global search API to find collections
        const response = await api.get('/search', {
          params: {
            q: search,
            type: collectionType === 'micronix_plate' ? 'micronix_plate' : collectionType === 'cryovial_box' ? 'cryovial_box' : undefined
          },
        })

        if (ignore) return

        // Filter results by type and extract collection info
        const results = (response.data.results || []).filter((r: SearchResult): r is CollectionSearchResult => {
          if (collectionType === 'micronix_plate') {
            return r.type === 'micronix_plate'
          } else if (collectionType === 'cryovial_box') {
            return r.type === 'cryovial_box' || r.type === 'box'
          }
          return false
        })

        // Transform results to Collection format
        const transformed: Collection[] = results.map((r: CollectionSearchResult) => ({
          id: r.id,
          name: r.title || r.name || '',
          barcode: r.barcode || undefined,
          locationId: r.locationId || undefined,
          locationPath: r.locationPath || undefined,
        }))

        setCollections(transformed)

        // Check if current search value exactly matches a collection
        const exactMatch = transformed.find(
          (c) => c.name.toLowerCase() === search.toLowerCase() || c.barcode?.toLowerCase() === search.toLowerCase()
        )

        if (exactMatch) {
          setValidatedCollection(exactMatch)
          if (exactMatch.name !== search) {
            onChange(exactMatch.name)
          }
          setOpen(false)
        } else {
          setValidatedCollection(null)
          if (transformed.length > 0 || open) {
            setOpen(true)
          }
        }
      } catch (error: unknown) {
        if (!ignore) {
          console.error('Failed to search collections:', error)
          setError('Failed to search collections')
          setCollections([])
          setValidatedCollection(null)
        }
      } finally {
        if (!ignore) {
          setLoading(false)
        }
        isSearchingRef.current = false
      }
    }, 300)

    return () => {
      ignore = true
      if (debounceTimeoutRef.current) {
        clearTimeout(debounceTimeoutRef.current)
      }
    }
  }, [search, collectionType, onChange, open])

  const handleSelect = useCallback((collection: Collection) => {
    // Update search state to match the selected collection
    setSearch(collection.name)
    // Use name as identifier (could also use barcode if available)
    onChange(collection.name)
    setValidatedCollection(collection)
    setOpen(false)
  }, [onChange])

  const displayValue = value || ''
  const isValid = validatedCollection !== null && (validatedCollection.name.toLowerCase() === value?.toLowerCase() || validatedCollection.barcode?.toLowerCase() === value?.toLowerCase())

  // Handle clicks outside to close dropdown
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node
      // Close dropdown if clicking outside the component
      if (open && containerRef.current && !containerRef.current.contains(target)) {
        setOpen(false)
      }
    }

    if (open) {
      document.addEventListener('mousedown', handleClickOutside)
      return () => document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [open])

  return (
    <div ref={containerRef} className="relative">
      <div className="flex gap-2 items-center">
        <div className="flex-1 relative">
          <input
            type="text"
            value={displayValue}
            onChange={(e) => {
              const newValue = e.target.value
              setSearch(newValue)
              onChange(newValue)
              // Clear validation when user types
              if (validatedCollection) {
                setValidatedCollection(null)
              }
              // Open dropdown when user starts typing
              if (newValue.length > 0 && !isValid) {
                setOpen(true)
              }
            }}
            onFocus={() => {
              // Open dropdown if there are results or if user has typed something
              if (search.length > 0 && !isValid) {
                setOpen(true)
              }
            }}
            placeholder={`Enter ${collectionType === 'micronix_plate' ? 'plate' : collectionType === 'cryovial_box' ? 'box' : 'collection'} name or barcode`}
            className={`flex-1 form-input ${isValid ? 'border-green-500 pr-8' : ''}`}
          />
          {isValid && (
            <div className="absolute right-2 top-1/2 -translate-y-1/2 text-green-500 pointer-events-none">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            </div>
          )}
        </div>
        {allowCreate && onCreateClick && (
          <button
            type="button"
            onClick={onCreateClick}
            className="px-3 py-2 text-sm border border-gray-100 rounded-md hover:bg-gray-50 text-gray-700"
          >
            Create New
          </button>
        )}
      </div>

      {open && !isValid && (
        <div className="absolute z-[100] mt-1 w-full">
          <div className="bg-white border border-gray-200 rounded-md shadow-lg max-h-60 overflow-y-auto">
            {loading ? (
              <div className="p-4 text-sm text-gray-500">Searching...</div>
            ) : error ? (
              <div className="p-4 text-sm text-red-600">{error}</div>
            ) : collections.length === 0 && search.length > 0 ? (
              <div className="p-4 text-sm text-gray-500">
                No collections found. {allowCreate && 'Click "Create New" to create one.'}
              </div>
            ) : collections.length > 0 ? (
              <ul className="divide-y divide-gray-200">
                {collections.map((collection) => (
                  <li key={collection.id}>
                    <button
                      type="button"
                      className="w-full px-4 py-3 text-left hover:bg-blue-50 focus:outline-none focus:bg-blue-50 active:bg-blue-100 transition-colors cursor-pointer"
                      onMouseDown={(e) => {
                        // Prevent input from losing focus and handle selection
                        e.preventDefault()
                        e.stopPropagation()
                        handleSelect(collection)
                      }}
                    >
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-sm font-medium text-gray-900">{collection.name}</p>
                          {collection.barcode && (
                            <p className="text-xs text-gray-500">Barcode: {collection.barcode}</p>
                          )}
                          {collection.locationPath && (
                            <p className="text-xs text-gray-500">{collection.locationPath}</p>
                          )}
                        </div>
                      </div>
                    </button>
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
        </div>
      )}
      
      {isValid && (
        <div className="mt-1 text-xs text-green-600 flex items-center gap-1">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
          <span>
            {validatedCollection!.locationPath
              ? `Found: ${validatedCollection!.name} at ${validatedCollection!.locationPath}`
              : `Found: ${validatedCollection!.name}`}
          </span>
        </div>
      )}
    </div>
  )
}

