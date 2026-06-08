import type { ContainerWriteInput } from '@sampledb/contract'

export type FlatDerivationContainerForm = {
  containerType: 'micronix_tube' | 'cryovial_tube' | 'paper' | 'static_well'
  collectionId?: number
  collectionName?: string
  barcode?: string
  sublabel?: string
  position?: string
}

export type CreateDerivationRequestPayload = {
  derivationType: string
  specimenTypeName: string
  container: ContainerWriteInput
  quantity?: number
  unitSymbol?: string
  quantityUsed?: number
  reduceParentQuantity?: boolean
  derivationDate?: string
  protocol?: string
  notes?: string
  properties?: Record<string, unknown>
  operatorId?: number
}

export function flatDerivationFormToWriteInput(
  flat: FlatDerivationContainerForm
): ContainerWriteInput {
  if (flat.containerType === 'paper') {
    if (flat.collectionId == null) {
      throw new Error('Paper derivations require an existing sheet (collection id)')
    }
    return {
      containerType: 'paper',
      ...(flat.sublabel ? { sublabel: flat.sublabel } : {}),
      collection: { type: 'sheet', id: flat.collectionId },
    }
  }

  if (flat.containerType === 'static_well') {
    return {
      containerType: 'static_well',
      ...(flat.collectionId != null
        ? {
            collection: {
              type: 'micronix_plate',
              id: flat.collectionId,
              ...(flat.position ? { position: flat.position } : {}),
            },
          }
        : flat.collectionName
          ? {
              collection: {
                type: 'micronix_plate',
                name: flat.collectionName,
                ...(flat.position ? { position: flat.position } : {}),
              },
            }
          : {}),
    }
  }

  if (flat.containerType === 'micronix_tube') {
    return {
      containerType: 'micronix_tube',
      barcode: flat.barcode ?? '',
      ...(flat.collectionId != null
        ? {
            collection: {
              type: 'micronix_plate',
              id: flat.collectionId,
              ...(flat.position ? { position: flat.position } : {}),
            },
          }
        : flat.collectionName
          ? {
              collection: {
                type: 'micronix_plate',
                name: flat.collectionName,
                ...(flat.position ? { position: flat.position } : {}),
              },
            }
          : {}),
    }
  }

  return {
    containerType: 'cryovial_tube',
    ...(flat.barcode ? { barcode: flat.barcode } : {}),
    ...(flat.collectionId != null
      ? {
          collection: {
            type: 'cryovial_box',
            id: flat.collectionId,
            ...(flat.position ? { position: flat.position } : {}),
          },
        }
      : flat.collectionName
        ? {
            collection: {
              type: 'cryovial_box',
              name: flat.collectionName,
              ...(flat.position ? { position: flat.position } : {}),
            },
          }
        : {}),
  }
}
