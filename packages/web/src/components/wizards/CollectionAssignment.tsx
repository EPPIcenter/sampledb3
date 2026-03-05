import LocationPicker from '../LocationPicker'
import CollectionNameSearch from './CollectionNameSearch'

export interface CollectionAssignmentChange {
  collectionType?: 'box' | 'bag' | 'micronix_plate' | 'cryovial_box'
  collectionName?: string
  collectionLocationId?: number | null
}

interface CollectionAssignmentProps {
  containerType: 'paper' | 'cryovial_tube' | 'micronix_tube'
  collectionType: 'box' | 'bag' | 'micronix_plate' | 'cryovial_box'
  collectionName: string
  collectionLocationId: number | null
  collectionId?: number
  onChange: (updates: CollectionAssignmentChange) => void
  /** Optional: when true, hide Collection Type selector (used for non-paper) */
  showCollectionTypeSelector?: boolean
  /** Optional: 'sheet' for DBS sheets (default), 'collection' for other container types */
  successMessageVariant?: 'sheet' | 'collection'
  /** Optional: list of collection names for the current type; when provided, name field becomes a search combobox */
  collectionNames?: string[]
}

function getCollectionLabel(
  containerType: string,
  collectionType?: string
): string {
  if (containerType === 'cryovial_tube') return 'Cryovial Box Name'
  if (containerType === 'micronix_tube') return 'Plate Name'
  if (containerType === 'paper') {
    return collectionType === 'bag' ? 'Bag Name' : 'Box Name'
  }
  return 'Collection Name'
}

function getCollectionPlaceholder(
  containerType: string,
  collectionType?: string
): string {
  if (containerType === 'cryovial_tube') return 'Enter cryovial box name'
  if (containerType === 'micronix_tube') return 'Enter plate name'
  if (containerType === 'paper') {
    return collectionType === 'bag' ? 'Enter bag name' : 'Enter box name'
  }
  return 'Enter collection name'
}

export default function CollectionAssignment({
  containerType,
  collectionType,
  collectionName,
  collectionLocationId,
  collectionId,
  onChange,
  showCollectionTypeSelector = true,
  successMessageVariant = 'sheet',
  collectionNames,
}: CollectionAssignmentProps) {
  const needsBoxOrBag = containerType === 'paper'
  const label = getCollectionLabel(containerType, collectionType)
  const placeholder = getCollectionPlaceholder(containerType, collectionType)
  const existingCollectionLabel =
    collectionType === 'bag'
      ? 'bag'
      : collectionType === 'box'
        ? 'box'
        : collectionType === 'micronix_plate'
          ? 'plate'
          : 'cryovial box'

  return (
    <div className="space-y-4">
      {needsBoxOrBag && showCollectionTypeSelector && (
        <div>
          <label
            htmlFor="collection-type-select"
            className="blood-controls-filter-label block mb-1"
          >
            Collection Type
          </label>
          <select
            id="collection-type-select"
            aria-label="Collection Type"
            value={collectionType === 'bag' ? 'bag' : 'box'}
            onChange={(e) => {
              const type = e.target.value === 'bag' ? 'bag' : 'box'
              onChange({ collectionType: type })
            }}
            className="block w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
          >
            <option value="box">Box</option>
            <option value="bag">Bag</option>
          </select>
        </div>
      )}

      {collectionId && collectionName && (
        <div className="flex items-center justify-between gap-2 bg-green-50 border border-green-200 rounded p-2 mb-2">
          <p className="text-xs text-green-800">
            {successMessageVariant === 'sheet'
              ? `✓ Sheet will be placed in: ${collectionName}`
              : `✓ Assigned to collection: ${collectionName}`}
          </p>
          <button
            type="button"
            onClick={() =>
              onChange({ collectionName: '', collectionLocationId: null })
            }
            className="text-xs text-green-700 underline hover:no-underline shrink-0"
          >
            Clear
          </button>
        </div>
      )}
      <div>
        {collectionNames != null ? (
          <CollectionNameSearch
            id="collection-name-input"
            label={label}
            value={collectionName}
            onChange={(name) => onChange({ collectionName: name })}
            options={collectionNames}
            placeholder={placeholder}
          />
        ) : (
          <>
            <label
              htmlFor="collection-name-input"
              className="blood-controls-filter-label block mb-1"
            >
              {label}
            </label>
            <input
              id="collection-name-input"
              type="text"
              value={collectionName}
              onChange={(e) => onChange({ collectionName: e.target.value })}
              placeholder={placeholder}
              className="block w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
            />
          </>
        )}
      </div>

      <div>
        <label className="blood-controls-filter-label block mb-1">
          Location
        </label>
        <LocationPicker
          value={collectionLocationId}
          onChange={(locationId) =>
            onChange({ collectionLocationId: locationId ?? null })
          }
          filterCollectionsOnly
          disabled={!!collectionId}
        />
        {collectionId && (
          <p className="text-xs text-gray-500 mt-1">
            Location from existing {existingCollectionLabel}
          </p>
        )}
      </div>
    </div>
  )
}
