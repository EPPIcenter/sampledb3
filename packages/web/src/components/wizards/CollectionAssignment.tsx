import LocationPicker from '../LocationPicker'

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
  onCreate: () => void
  /** Optional: when true, hide Collection Type selector (used for non-paper) */
  showCollectionTypeSelector?: boolean
  /** Optional: 'sheet' for DBS sheets (default), 'collection' for other container types */
  successMessageVariant?: 'sheet' | 'collection'
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
  onCreate,
  showCollectionTypeSelector = true,
  successMessageVariant = 'sheet',
}: CollectionAssignmentProps) {
  const needsBoxOrBag = containerType === 'paper'
  const label = getCollectionLabel(containerType, collectionType)
  const placeholder = getCollectionPlaceholder(containerType, collectionType)
  const createLabel =
    collectionType === 'bag'
      ? 'Create Bag'
      : collectionType === 'box'
        ? 'Create Box'
        : 'Create Collection'

  const canCreate =
    collectionName.trim() &&
    collectionLocationId !== null &&
    !collectionId &&
    (needsBoxOrBag ? (collectionType === 'box' || collectionType === 'bag') : true)

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

      {collectionId ? (
        <div className="bg-green-50 border border-green-200 rounded p-2">
          <p className="text-xs text-green-800">
            {successMessageVariant === 'sheet'
              ? `✓ Sheet will be placed in: ${collectionName}`
              : `✓ Assigned to collection: ${collectionName}`}
          </p>
        </div>
      ) : (
        <>
          <div>
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
              disabled={!!collectionId && needsBoxOrBag}
            />
            {collectionId && needsBoxOrBag && (
              <p className="text-xs text-gray-500 mt-1">
                Location from existing{' '}
                {collectionType === 'bag' ? 'bag' : 'box'}
              </p>
            )}
          </div>

          {canCreate && (
            <button
              type="button"
              onClick={onCreate}
              className="blood-controls-btn-primary px-4 py-2 text-sm"
            >
              {createLabel}
            </button>
          )}
        </>
      )}
    </div>
  )
}
