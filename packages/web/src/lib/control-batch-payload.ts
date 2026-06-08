/**
 * Map control-batch wizard/CSV flat container fields to ContainerWriteInput for API requests.
 */
import type { ContainerWriteInput } from '@sampledb/contract'

export type ControlBatchContainerWriteInput =
  | (Extract<ContainerWriteInput, { containerType: 'micronix_tube' }> & {
      quantity?: number
      unitSymbol?: string
    })
  | (Extract<ContainerWriteInput, { containerType: 'cryovial_tube' }> & {
      quantity?: number
      unitSymbol?: string
    })
  | (Extract<ContainerWriteInput, { containerType: 'paper' }> & {
      quantity?: number
      unitSymbol?: string
    })

export type FlatControlBatchContainer = {
  type: 'paper' | 'cryovial_tube' | 'micronix_tube'
  collectionId?: number
  collectionName?: string
  collectionLocationId?: number
  collectionType?: 'box' | 'bag' | 'micronix_plate' | 'cryovial_box'
  containerBarcode?: string
  sublabel?: string
  sheetName?: string
  position?: string
  quantity?: number
  unitSymbol?: string
}

function parentTypeForPaper(
  collectionType: FlatControlBatchContainer['collectionType']
): 'box' | 'bag' {
  return collectionType === 'bag' ? 'bag' : 'box'
}

export function flatControlBatchContainerToWriteInput(
  flat: FlatControlBatchContainer
): ControlBatchContainerWriteInput {
  const { quantity, unitSymbol } = flat

  if (flat.type === 'paper') {
    const parentType = parentTypeForPaper(flat.collectionType)
    const parent =
      flat.collectionId != null
        ? { type: parentType, id: flat.collectionId }
        : flat.collectionName != null
          ? {
              type: parentType,
              name: flat.collectionName,
              ...(flat.collectionLocationId != null ? { locationId: flat.collectionLocationId } : {}),
            }
          : undefined

    return {
      containerType: 'paper',
      ...(flat.sublabel ? { sublabel: flat.sublabel } : {}),
      ...(flat.sheetName
        ? {
            collection: {
              type: 'sheet',
              name: flat.sheetName,
              ...(parent ? { parent } : {}),
            },
          }
        : parent
          ? { collection: { type: 'sheet', parent } }
          : {}),
      ...(quantity != null ? { quantity } : {}),
      ...(unitSymbol ? { unitSymbol } : {}),
    }
  }

  if (flat.type === 'micronix_tube') {
    const collection =
      flat.collectionId != null
        ? {
            type: 'micronix_plate' as const,
            id: flat.collectionId,
            ...(flat.position ? { position: flat.position } : {}),
          }
        : flat.collectionName != null
          ? {
              type: 'micronix_plate' as const,
              name: flat.collectionName,
              ...(flat.collectionLocationId != null ? { locationId: flat.collectionLocationId } : {}),
              ...(flat.position ? { position: flat.position } : {}),
            }
          : undefined

    return {
      containerType: 'micronix_tube',
      barcode: flat.containerBarcode ?? '',
      ...(collection ? { collection } : {}),
      ...(quantity != null ? { quantity } : {}),
      ...(unitSymbol ? { unitSymbol } : {}),
    }
  }

  const collection =
    flat.collectionId != null
      ? {
          type: 'cryovial_box' as const,
          id: flat.collectionId,
          ...(flat.position ? { position: flat.position } : {}),
        }
      : flat.collectionName != null
        ? {
            type: 'cryovial_box' as const,
            name: flat.collectionName,
            ...(flat.collectionLocationId != null ? { locationId: flat.collectionLocationId } : {}),
            ...(flat.position ? { position: flat.position } : {}),
          }
        : undefined

  return {
    containerType: 'cryovial_tube',
    ...(flat.containerBarcode ? { barcode: flat.containerBarcode } : {}),
    ...(collection ? { collection } : {}),
    ...(quantity != null ? { quantity } : {}),
    ...(unitSymbol ? { unitSymbol } : {}),
  }
}
