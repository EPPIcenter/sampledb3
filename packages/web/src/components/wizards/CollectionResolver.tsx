import { useState, useCallback, useEffect } from 'react'
import { collectionsApi } from '../../lib/api'
import LocationPicker from '../LocationPicker'

export type CollectionType = 'box' | 'bag' | 'micronix_plate' | 'cryovial_box'

export type CollectionResolveResult =
  | { kind: 'existing'; collectionId: number; name: string; locationName?: string }
  | { kind: 'create'; name: string; type: CollectionType; locationId: number }

interface CollectionResolverProps {
  /** Default collection name (e.g. from filename). */
  defaultName?: string
  /** Default collection type. */
  defaultType?: CollectionType
  /** Current resolved value (controlled). */
  value?: CollectionResolveResult | null
  /** Called when resolution completes or is cleared. */
  onChange: (value: CollectionResolveResult | null) => void
  disabled?: boolean
  /** Label prefix for a11y (e.g. "File A collection"). */
  labelPrefix?: string
}

const COLLECTION_TYPES: { value: CollectionType; label: string }[] = [
  { value: 'box', label: 'Box' },
  { value: 'bag', label: 'Bag' },
  { value: 'micronix_plate', label: 'Micronix Plate' },
  { value: 'cryovial_box', label: 'Cryovial Box' },
]

export default function CollectionResolver({
  defaultName = '',
  defaultType = 'box',
  value = null,
  onChange,
  disabled = false,
  labelPrefix = 'Collection',
}: CollectionResolverProps) {
  const [name, setName] = useState(defaultName)
  const [type, setType] = useState<CollectionType>(defaultType)
  const [resolving, setResolving] = useState(false)

  useEffect(() => {
    setName(defaultName)
    setType(defaultType)
  }, [defaultName, defaultType])
  const [resolveError, setResolveError] = useState<string | null>(null)
  const [createLocationId, setCreateLocationId] = useState<number | null>(null)
  const [lastResolvedFound, setLastResolvedFound] = useState<boolean | null>(null)

  const clearResult = useCallback(() => {
    onChange(null)
    setLastResolvedFound(null)
    setResolveError(null)
    setCreateLocationId(null)
  }, [onChange])

  const handleNameOrTypeChange = useCallback(
    (updates: { name?: string; type?: CollectionType }) => {
      if (updates.name !== undefined) setName(updates.name)
      if (updates.type !== undefined) setType(updates.type)
      clearResult()
    },
    [clearResult]
  )

  const handleResolve = useCallback(async () => {
    const trimmed = name.trim()
    if (!trimmed) {
      setResolveError('Enter a collection name.')
      return
    }
    setResolving(true)
    setResolveError(null)
    try {
      const res = await collectionsApi.resolve({ name: trimmed, type })
      const data = res.data as { found: boolean; id?: number; name?: string; type?: string; locationId?: number; locationName?: string }
      setLastResolvedFound(data.found)
      if (data.found && data.id != null) {
        onChange({
          kind: 'existing',
          collectionId: data.id,
          name: data.name ?? trimmed,
          locationName: data.locationName,
        })
      } else {
        onChange(null)
        setCreateLocationId(null)
      }
    } catch (e) {
      setResolveError(e instanceof Error ? e.message : 'Failed to check collection.')
      onChange(null)
    } finally {
      setResolving(false)
    }
  }, [name, type, onChange])

  const handleLocationChange = useCallback(
    (locationId: number | null) => {
      setCreateLocationId(locationId)
      if (locationId != null && lastResolvedFound === false) {
        onChange({
          kind: 'create',
          name: name.trim(),
          type,
          locationId,
        })
      } else if (locationId == null) {
        onChange(null)
      }
    },
    [lastResolvedFound, name, type, onChange]
  )

  const isResolvedExisting = value?.kind === 'existing'
  const isResolvedCreate = value?.kind === 'create'

  return (
    <div className="space-y-3 rounded-lg border border-gray-200 bg-gray-50/50 p-4">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div>
          <label htmlFor="collection-resolver-name" className="blood-controls-filter-label block mb-1">
            {labelPrefix} name
          </label>
          <input
            id="collection-resolver-name"
            type="text"
            value={name}
            onChange={(e) => handleNameOrTypeChange({ name: e.target.value })}
            onBlur={() => {}}
            disabled={disabled}
            placeholder="e.g. Box A or filename"
            className="block w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
          />
        </div>
        <div>
          <label htmlFor="collection-resolver-type" className="blood-controls-filter-label block mb-1">
            Collection type
          </label>
          <select
            id="collection-resolver-type"
            value={type}
            onChange={(e) => handleNameOrTypeChange({ type: e.target.value as CollectionType })}
            disabled={disabled}
            className="block w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
          >
            {COLLECTION_TYPES.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={handleResolve}
          disabled={disabled || !name.trim() || resolving}
          className="px-3 py-1.5 text-sm bg-teal-600 text-white rounded-lg hover:bg-teal-700 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {resolving ? 'Checking…' : 'Check existing'}
        </button>
        {value && (
          <button
            type="button"
            onClick={clearResult}
            disabled={disabled}
            className="px-3 py-1.5 text-sm border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50"
          >
            Change
          </button>
        )}
      </div>

      {resolveError && (
        <p className="text-sm text-red-600" role="alert">
          {resolveError}
        </p>
      )}

      {isResolvedExisting && (
        <div className="bg-green-50 border border-green-200 rounded p-2">
          <p className="text-sm text-green-800">
            Existing: <strong>{value.name}</strong>
            {value.locationName ? ` at ${value.locationName}` : ''}
          </p>
        </div>
      )}

      {lastResolvedFound === false && !isResolvedExisting && (
        <div className="space-y-2">
          <p className="text-sm text-amber-800">Create new collection</p>
          <div>
            <label className="blood-controls-filter-label block mb-1">Location</label>
            <LocationPicker
              value={createLocationId}
              onChange={handleLocationChange}
              filterCollectionsOnly
              disabled={disabled}
            />
          </div>
          {isResolvedCreate && (
            <p className="text-xs text-green-700">Will create &quot;{value.name}&quot; at selected location.</p>
          )}
        </div>
      )}
    </div>
  )
}
