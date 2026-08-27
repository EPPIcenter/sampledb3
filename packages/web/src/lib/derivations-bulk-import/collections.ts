import type { ValidationResult } from '../api/derivations'
import type { MissingDerivationCollection } from './types'

/** Validation collections that must be created before import (tube types only). */
export function deriveMissingCollections(
  validationResult: ValidationResult | null,
): MissingDerivationCollection[] {
  if (!validationResult?.collections.length) return []
  return validationResult.collections
    .filter(
      (c): c is typeof c & { containerType: 'micronix_tube' | 'cryovial_tube' } =>
        c.status === 'will_be_created' &&
        (c.containerType === 'micronix_tube' || c.containerType === 'cryovial_tube'),
    )
    .map(c => ({
      name: c.name,
      barcode: c.barcode,
      containerType: c.containerType,
      locationId: null,
      status: 'pending' as const,
    }))
}

export function mergeMissingCollections(
  base: MissingDerivationCollection[],
  updates: Record<number, Partial<MissingDerivationCollection>>,
): MissingDerivationCollection[] {
  return base.map((item, i) => ({ ...item, ...updates[i] }))
}

export function hasMissingTubeCollections(result: ValidationResult): boolean {
  return result.collections.some(
    (c) =>
      c.status === 'will_be_created' &&
      (c.containerType === 'micronix_tube' || c.containerType === 'cryovial_tube'),
  )
}

export function nextStepAfterValidate(result: ValidationResult): 'collections' | 'review' {
  return hasMissingTubeCollections(result) ? 'collections' : 'review'
}
