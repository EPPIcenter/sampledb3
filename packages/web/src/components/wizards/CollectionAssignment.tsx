import LocationPicker from '../LocationPicker'
import CollectionSelectOrCreate, {
  type CollectionOption,
  type CollectionSelectValue,
} from '../CollectionSelectOrCreate'

export interface CollectionAssignmentChange {
  collectionType?: 'box' | 'bag' | 'micronix_plate' | 'cryovial_box'
  collectionName?: string
  collectionLocationId?: number | null
  collectionId?: number
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
  /** Optional: list of collections for the current type (id, name, locationPath); when provided, uses unified combobox with create */
  collectionOptions?: CollectionOption[]
  /** Optional: when true, show "Create new collection" and allow creating via modal */
  allowCreateCollection?: boolean
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
  collectionOptions,
  allowCreateCollection = false,
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

  const selectValue: CollectionSelectValue | null =
    collectionId != null && collectionName
      ? {
          id: collectionId,
          name: collectionName,
          locationPath:
            collectionOptions?.find((c) => c.id === collectionId)?.locationPath ??
            undefined,
        }
      : collectionName
        ? { name: collectionName, id: undefined, locationPath: undefined }
        : null

  const handleSelectChange = (v: CollectionSelectValue | null) => {
    if (v == null) {
      onChange({ collectionName: '', collectionLocationId: null, collectionId: undefined })
      return
    }
    if (v.id != null) {
      onChange({
        collectionId: v.id,
        collectionName: v.name,
        collectionLocationId: undefined,
      })
      return
    }
    onChange({ collectionName: v.name, collectionId: undefined })
  }

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
            className="block w-full px-3 py-2 border border-app-border rounded-lg text-sm bg-app-card text-app-text"
          >
            <option value="box">Box</option>
            <option value="bag">Bag</option>
          </select>
        </div>
      )}

      <div>
        {collectionOptions != null ? (
          <CollectionSelectOrCreate
            id="collection-name-input"
            collectionType={collectionType}
            collections={collectionOptions}
            value={selectValue}
            onChange={handleSelectChange}
            allowCreate={allowCreateCollection}
            label={label}
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
              className="block w-full px-3 py-2 border border-app-border rounded-lg text-sm bg-app-card text-app-text"
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
          <p className="text-xs text-app-text-muted mt-1">
            Location from existing {existingCollectionLabel}
          </p>
        )}
      </div>
    </div>
  )
}
