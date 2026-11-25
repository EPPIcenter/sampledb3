import type { ValidationResult } from '../api/derivations'
import type { MissingDerivationCollection } from './types'

/** Validation collections that will be created atomically on import (tube types only). */
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
    .map((c) => ({
      name: c.name,
      barcode: c.barcode,
      containerType: c.containerType,
      locationId: null,
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

/** Find the chosen locationId for a review row whose target Collection will be created on import. */
export function findMissingCollectionLocationId(
  row: Record<string, string>,
  headers: string[],
  missingCollections: MissingDerivationCollection[],
  defaultContainerType?: 'micronix_tube' | 'cryovial_tube' | 'paper' | '',
): number | undefined {
  if (missingCollections.length === 0) return undefined
  const getCell = (lowerName: string): string => {
    const header = headers.find((h) => h.trim().toLowerCase() === lowerName)
    return header ? (row[header] ?? '').trim() : ''
  }
  const containerType = getCell('container_type') || defaultContainerType || 'micronix_tube'
  if (containerType !== 'micronix_tube' && containerType !== 'cryovial_tube') return undefined

  const rowName = containerType === 'cryovial_tube' ? getCell('box_name') : getCell('plate_name')
  const rowBarcode = getCell('collection_barcode')
  if (!rowName && !rowBarcode) return undefined

  const match =
    missingCollections.find(
      (c) =>
        c.containerType === containerType &&
        c.locationId != null &&
        (c.name?.trim() ?? '') === rowName &&
        (c.barcode?.trim() ?? '') === rowBarcode,
    ) ??
    missingCollections.find(
      (c) =>
        c.containerType === containerType &&
        c.locationId != null &&
        ((Boolean(rowName) && (c.name?.trim() ?? '') === rowName) ||
          (Boolean(rowBarcode) && (c.barcode?.trim() ?? '') === rowBarcode)),
    )
  return match?.locationId ?? undefined
}
