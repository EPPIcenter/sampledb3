import type { SpecimenSummaryWire } from '@sampledb/contract/wire'
import type { SpecimenSource } from '../specimens/provenance'

export type ContainerSource = SpecimenSource | null

export type EnrichedStorageContainer = {
  id: number
  specimenId: number
  unit: typeof import('../../db/schema').unit.$inferSelect | null
  totalQuantity: number | null
  remainingQuantity: number | null
  comment: string | null
  created: string
  lastUpdated: string
  specimen: SpecimenSummaryWire | null
  specimenTypeName: string | null
  source: ContainerSource
}

export type CollectionLocationSummary = {
  id: number
  path: string | undefined
} | null

export type CollectionListEntry = {
  id: number
  name: string
  barcode?: string | null
  locationId: number | null
  itemCount: number
  location: CollectionLocationSummary
}

export type CollectionListAllEntry = CollectionListEntry & {
  type: 'micronix_plate' | 'cryovial_box' | 'box' | 'bag'
}

export type CollectionType = 'micronix_plate' | 'cryovial_box' | 'box' | 'bag' | 'sheet'

export type CreateCollectionInput = {
  name: string
  locationId: number
  barcode?: string
  userId?: number
}
