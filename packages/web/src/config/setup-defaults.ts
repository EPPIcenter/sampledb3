/**
 * Default data used during initial system setup
 * 
 * This file contains all default reference data that will be used
 * in the frontend setup wizard. Modify these values to change the default setup behavior.
 */

export type ContainerType = 'paper' | 'cryovial_tube' | 'micronix_tube' | 'static_well'

export interface SpecimenTypeDefault {
  name: string
  containerTypes?: ContainerType[]
}

export interface UnitDefault {
  name: string
  symbol: string
  category: string
}

export interface StorageTypeDefault {
  name: string
  description: string
}

/**
 * Default specimen types with their allowed container types
 */
export const defaultSpecimenTypes: SpecimenTypeDefault[] = [
  { name: 'Whole Blood', containerTypes: ['paper', 'cryovial_tube'] },
  { name: 'Plasma', containerTypes: ['cryovial_tube', 'micronix_tube'] },
  { name: 'Serum', containerTypes: ['cryovial_tube', 'micronix_tube'] },
  { name: 'Saliva', containerTypes: ['cryovial_tube', 'micronix_tube'] },
  { name: 'DBS', containerTypes: ['paper', 'micronix_tube'] },
  { name: 'DNA (DBS)', containerTypes: ['micronix_tube'] },
  { name: 'DNA (WB)', containerTypes: ['micronix_tube'] },
]

/**
 * Default units for measurements
 */
export const defaultUnits: UnitDefault[] = [
  { name: 'Milliliter', symbol: 'mL', category: 'volume' },
  { name: 'Microliter', symbol: 'µL', category: 'volume' },
  { name: 'Gram', symbol: 'g', category: 'mass' },
  { name: 'Count', symbol: 'cnt', category: 'count' },
  { name: 'Generic items', symbol: 'items', category: 'count' },
  { name: 'DBS spots', symbol: 'spots', category: 'count' },
  { name: 'Cryovial tubes', symbol: 'tubes', category: 'count' },
  { name: 'Parasites per microliter', symbol: 'p/uL', category: 'concentration' },
]

/**
 * Default storage types for locations
 */
export const defaultStorageTypes: StorageTypeDefault[] = [
  { name: 'Freezer -80°C', description: 'Ultra-low temperature freezer' },
  { name: 'Freezer -20°C', description: 'Standard freezer' },
  { name: 'Liquid Nitrogen', description: 'Liquid nitrogen storage (LN2)' },
  { name: 'Refrigerator 4°C', description: 'Standard fridge' },
  { name: 'Room Temperature', description: 'Ambient storage' },
]

