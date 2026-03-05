import PapersSection from './PapersSection'
import CollectionAssignment from './CollectionAssignment'
import type { ContainerConfig } from '../../pages/ControlBatchWizard'
import type { CollectionAssignmentChange } from './CollectionAssignment'

interface SheetCardProps {
  sheetId: string
  containers: ContainerConfig[]
  specimenTypeId: string
  onUpdateSheetName: (name: string) => void
  onUpdateContainer: (specimenTypeId: string, containerId: string, updates: Partial<ContainerConfig>) => void
  onRemoveSheet: () => void
  onAddPaper: () => void
  onRemoveContainer: (specimenTypeId: string, containerId: string) => void
  onCollectionChange: (updates: CollectionAssignmentChange) => void
  existingCollections: {
    boxes: Map<string, { id: number; locationId: number }>
    bags: Map<string, { id: number; locationId: number }>
  }
  /** Names for box and bag (for collection name search). */
  collectionNames?: { box: string[]; bag: string[] }
}

export default function SheetCard({
  sheetId,
  containers,
  specimenTypeId,
  onUpdateSheetName,
  onUpdateContainer,
  onRemoveSheet,
  onAddPaper,
  onRemoveContainer,
  onCollectionChange,
  collectionNames,
}: SheetCardProps) {
  const first = containers[0]
  const sheetName = first?.sheetName ?? ''
  const currentCollectionType = (first?.collectionType as 'box' | 'bag') ?? 'box'
  const namesForType = collectionNames ? collectionNames[currentCollectionType] : undefined

  return (
    <div className="space-y-4 pt-4 border-t border-gray-200 first:pt-0 first:border-t-0">
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1">
          <label
            htmlFor={`sheet-name-${sheetId}`}
            className="blood-controls-filter-label block mb-1"
          >
            Sheet Name *
          </label>
          <input
            id={`sheet-name-${sheetId}`}
            type="text"
            value={sheetName}
            onChange={(e) => onUpdateSheetName(e.target.value)}
            placeholder="Enter sheet name"
            className="block w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
          />
        </div>
        <button
          type="button"
          onClick={onRemoveSheet}
          className="blood-controls-btn-danger px-3 py-1.5 text-sm shrink-0"
          title="Remove this sheet and all its papers"
        >
          Remove Sheet
        </button>
      </div>

      <PapersSection
        containers={containers}
        specimenTypeId={specimenTypeId}
        onUpdate={onUpdateContainer}
        onAdd={onAddPaper}
        onRemove={onRemoveContainer}
      />

      <div>
        <h5 className="blood-controls-filter-label block mb-2">Place Sheet in:</h5>
        <CollectionAssignment
          containerType="paper"
          collectionType={currentCollectionType}
          collectionName={first?.collectionName ?? ''}
          collectionLocationId={first?.collectionLocationId ?? null}
          collectionId={first?.collectionId}
          onChange={onCollectionChange}
          showCollectionTypeSelector={true}
          successMessageVariant="sheet"
          collectionNames={namesForType}
        />
      </div>
    </div>
  )
}
