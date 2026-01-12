import { Hono } from 'hono'
import { createCrudRoutes } from '../lib/crud-routes'
import type { Database } from '../db/client'
import { storageType, location } from '../db/schema'
import { eq } from 'drizzle-orm'
import { z } from 'zod'

const createSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  description: z.string().optional(),
})

/**
 * Check if storage type is in use by locations
 * Note: storageTypeId is stored as text but must be a valid ID due to foreign key constraint
 */
async function checkStorageTypeInUse(id: number, database: any): Promise<string | null> {
  const typeRecord = await database
    .select()
    .from(storageType)
    .where(eq(storageType.id, id))
    .get()

  if (!typeRecord) {
    return 'Storage type not found'
  }

  const inUse = await database
    .select()
    .from(location)
    .where(eq(location.storageTypeId, String(typeRecord.id)))
    .limit(1)
    .get()

  if (inUse) {
    return 'Cannot delete storage type: it is in use by locations'
  }
  return null
}

/**
 * Create storage types routes with database injection
 * @param database - Database instance (required)
 */
export function createStorageTypesRoutes(database: Database): Hono {
  return createCrudRoutes({
    table: storageType,
    database,
    entityName: 'Storage type',
    pluralName: 'storageTypes',
    singularName: 'storageType',
    createSchema,
    checkInUse: checkStorageTypeInUse,
  })
}

