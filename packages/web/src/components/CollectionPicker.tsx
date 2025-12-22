import { useState, useEffect } from 'react'
import api from '../lib/api'

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

  useEffect(() => {
    if (open && search.length >= 1) {
      const timeout = setTimeout(() => {
        searchCollections()
      }, 300)
      return () => clearTimeout(timeout)
    } else if (open && search.length === 0) {
      setCollections([])
    }
  }, [open, search])

  const searchCollections = async () => {
    try {
      setLoading(true)
      setError(null)
      
      // Use global search API to find collections
      const response = await api.get('/search', {
        params: { q: search, type: collectionType === 'micronix_plate' ? 'micronix_plate' : collectionType === 'cryovial_box' ? 'cryovial_box' : undefined },
      })
      
      // Filter results by type and extract collection info
      const results = (response.data.results || []).filter((r: any) => {
        if (collectionType === 'micronix_plate') {
          return r.type === 'micronix_plate' || r.type === 'plate'
        } else if (collectionType === 'cryovial_box') {
          return r.type === 'cryovial_box' || r.type === 'box'
        }
        return false
      })
      
      // Transform results to Collection format
      const transformed: Collection[] = results.map((r: any) => ({
        id: r.id,
        name: r.title || r.name || '',
        barcode: r.barcode,
        locationId: r.locationId,
        locationPath: r.locationPath,
      }))
      
      setCollections(transformed)
    } catch (error: any) {
      console.error('Failed to search collections:', error)
      setError('Failed to search collections')
      setCollections([])
    } finally {
      setLoading(false)
    }
  }

  const handleSelect = (collection: Collection) => {
    // Use name as identifier (could also use barcode if available)
    onChange(collection.name)
    setOpen(false)
  }

  const displayValue = value || ''

  return (
    <>
      <div className="flex gap-2">
        <input
          type="text"
          value={displayValue}
          onChange={(e) => {
            setSearch(e.target.value)
            onChange(e.target.value)
          }}
          onFocus={() => setOpen(true)}
          placeholder={`Enter ${collectionType === 'micronix_plate' ? 'plate' : collectionType === 'cryovial_box' ? 'box' : 'collection'} name or barcode`}
          className="flex-1 form-input"
        />
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

      {open && (
        <div className="relative z-50 mt-1">
          <div className="absolute w-full bg-white border border-gray-100 rounded-md shadow-lg max-h-60 overflow-y-auto">
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
                      className="w-full px-4 py-3 text-left hover:bg-gray-50 focus:outline-none focus:bg-gray-50"
                      onClick={() => handleSelect(collection)}
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
    </>
  )
}

