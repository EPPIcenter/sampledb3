/**
 * Map ContainerRegistration flat form state to ContainerWriteInput for specimen API requests.
 */
import type { ContainerWriteInput } from '@sampledb/contract'
import type { ContainerData } from '../components/ContainerRegistration'

export type SpecimenContainerWriteInput = ContainerWriteInput & {
  unitId?: number
  totalQuantity?: number
  remainingQuantity?: number
}

export function isFlatContainerRegistration(
  container: ContainerData | SpecimenContainerWriteInput
): container is ContainerData {
  const record = container as Record<string, unknown>
  return (
    ('collectionName' in record ||
      'sheetName' in record ||
      'collectionBarcode' in record) &&
    !('collection' in record)
  )
}

function micronixCollection(flat: ContainerData) {
  if (flat.collectionBarcode) {
    return {
      type: 'micronix_plate' as const,
      barcode: flat.collectionBarcode,
      ...(flat.position ? { position: flat.position } : {}),
    }
  }
  if (flat.collectionName) {
    return {
      type: 'micronix_plate' as const,
      name: flat.collectionName,
      ...(flat.position ? { position: flat.position } : {}),
    }
  }
  return undefined
}

function cryovialCollection(flat: ContainerData) {
  if (flat.collectionBarcode) {
    return {
      type: 'cryovial_box' as const,
      barcode: flat.collectionBarcode,
      ...(flat.position ? { position: flat.position } : {}),
    }
  }
  if (flat.collectionName) {
    return {
      type: 'cryovial_box' as const,
      name: flat.collectionName,
      ...(flat.position ? { position: flat.position } : {}),
    }
  }
  return undefined
}

function quantityFields(flat: ContainerData) {
  return {
    ...(flat.unitId != null ? { unitId: flat.unitId } : {}),
    ...(flat.totalQuantity != null ? { totalQuantity: flat.totalQuantity } : {}),
    ...(flat.remainingQuantity != null ? { remainingQuantity: flat.remainingQuantity } : {}),
  }
}

export function flatContainerRegistrationToWriteInput(
  flat: ContainerData
): SpecimenContainerWriteInput {
  const comment = flat.comment?.trim() ? flat.comment : undefined

  switch (flat.containerType) {
    case 'micronix_tube': {
      const collection = micronixCollection(flat)
      return {
        containerType: 'micronix_tube',
        barcode: flat.barcode ?? '',
        ...(collection ? { collection } : {}),
        ...(comment ? { comment } : {}),
        ...quantityFields(flat),
      }
    }
    case 'cryovial_tube': {
      const collection = cryovialCollection(flat)
      return {
        containerType: 'cryovial_tube',
        ...(flat.barcode ? { barcode: flat.barcode } : {}),
        ...(collection ? { collection } : {}),
        ...(comment ? { comment } : {}),
        ...quantityFields(flat),
      }
    }
    case 'paper': {
      const parentType = flat.parentCollectionType ?? 'box'
      const parentLocationId =
        flat.collectionLocationId != null ? { locationId: flat.collectionLocationId } : {}
      const parent = flat.collectionName
        ? { type: parentType, name: flat.collectionName, ...parentLocationId }
        : flat.collectionBarcode
          ? { type: parentType, name: flat.collectionBarcode, ...parentLocationId }
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
        ...(comment ? { comment } : {}),
        ...quantityFields(flat),
      }
    }
    case 'static_well': {
      const collection = micronixCollection(flat)
      return {
        containerType: 'static_well',
        ...(collection ? { collection } : {}),
        ...(comment ? { comment } : {}),
        ...quantityFields(flat),
      }
    }
  }
}
