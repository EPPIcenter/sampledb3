import { db } from '../db/client'
import { unit } from '../db/schema'
import { eq } from 'drizzle-orm'
import { getContainerDefaults, clearSettingsCache } from './settings'
import type { ContainerType } from './container-creation'

// Cache for defaults to avoid repeated queries (per container type)
const defaultUnitCache = new Map<ContainerType, { id: number; symbol: string }>()

/**
 * Get default unit for a container type
 * @param containerType The type of container
 * @returns The unit ID
 * @throws Error if unit settings are not configured or unit not found
 */
export async function getDefaultUnit(containerType: ContainerType): Promise<number> {
  // Check cache first
  const cached = defaultUnitCache.get(containerType)
  if (cached) {
    return cached.id
  }

  const defaults = await getContainerDefaults()
  if (!defaults) {
    throw new Error('Container defaults are not configured. Please run database initialization.')
  }

  const containerDefaults = defaults[containerType]
  if (!containerDefaults || !containerDefaults.defaultUnitSymbol) {
    throw new Error(`Default unit symbol not configured for container type '${containerType}'. Please update settings.`)
  }

  const unitSymbol = containerDefaults.defaultUnitSymbol
  
  const unitRecord = await db
    .select()
    .from(unit)
    .where(eq(unit.symbol, unitSymbol))
    .get()
  
  if (!unitRecord) {
    throw new Error(`Unit symbol '${unitSymbol}' not found for container type '${containerType}'. Please update settings or create the unit.`)
  }

  const unitId = unitRecord.id as number
  defaultUnitCache.set(containerType, { id: unitId, symbol: unitSymbol })
  return unitId
}

/**
 * Get default total quantity for a container type
 * @throws Error if container defaults are not configured
 */
export async function getDefaultTotalQuantity(containerType: ContainerType): Promise<number> {
  const defaults = await getContainerDefaults()
  if (!defaults) {
    throw new Error('Container defaults are not configured. Please run database initialization.')
  }
  if (!defaults[containerType]) {
    throw new Error(`Container defaults for container type '${containerType}' are not configured. Please run database initialization.`)
  }
  return defaults[containerType].totalQuantity
}

/**
 * Get default remaining quantity for a container type
 * @throws Error if container defaults are not configured
 */
export async function getDefaultRemainingQuantity(containerType: ContainerType): Promise<number> {
  const defaults = await getContainerDefaults()
  if (!defaults) {
    throw new Error('Container defaults are not configured. Please run database initialization.')
  }
  if (!defaults[containerType]) {
    throw new Error(`Container defaults for container type '${containerType}' are not configured. Please run database initialization.`)
  }
  return defaults[containerType].remainingQuantity
}

/**
 * Clear the cache
 */
export function clearDefaultsCache() {
  defaultUnitCache.clear()
  clearSettingsCache()
}
