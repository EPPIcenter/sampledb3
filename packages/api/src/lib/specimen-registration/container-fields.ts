import type { ContainerWriteInput } from '@sampledb/contract'

function hasGridCollection(collection: { id?: number; name?: string; barcode?: string } | undefined): boolean {
  if (!collection) return false
  return collection.id != null || Boolean(collection.name) || Boolean(collection.barcode)
}

/**
 * Required ContainerWriteInput fields by type (no DB uniqueness checks).
 */
export function validateContainerWriteFields(
  input: ContainerWriteInput
): { valid: boolean; error?: string } {
  if (input.containerType === 'micronix_tube') {
    if (!input.barcode) {
      return { valid: false, error: 'Barcode is required for micronix tubes' }
    }
    if (!hasGridCollection(input.collection)) {
      return { valid: false, error: 'Collection name or barcode is required' }
    }
    if (!input.collection?.position || String(input.collection.position).trim() === '') {
      return { valid: false, error: 'Position (well) is required for micronix tubes.' }
    }
  } else if (input.containerType === 'cryovial_tube') {
    if (!hasGridCollection(input.collection)) {
      return { valid: false, error: 'Collection name or barcode is required' }
    }
    if (!input.collection?.position || String(input.collection.position).trim() === '') {
      return { valid: false, error: 'Position (well) is required for cryovial tubes.' }
    }
  } else if (input.containerType === 'paper') {
    const barcode = Reflect.get(input, 'barcode')
    if (typeof barcode === 'string' && barcode !== '') {
      return { valid: false, error: 'Paper containers use sublabel for spot identifiers, not barcode' }
    }
    const collection = input.collection
    if (!collection) {
      return { valid: false, error: 'Collection is required for paper containers' }
    }
    if (collection.id == null) {
      if (!collection.parent || (collection.parent.id == null && !collection.parent.name)) {
        return { valid: false, error: 'Collection name is required for papers' }
      }
      if (!collection.name) {
        return { valid: false, error: 'Sheet name is required for papers' }
      }
    }
  } else {
    if (!hasGridCollection(input.collection)) {
      return { valid: false, error: 'Collection name or barcode is required' }
    }
    if (!input.collection?.position || String(input.collection.position).trim() === '') {
      return { valid: false, error: 'Position (well) is required for static wells.' }
    }
  }

  return { valid: true }
}
