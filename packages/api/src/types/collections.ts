/**
 * Collection type definitions for API responses
 */

import type { Location, MicronixPlate, CryovialBox, Box, Bag, Sheet, Unit, Specimen } from '../db/schema'

/**
 * Container source information (subject or control)
 */
export type ContainerSource =
  | {
      type: 'subject'
      id: number
      name: string
      study: {
        id: number
        title: string
        code: string
        leadPerson: string
      }
    }
  | {
      type: 'control'
      id: number
      name: string
      definitionName: string | null
      controlType: string
      targetDensity: number | null
      targetDensityUnit: string | null
      strainComposition: string | null
    }
  | null

/**
 * Enriched container information
 */
export interface EnrichedContainer {
  id: number
  specimenId: number
  unit: Unit | null
  totalQuantity: number | null
  remainingQuantity: number | null
  comment: string | null
  created: string
  lastUpdated: string
  specimen: Specimen | null
  specimenTypeName: string | null
  source: ContainerSource
}

/**
 * Well entry for micronix plates (tubes or static wells)
 */
export type WellEntry =
  | {
      type: 'micronix_tube'
      id: number
      barcode: string
      position: string | null
      container: EnrichedContainer | null
    }
  | {
      type: 'static_well'
      id: number
      position: string | null
      container: EnrichedContainer | null
    }

/**
 * Cryovial tube entry
 */
export interface CryovialTubeEntry {
  kind: 'cryovial_tube'
  id: number
  barcode: string | null
  position: string | null
  container: EnrichedContainer | null
}

/**
 * Paper entry
 */
export interface PaperEntry {
  type: 'paper'
  id: number
  barcode: string | null
  position: string | null
  container: EnrichedContainer | null
}

/**
 * Sheet with papers
 */
export interface SheetWithPapers extends Sheet {
  papers: PaperEntry[]
}

/**
 * Micronix plate response
 */
export interface MicronixPlateResponse extends MicronixPlate {
  location: Location | null
  locationPath?: string | null
}

/**
 * Cryovial box response
 */
export interface CryovialBoxResponse extends CryovialBox {
  location: Location | null
  locationPath?: string | null
}

/**
 * Box response
 */
export interface BoxResponse extends Box {
  location: Location | null
  locationPath?: string | null
}

/**
 * Bag response
 */
export interface BagResponse extends Bag {
  location: Location | null
  locationPath?: string | null
}

/**
 * Sheet response
 */
export interface SheetResponse extends Sheet {
  location: Location | null
  locationPath?: string | null
  box: { id: number; name: string } | null
  bag: { id: number; name: string } | null
}

/**
 * Micronix plate detail response
 */
export interface MicronixPlateDetailResponse {
  plate: MicronixPlateResponse
  wells: Record<string, WellEntry>
}

/**
 * Cryovial box detail response
 */
export interface CryovialBoxDetailResponse {
  box: CryovialBoxResponse
  positions: Record<string, CryovialTubeEntry[]>
}

/**
 * Box detail response
 */
export interface BoxDetailResponse {
  box: BoxResponse
  contents: {
    sheets: SheetWithPapers[]
  }
}

/**
 * Bag detail response
 */
export interface BagDetailResponse {
  bag: BagResponse
  contents: {
    sheets: SheetWithPapers[]
  }
}

/**
 * Sheet detail response
 */
export interface SheetDetailResponse {
  sheet: SheetResponse
  papers: PaperEntry[]
}

/**
 * Collection info for containers (used in container enrichment)
 */
export type CollectionInfo =
  | { type: 'micronix_plate'; id: number; name: string; position?: string | null; barcode?: string | null }
  | { type: 'cryovial_box'; id: number; name: string; position?: string | null; barcode?: string | null }
  | { type: 'sheet'; id: number; name: string; position?: string | null; barcode?: string | null }

/**
 * Location contents (used in location detail responses)
 */
export interface LocationContents {
  micronixPlates?: Array<MicronixPlateResponse & { itemCount?: number }>
  cryovialBoxes?: Array<CryovialBoxResponse & { itemCount?: number }>
  boxes?: Array<BoxResponse & { itemCount?: number }>
  bags?: Array<BagResponse & { itemCount?: number }>
}

/**
 * Collection list item (used in list endpoints)
 */
export interface CollectionListItem {
  id: number
  name: string
  barcode?: string | null
  locationId: number
  itemCount: number
  location: {
    id: number
    path?: string | null
  } | null
}
