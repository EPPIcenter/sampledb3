import { Hono } from 'hono'
import { createCrudRoutes } from '../lib/crud-routes'
import type { Database } from '../db/client'
import { unit, storageContainer, containerTypeUnit } from '../db/schema'
import { eq } from 'drizzle-orm'
import { z } from 'zod'

const createSchema = z.object({
  symbol: z.string().min(1, 'Symbol is required'),
  name: z.string().min(1, 'Name is required'),
  category: z.enum(['volume', 'mass', 'count', 'concentration', 'other'], {
    error: 'Category must be one of: volume, mass, count, concentration, other'
  }),
})

const updateSchema = z.object({
  symbol: z.string().min(1, 'Symbol is required').optional(),
  name: z.string().min(1, 'Name is required').optional(),
  category: z.enum(['volume', 'mass', 'count', 'concentration', 'other']).optional(),
})

/**
 * Transform list response to include only specific fields
 */
function transformList(item: any) {
  return {
    id: item.id,
    symbol: item.symbol,
    name: item.name,
    category: item.category,
  }
}

/**
 * Check if unit is in use by storage containers or container type relationships
 */
async function checkUnitInUse(id: number, database: any): Promise<string | null> {
  // Check if used in storage containers
  const inStorageContainer = await database
    .select()
    .from(storageContainer)
    .where(eq(storageContainer.unitId, id))
    .limit(1)
    .get()

  if (inStorageContainer) {
    return 'Cannot delete unit: it is in use by storage containers'
  }

  // Check if used in container type relationships
  const inContainerTypeUnit = await database
    .select()
    .from(containerTypeUnit)
    .where(eq(containerTypeUnit.unitId, id))
    .limit(1)
    .get()

  if (inContainerTypeUnit) {
    return 'Cannot delete unit: it is assigned to container types'
  }

  return null
}

/**
 * Validate symbol uniqueness on create
 */
async function validateCreateUnit(data: any, database: any): Promise<string | null> {
  const existing = await database
    .select()
    .from(unit)
    .where(eq(unit.symbol, data.symbol))
    .get()

  if (existing) {
    return `Unit with symbol '${data.symbol}' already exists`
  }

  return null
}

/**
 * Validate symbol uniqueness on update
 */
async function validateUpdateUnit(id: number, data: any, database: any): Promise<string | null> {
  if (data.symbol) {
    const existing = await database
      .select()
      .from(unit)
      .where(eq(unit.symbol, data.symbol))
      .get()

    if (existing && existing.id !== id) {
      return `Unit with symbol '${data.symbol}' already exists`
    }
  }

  return null
}

/**
 * Create units routes with database injection
 * @param database - Database instance (required)
 */
export function createUnitsRoutes(database: Database): Hono {
  return createCrudRoutes({
    table: unit,
    database,
    entityName: 'Unit',
    pluralName: 'units',
    singularName: 'unit',
    createSchema,
    updateSchema,
    transformList,
    orderBy: unit.symbol,
    checkInUse: checkUnitInUse,
    validateCreate: validateCreateUnit,
    validateUpdate: validateUpdateUnit,
  })
}

