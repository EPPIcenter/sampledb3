import type { Database } from '../db/client'
import { unit } from '../db/schema'
import { eq } from 'drizzle-orm'
import { getContainerDefaults, clearSettingsCache } from './settings'
import type { ContainerType } from './container-creation'

// Cache for defaults to avoid repeated queries (per container type, per database)
// Cache key format: "dbId:containerType"
const defaultUnitCache = new Map<string, { id: number; symbol: string }>()

function getCacheKey(db: Database, containerType: ContainerType): string {
  const dbId = (db as any)._id || String(db)
  return `${dbId}:${containerType}`
}

/**
 * Get default unit for a container type
 * @param db - Database instance
 * @param containerType The type of container
 * @returns The unit ID
 * @throws Error if unit settings are not configured or unit not found
 */
export async function getDefaultUnit(db: Database, containerType: ContainerType): Promise<number> {
  const cacheKey = getCacheKey(db, containerType)
  // Check cache first
  const cached = defaultUnitCache.get(cacheKey)
  if (cached) {
    return cached.id
  }

  const defaults = await getContainerDefaults(db)
  if (!defaults) {
    throw new Error('Container defaults are not configured. Please run database initialization.')
  }

  const containerDefaults = defaults[containerType]
  const unitSymbol = containerDefaults.defaultUnitSymbol

  if (!unitSymbol || !String(unitSymbol).trim()) {
    throw new Error(`Default unit symbol not configured for container type '${containerType}'`)
  }

  const unitRecord = await db
    .select()
    .from(unit)
    .where(eq(unit.symbol, unitSymbol))
    .get()
  
  if (!unitRecord) {
    throw new Error(`Unit symbol '${unitSymbol}' not found for container type '${containerType}'. Please update settings or create the unit.`)
  }

  const unitId = unitRecord.id as number
  defaultUnitCache.set(cacheKey, { id: unitId, symbol: unitSymbol })
  return unitId
}

/**
 * Get default total quantity for a container type
 * @param db - Database instance
 * @throws Error if container defaults are not configured
 */
export async function getDefaultTotalQuantity(db: Database, containerType: ContainerType): Promise<number> {
  const defaults = await getContainerDefaults(db)
  if (!defaults) {
    throw new Error('Container defaults are not configured. Please run database initialization.')
  }
  return defaults[containerType].totalQuantity
}

/**
 * Get default remaining quantity for a container type
 * @param db - Database instance
 * @throws Error if container defaults are not configured
 */
export async function getDefaultRemainingQuantity(db: Database, containerType: ContainerType): Promise<number> {
  const defaults = await getContainerDefaults(db)
  if (!defaults) {
    throw new Error('Container defaults are not configured. Please run database initialization.')
  }
  return defaults[containerType].remainingQuantity
}

/**
 * Clear the cache
 * @param db - Optional database instance to clear cache for specific database
 */
export function clearDefaultsCache(db?: Database) {
  if (db) {
    const dbId = (db as any)._id || String(db)
    for (const key of defaultUnitCache.keys()) {
      if (key.startsWith(`${dbId}:`)) {
        defaultUnitCache.delete(key)
      }
    }
  } else {
    defaultUnitCache.clear()
  }
  clearSettingsCache(db)
}
