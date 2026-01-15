/**
 * Property type definitions for JSON properties fields
 */

/**
 * Strain information in control properties
 */
export interface StrainInfo {
  id: number
  name?: string
  percentage?: number
}

/**
 * Blood control properties
 */
export interface BloodControlProperties {
  strains?: Array<StrainInfo | number> // Can be full objects or just IDs
  targetDensity?: number
  targetDensityUnitId?: number
  targetDensityUnitSymbol?: string
  targetDensityUnit?: {
    id: number
    symbol: string
  } | string
}

/**
 * Control batch properties (can be empty or contain batch-specific data)
 */
export interface ControlBatchProperties {
  [key: string]: unknown
}

/**
 * Reagent properties (flexible structure for different reagent types)
 */
export interface ReagentProperties {
  [key: string]: unknown
}

/**
 * Cell line properties (flexible structure)
 */
export interface CellLineProperties {
  [key: string]: unknown
}

/**
 * Plasmid properties (flexible structure)
 */
export interface PlasmidProperties {
  [key: string]: unknown
}

/**
 * Standard properties (flexible structure)
 */
export interface StandardProperties {
  [key: string]: unknown
}

/**
 * Container derivation properties (flexible structure for protocol-specific data)
 */
export interface DerivationProperties {
  [key: string]: unknown
}

/**
 * Parsed control properties result
 */
export interface ParsedControlProperties {
  strains: Array<{ id: number; name: string; percentage?: number }>
  targetDensity?: number
  unitSymbol?: string
  targetDensityUnitId?: number
}

/**
 * Type guard to check if a value is a valid blood control properties object
 */
export function isBloodControlProperties(value: unknown): value is BloodControlProperties {
  if (typeof value !== 'object' || value === null) {
    return false
  }
  const obj = value as Record<string, unknown>
  // Check if it has the expected structure (strains, targetDensity, etc.)
  return (
    obj.strains === undefined ||
    Array.isArray(obj.strains) ||
    typeof obj.targetDensity === 'number' ||
    typeof obj.targetDensity === 'undefined'
  )
}

/**
 * Type guard to check if a value is a valid strain info object
 */
export function isStrainInfo(value: unknown): value is StrainInfo {
  if (typeof value !== 'object' || value === null) {
    return false
  }
  const obj = value as Record<string, unknown>
  return typeof obj.id === 'number'
}
