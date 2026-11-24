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

function trimOptional(value: string | undefined): string | undefined {
  const trimmed = value?.trim()
  return trimmed ? trimmed : undefined
}

function micronixCollection(flat: ContainerData) {
  const collectionBarcode = trimOptional(flat.collectionBarcode)
  const collectionName = trimOptional(flat.collectionName)
  const position = trimOptional(flat.position)
  if (collectionBarcode) {
    return {
      type: 'micronix_plate' as const,
      barcode: collectionBarcode,
      ...(position ? { position } : {}),
    }
  }
  if (collectionName) {
    return {
      type: 'micronix_plate' as const,
      name: collectionName,
      ...(position ? { position } : {}),
    }
  }
  return undefined
}

function cryovialCollection(flat: ContainerData) {
  const collectionBarcode = trimOptional(flat.collectionBarcode)
  const collectionName = trimOptional(flat.collectionName)
  const position = trimOptional(flat.position)
  if (collectionBarcode) {
    return {
      type: 'cryovial_box' as const,
      barcode: collectionBarcode,
      ...(position ? { position } : {}),
    }
  }
  if (collectionName) {
    return {
      type: 'cryovial_box' as const,
      name: collectionName,
      ...(position ? { position } : {}),
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
  const barcode = trimOptional(flat.barcode)
  const sublabel = trimOptional(flat.sublabel)
  const sheetName = trimOptional(flat.sheetName)
  const collectionName = trimOptional(flat.collectionName)
  const collectionBarcode = trimOptional(flat.collectionBarcode)

  switch (flat.containerType) {
    case 'micronix_tube': {
      const collection = micronixCollection(flat)
      return {
        containerType: 'micronix_tube',
        ...(barcode ? { barcode } : {}),
        ...(collection ? { collection } : {}),
        ...(comment ? { comment } : {}),
        ...quantityFields(flat),
      } as SpecimenContainerWriteInput
    }
    case 'cryovial_tube': {
      const collection = cryovialCollection(flat)
      return {
        containerType: 'cryovial_tube',
        ...(barcode ? { barcode } : {}),
        ...(collection ? { collection } : {}),
        ...(comment ? { comment } : {}),
        ...quantityFields(flat),
      }
    }
    case 'paper': {
      const parentType = flat.parentCollectionType ?? 'box'
      const parentLocationId =
        flat.collectionLocationId != null ? { locationId: flat.collectionLocationId } : {}
      const parent = collectionName
        ? { type: parentType, name: collectionName, ...parentLocationId }
        : collectionBarcode
          ? { type: parentType, name: collectionBarcode, ...parentLocationId }
          : undefined
      return {
        containerType: 'paper',
        ...(sublabel ? { sublabel } : {}),
        ...(sheetName
          ? {
              collection: {
                type: 'sheet',
                name: sheetName,
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
