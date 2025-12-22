import { db } from '../db/client'
import { state, unit } from '../db/schema'
import { eq } from 'drizzle-orm'

// Cache for defaults to avoid repeated queries
let defaultStateCache: { id: number; name: string } | null = null
let defaultUnitCache: { id: number; symbol: string } | null = null

/**
 * Get default state (e.g., "Active")
 * Looks for common default state names
 */
export async function getDefaultState(): Promise<number | null> {
  if (defaultStateCache) {
    return defaultStateCache.id
  }

  // Try common default state names
  const defaultNames = ['Active', 'active', 'Available', 'available', 'In Use', 'in use']
  
  for (const name of defaultNames) {
    const stateRecord = await db
      .select()
      .from(state)
      .where(eq(state.name, name))
      .get()
    
    if (stateRecord) {
      defaultStateCache = { id: stateRecord.id, name: stateRecord.name }
      return stateRecord.id
    }
  }

  // If no default found, use the first state
  const firstState = await db
    .select()
    .from(state)
    .limit(1)
    .get()
  
  if (firstState) {
    defaultStateCache = { id: firstState.id, name: firstState.name }
    return firstState.id
  }

  return null
}

/**
 * Get default unit (e.g., "items")
 */
export async function getDefaultUnit(): Promise<number | null> {
  if (defaultUnitCache) {
    return defaultUnitCache.id
  }

  // Try common default unit symbols
  const defaultSymbols = ['items', 'tubes', 'spots']
  
  for (const symbol of defaultSymbols) {
    const unitRecord = await db
      .select()
      .from(unit)
      .where(eq(unit.symbol, symbol))
      .get()
    
    if (unitRecord) {
      defaultUnitCache = { id: unitRecord.id as number, symbol: unitRecord.symbol as string }
      return unitRecord.id as number
    }
  }

  // Fallback to any unit
  const firstUnit = await db.select().from(unit).limit(1).get()
  if (firstUnit) {
    defaultUnitCache = { id: firstUnit.id as number, symbol: firstUnit.symbol as string }
    return firstUnit.id as number
  }

  return null
}

/**
 * Get default state and unit as a pair
 */
export async function getDefaultStateAndUnit(): Promise<{ stateId: number; unitId: number } | null> {
  const [stateId, unitId] = await Promise.all([
    getDefaultState(),
    getDefaultUnit(),
  ])

  if (stateId && unitId) {
    return { stateId, unitId }
  }

  return null
}

/**
 * Clear the cache
 */
export function clearDefaultsCache() {
  defaultStateCache = null
  defaultUnitCache = null
}
