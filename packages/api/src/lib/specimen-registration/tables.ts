/** Which Collection each container type goes in, and the table behind each type. One place. */
import type { GridCollectionType } from '@sampledb/contract'
import { bag, box, cryovialBox, cryovialTube, micronixPlate, micronixTube, staticWell } from '../../db/schema'

export type GridContainerType = 'micronix_tube' | 'cryovial_tube' | 'static_well'
export type { GridCollectionType }
export type ParentCollectionType = 'box' | 'bag'

/** The plate or box a tube or well goes in. */
export const GRID_COLLECTION_OF: Record<GridContainerType, GridCollectionType> = {
  micronix_tube: 'micronix_plate',
  cryovial_tube: 'cryovial_box',
  static_well: 'micronix_plate',
}

export const GRID_COLLECTION_TABLES = { micronix_plate: micronixPlate, cryovial_box: cryovialBox } as const

export const PARENT_COLLECTION_TABLES = { box, bag } as const

/** Tube and well tables; only tubes carry a barcode. */
export const GRID_CONTAINER_TABLES = { micronix_tube: micronixTube, cryovial_tube: cryovialTube, static_well: staticWell } as const

export const TUBE_TABLES = { micronix_tube: micronixTube, cryovial_tube: cryovialTube } as const
