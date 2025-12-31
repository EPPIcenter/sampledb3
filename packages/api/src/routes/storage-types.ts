import { createCrudRoutes } from '../lib/crud-routes'
import { storageType, location } from '../db/schema'
import { eq, or } from 'drizzle-orm'
import { z } from 'zod'

const createSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  description: z.string().optional(),
})

/**
 * Check if storage type is in use by locations
 * Note: locations use storageTypeId as text, so we check by both ID and name
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
    .where(or(
      eq(location.storageTypeId, String(typeRecord.id)),
      eq(location.storageTypeId, typeRecord.name)
    ) as any)
    .limit(1)
    .get()

  if (inUse) {
    return 'Cannot delete storage type: it is in use by locations'
  }
  return null
}

const storageTypes = createCrudRoutes({
  table: storageType,
  entityName: 'Storage type',
  pluralName: 'storageTypes',
  singularName: 'storageType',
  createSchema,
  checkInUse: checkStorageTypeInUse,
})

export default storageTypes

