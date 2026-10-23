import type { ContainerSubtype } from '../container-placement'
import type { SpecimenSourceType } from './types'

/** Every Container type, in display order. `'unknown'` is a Container with no subtype row. */
export const CONTAINER_TYPES = [
  'micronix_tube',
  'cryovial_tube',
  'paper',
  'static_well',
  'unknown',
] as const satisfies readonly ContainerSubtype[]

/**
 * Narrow wire container types to the Container types filter. No values means every type;
 * unrecognised values are dropped, so a list of only unrecognised values matches nothing.
 */
export function containerTypesFilter(values: readonly string[] | undefined): ContainerSubtype[] | undefined {
  if (!values || values.length === 0) return undefined
  return CONTAINER_TYPES.filter((type) => values.includes(type))
}

/** Narrow a wire source type; anything other than `'subject'` or `'control'` means both. */
export function specimenSourceType(value: string | undefined): SpecimenSourceType | undefined {
  return value === 'subject' || value === 'control' ? value : undefined
}
