import type { ReactNode } from 'react'
import type { DestinationCollectionKind } from '../CollectionDestinationPicker'

/** User-facing copy for one scan-move page variant. */
export interface ScanMovePageCopy {
  title: string
  bootstrapErrorDetail: string
  createStepNavLabel: string
  createStepTitle: string
  createStepReadyText: string
  createStepPendingText: string
  createStepContinueLabel: string
  resolvedHeading: string
  destinationFieldLabel: string
  newDestinationKindLabel: string
  sourceCollectionsHeading: string
  nextCreateLabel: string
  nextResolveLabel: string
  barcodePlaceholder: string
  unresolvedHelp: string
  unresolvedIdentifierHeader: string
  atomicModeRadioName: string
}

export const MICRONIX_SCAN_MOVE_COPY: ScanMovePageCopy = {
  title: 'Move Micronix Tubes',
  bootstrapErrorDetail: 'Failed to load plates, locations, and scanner configurations',
  createStepNavLabel: 'Create Plates',
  createStepTitle: 'Create Destination Plates',
  createStepReadyText:
    'Destination plates are ready. Continue to resolve tubes, or go back to upload to change your CSV.',
  createStepPendingText:
    'The following destination plates do not exist yet. Assign a storage location for each one before continuing.',
  createStepContinueLabel: 'Create Plates & Continue',
  resolvedHeading: 'Resolved Micronix Tubes',
  destinationFieldLabel: 'Destination Plate:',
  newDestinationKindLabel: 'New micronix plate',
  sourceCollectionsHeading: 'Source Plates Detected:',
  nextCreateLabel: 'Next: Create Destination Plates',
  nextResolveLabel: 'Next: Resolve Containers',
  barcodePlaceholder: 'Enter plate barcode (optional)',
  unresolvedHelp:
    'The following barcodes were not found in the database. Please check for typos or verify the barcodes exist.',
  unresolvedIdentifierHeader: 'Barcode',
  atomicModeRadioName: 'micronix-atomic-mode',
}

export const CRYOVIAL_SCAN_MOVE_COPY: ScanMovePageCopy = {
  title: 'Move Cryovial Tubes',
  bootstrapErrorDetail: 'Failed to load cryovial boxes and locations',
  createStepNavLabel: 'Create Boxes',
  createStepTitle: 'Create Destination Boxes',
  createStepReadyText:
    'Destination boxes are ready. Continue to resolve tubes, or go back to upload to change your CSV.',
  createStepPendingText:
    'The following destination boxes do not exist yet. Assign a storage location for each one before continuing.',
  createStepContinueLabel: 'Create Boxes & Continue',
  resolvedHeading: 'Resolved Cryovial Tubes',
  destinationFieldLabel: 'Destination Box:',
  newDestinationKindLabel: 'New cryovial box',
  sourceCollectionsHeading: 'Source Boxes Detected:',
  nextCreateLabel: 'Next: Create Destination Boxes',
  nextResolveLabel: 'Next: Resolve Containers',
  barcodePlaceholder: 'Enter box barcode (optional)',
  unresolvedHelp:
    'The following positions were not found in the database. Please check for typos or verify the positions exist.',
  unresolvedIdentifierHeader: 'Source Position',
  atomicModeRadioName: 'cryovial-atomic-mode',
}

export interface ScanMovePageShellConfig {
  copy: ScanMovePageCopy
  collectionKind: DestinationCollectionKind
  /** Hide normalized ingest keys from CSV preview (micronix). */
  previewHideKeys?: string[]
}
