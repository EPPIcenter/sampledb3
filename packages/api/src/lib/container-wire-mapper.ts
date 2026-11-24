import type { EnrichedContainerWire, SpecimenSummaryWire } from '@sampledb/contract/wire'
import type { Specimen } from '../db/schema'
import type { EnrichedContainerApi } from './container-api-enrichment'
import {
  mapCollectionInfoToWire,
  projectContainerIdentity,
} from './container-projection'

function sharedFields(enriched: EnrichedContainerApi): Record<string, unknown> {
  return {
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
  }
}

/** Map persistence-shaped API enrichment to wire container DTO (null omission via middleware). */
export function mapEnrichedContainerToWire(enriched: EnrichedContainerApi): EnrichedContainerWire {
  const base = sharedFields(enriched)
  const identity = projectContainerIdentity(enriched.containerType, {
    micronix: enriched.micronixTube,
    cryovial: enriched.cryovialTube,
    paper: enriched.paper,
    staticWell: enriched.staticWell,
  })
  const collection = mapCollectionInfoToWire(enriched.collection)

  switch (enriched.containerType) {
    case 'micronix_tube': {
      if (!identity.barcode) {
        throw new Error(`Micronix container ${enriched.id} missing barcode`)
      }
      return {
        ...base,
        containerType: 'micronix_tube',
        barcode: identity.barcode,
        collection,
      } as EnrichedContainerWire
    }
    case 'cryovial_tube':
      return {
        ...base,
        containerType: 'cryovial_tube',
        ...(identity.barcode != null ? { barcode: identity.barcode } : {}),
        collection,
      } as EnrichedContainerWire
    case 'paper':
      return {
        ...base,
        containerType: 'paper',
        ...(identity.sublabel != null ? { sublabel: identity.sublabel } : {}),
        collection,
      } as EnrichedContainerWire
    case 'static_well':
      return {
        ...base,
        containerType: 'static_well',
        collection,
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

/** Map a Specimen row to SpecimenSummaryWire so audit columns (createdBy, updatedBy) stay off the wire. */
export function toSpecimenSummaryWire(
  spec: Specimen,
  specimenTypeInfo?: { id: number; name: string },
): SpecimenSummaryWire {
  return {
    id: spec.id,
    studySubjectId: spec.studySubjectId,
    controlBatchId: spec.controlBatchId,
    specimenTypeId: spec.specimenTypeId,
    collectionDate: spec.collectionDate,
    created: spec.created,
    lastUpdated: spec.lastUpdated,
    ...(specimenTypeInfo ? { specimenType: { id: specimenTypeInfo.id, name: specimenTypeInfo.name } } : {}),
  }
}
