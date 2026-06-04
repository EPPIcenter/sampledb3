import type { EnrichedContainerWire } from '@sampledb/contract/wire'
import { getContainerTypeName } from './icons'

/** Minimal wire-shaped input for container identity display. */
export type ContainerDisplayInput = {
  containerType?: EnrichedContainerWire['containerType']
  barcode?: string
  sublabel?: string
  collection?: EnrichedContainerWire['collection']
}

function collectionPosition(collection: ContainerDisplayInput['collection']): string | undefined {
  if (!collection || !('position' in collection)) {
    return undefined
  }
  return collection.position ?? undefined
}

function collectionName(collection: ContainerDisplayInput['collection']): string | undefined {
  return collection?.name
}

/** Primary lab identifier at the container variant root (barcode or sublabel). */
export function containerDisplayIdentifier(
  container: ContainerDisplayInput | null | undefined,
): string | undefined {
  if (!container?.containerType) {
    return undefined
  }

  switch (container.containerType) {
    case 'micronix_tube':
    case 'cryovial_tube':
      return container.barcode
    case 'paper':
      return container.sublabel
    default:
      return undefined
  }
}

export function hasContainerDisplayIdentifier(
  container: ContainerDisplayInput | null | undefined,
): boolean {
  return containerDisplayIdentifier(container) != null
}

/** Human-readable label: identity, then grid position, then collection name, then type name. */
export function containerDisplayLabel(
  container: ContainerDisplayInput | null | undefined,
  fallback?: string,
): string {
  if (!container?.containerType) {
    return fallback ?? 'Container'
  }

  const identity = containerDisplayIdentifier(container)
  if (identity) {
    return identity
  }

  const position = collectionPosition(container.collection)
  if (position) {
    return position
  }

  const name = collectionName(container.collection)
  if (name) {
    return name
  }

  return getContainerTypeName(container.containerType) ?? fallback ?? 'Container'
}
