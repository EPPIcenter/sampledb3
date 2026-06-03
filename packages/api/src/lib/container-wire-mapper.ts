import type { EnrichedContainerWire } from '@sampledb/contract/wire'
import type { EnrichedContainerApi } from './container-api-enrichment'

function omitNulls<T extends Record<string, unknown>>(obj: T): Partial<T> {
  const result: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(obj)) {
    if (value !== null && value !== undefined) {
      result[key] = value
    }
  }
  return result as Partial<T>
}

function mapSheetCollection(
  collection: NonNullable<EnrichedContainerApi['collection']>,
): EnrichedContainerWire['collection'] {
  if (collection.type !== 'sheet') {
    return null
  }
  return { type: 'sheet', id: collection.id, name: collection.name }
}

function mapMicronixCollection(
  collection: NonNullable<EnrichedContainerApi['collection']>,
): EnrichedContainerWire['collection'] {
  if (collection.type !== 'micronix_plate') {
    return null
  }
  return omitNulls({
    type: 'micronix_plate' as const,
    id: collection.id,
    name: collection.name,
    position: collection.position,
  }) as EnrichedContainerWire['collection']
}

function mapCryovialCollection(
  collection: NonNullable<EnrichedContainerApi['collection']>,
): EnrichedContainerWire['collection'] {
  if (collection.type !== 'cryovial_box') {
    return null
  }
  return omitNulls({
    type: 'cryovial_box' as const,
    id: collection.id,
    name: collection.name,
    position: collection.position,
  }) as EnrichedContainerWire['collection']
}

function sharedFields(enriched: EnrichedContainerApi): Record<string, unknown> {
  return omitNulls({
    id: enriched.id,
    specimenId: enriched.specimenId,
    comment: enriched.comment,
    remainingQuantity: enriched.remainingQuantity,
    totalQuantity: enriched.totalQuantity,
    unitId: enriched.unitId,
    unit: enriched.unit,
    tags: enriched.tags,
    location: enriched.location,
    locationPath: enriched.locationPath,
    created: enriched.created,
    lastUpdated: enriched.lastUpdated,
  })
}

/** Map persistence-shaped API enrichment to omit-on-wire container DTO. */
export function mapEnrichedContainerToWire(enriched: EnrichedContainerApi): EnrichedContainerWire {
  const base = sharedFields(enriched)

  switch (enriched.containerType) {
    case 'micronix_tube': {
      const barcode = enriched.micronixTube?.barcode ?? enriched.collection?.barcode
      if (!barcode) {
        throw new Error(`Micronix container ${enriched.id} missing barcode`)
      }
      return {
        ...base,
        containerType: 'micronix_tube',
        barcode,
        collection: enriched.collection ? mapMicronixCollection(enriched.collection) : null,
      } as EnrichedContainerWire
    }
    case 'cryovial_tube': {
      const barcode = enriched.cryovialTube?.barcode ?? enriched.collection?.barcode ?? undefined
      return {
        ...base,
        containerType: 'cryovial_tube',
        ...(barcode != null ? { barcode } : {}),
        collection: enriched.collection ? mapCryovialCollection(enriched.collection) : null,
      } as EnrichedContainerWire
    }
    case 'paper': {
      const sublabel = enriched.paper?.sublabel ?? undefined
      return {
        ...base,
        containerType: 'paper',
        ...(sublabel != null ? { sublabel } : {}),
        collection: enriched.collection ? mapSheetCollection(enriched.collection) : null,
      } as EnrichedContainerWire
    }
    case 'static_well':
      return {
        ...base,
        containerType: 'static_well',
        collection: enriched.collection ? mapMicronixCollection(enriched.collection) : null,
      } as EnrichedContainerWire
    case 'unknown':
      return {
        ...base,
        containerType: 'unknown',
        collection: null,
      } as EnrichedContainerWire
  }
}

export function mapEnrichedContainersToWire(enriched: EnrichedContainerApi[]): EnrichedContainerWire[] {
  return enriched.map(mapEnrichedContainerToWire)
}
