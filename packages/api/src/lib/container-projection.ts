import type { EnrichedContainerWire } from '@sampledb/contract/wire'
import type { CollectionInfo } from '../types/collections'
import type {
  ContainerPlacement,
  ContainerSubtype,
  CryovialSubtypeDetails,
  MicronixSubtypeDetails,
  PaperSubtypeDetails,
  StaticWellSubtypeDetails,
} from './container-placement'

/** Subtype rows keyed by container id — identity lives here, not on collection. */
export type ContainerSubtypeDetails = {
  micronix?: MicronixSubtypeDetails
  cryovial?: CryovialSubtypeDetails
  paper?: PaperSubtypeDetails
  staticWell?: StaticWellSubtypeDetails
}

export type ContainerIdentityProjection = {
  barcode?: string
  sublabel?: string
  sheetName?: string
}

export type ContainerPlacementFields = {
  collection: CollectionInfo | null
  position?: string
  collectionName?: string
}

/** Placement-only collection info from a resolved placement bundle row. */
export function projectContainerCollection(placement: ContainerPlacement): CollectionInfo | null {
  if (placement.containerType === 'unknown' || !placement.collection) {
    return null
  }

  const { id, name, position } = placement.collection

  switch (placement.containerType) {
    case 'micronix_tube':
    case 'static_well':
      return { type: 'micronix_plate', id, name, position }
    case 'cryovial_tube':
      return { type: 'cryovial_box', id, name, position }
    case 'paper':
      return { type: 'sheet', id, name }
  }
}

/** Container identity from subtype tables — barcode (tubes) or sublabel/sheetName (paper). */
export function projectContainerIdentity(
  containerType: ContainerSubtype,
  details: ContainerSubtypeDetails,
): ContainerIdentityProjection {
  switch (containerType) {
    case 'micronix_tube': {
      const barcode = details.micronix?.barcode
      return barcode != null && barcode !== '' ? { barcode } : {}
    }
    case 'cryovial_tube': {
      const barcode = details.cryovial?.barcode
      return barcode != null && barcode !== '' ? { barcode } : {}
    }
    case 'paper': {
      const sublabel = details.paper?.sublabel
      const rawSheetName = details.paper?.sheetName
      const sheetName = rawSheetName && rawSheetName !== 'Unknown' ? rawSheetName : undefined
      return {
        ...(sublabel != null && sublabel !== '' ? { sublabel } : {}),
        ...(sheetName ? { sheetName } : {}),
      }
    }
    default:
      return {}
  }
}

/** Placement fields shared by container export rows. */
export function projectContainerPlacementFields(placement: ContainerPlacement): ContainerPlacementFields {
  const collection = projectContainerCollection(placement)
  const position = placement.collection?.position ?? undefined
  const rawName = placement.collection?.name
  const collectionName = rawName && rawName !== 'Unknown' ? rawName : undefined
  return { collection, position, collectionName }
}

/** Map internal placement-only collection to wire placement DTO. */
export function mapCollectionInfoToWire(
  collection: CollectionInfo | null,
): EnrichedContainerWire['collection'] {
  if (!collection) {
    return null
  }

  switch (collection.type) {
    case 'sheet':
      return { type: 'sheet', id: collection.id, name: collection.name }
    case 'micronix_plate':
      return {
        type: 'micronix_plate',
        id: collection.id,
        name: collection.name,
        ...(collection.position != null ? { position: collection.position } : {}),
      }
    case 'cryovial_box':
      return {
        type: 'cryovial_box',
        id: collection.id,
        name: collection.name,
        ...(collection.position != null ? { position: collection.position } : {}),
      }
  }
}
