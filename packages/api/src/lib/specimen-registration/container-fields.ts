import type { ContainerWriteInput } from '@sampledb/contract'

function hasGridCollection(collection: { id?: number; name?: string; barcode?: string } | undefined): boolean {
  if (!collection) return false
  return collection.id != null || Boolean(collection.name) || Boolean(collection.barcode)
}

/** The input field a missing or misplaced value belongs to. */
export type ContainerWriteField = 'barcode' | 'sublabel' | 'collection' | 'position'

function hasPosition(collection: { position?: string } | undefined): boolean {
  return Boolean(collection?.position?.trim())
}

function positionRequired(containers: string) {
  return { valid: false, field: 'position', error: `Position is required for ${containers} (e.g. A01).` } as const
}

/**
 * Required ContainerWriteInput fields by type (no DB uniqueness checks).
 */
export function validateContainerWriteFields(
  input: ContainerWriteInput
): { valid: true } | { valid: false; field: ContainerWriteField; error: string } {
  if (input.containerType === 'micronix_tube') {
    if (!input.barcode) {
      return { valid: false, field: 'barcode', error: 'Barcode is required for micronix tubes' }
    }
    if (!hasGridCollection(input.collection)) {
      return { valid: false, field: 'collection', error: 'Collection name or barcode is required' }
    }
    if (!hasPosition(input.collection)) return positionRequired('micronix tubes')
  } else if (input.containerType === 'cryovial_tube') {
    if (!hasGridCollection(input.collection)) {
      return { valid: false, field: 'collection', error: 'Collection name or barcode is required' }
    }
    if (!hasPosition(input.collection)) return positionRequired('cryovial tubes')
  } else if (input.containerType === 'paper') {
    const barcode = Reflect.get(input, 'barcode')
    if (typeof barcode === 'string' && barcode !== '') {
      return { valid: false, field: 'sublabel', error: 'Paper containers use sublabel for spot identifiers, not barcode' }
    }
    const collection = input.collection
    if (!collection) {
      return { valid: false, field: 'collection', error: 'Collection is required for paper containers' }
    }
    if (collection.id == null) {
      if (!collection.parent || (collection.parent.id == null && !collection.parent.name)) {
        return { valid: false, field: 'collection', error: 'Collection name is required for papers' }
      }
      if (!collection.name) {
        return { valid: false, field: 'collection', error: 'Sheet name is required for papers' }
      }
    }
  } else {
    if (!hasGridCollection(input.collection)) {
      return { valid: false, field: 'collection', error: 'Collection name or barcode is required' }
    }
    if (!hasPosition(input.collection)) return positionRequired('static wells')
  }

  return { valid: true }
}
