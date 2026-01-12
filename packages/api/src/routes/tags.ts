import { Hono } from 'hono'
import { createCrudRoutes } from '../lib/crud-routes'
import type { Database } from '../db/client'
import { tag, storageContainerTag } from '../db/schema'
import { eq } from 'drizzle-orm'
import { z } from 'zod'

const createSchema = z.object({
  name: z.string().min(1, 'Name is required'),
})

/**
 * Check if tag is in use by storage containers
 */
async function checkTagInUse(id: number, database: any): Promise<string | null> {
  const inUse = await database
    .select()
    .from(storageContainerTag)
    .where(eq(storageContainerTag.tagId, id))
    .limit(1)
    .get()

  if (inUse) {
    return 'Cannot delete tag: it is in use by storage containers'
  }
  return null
}

/**
 * Create tags routes with database injection
 * @param database - Database instance (required)
 */
export function createTagsRoutes(database: Database): Hono {
  return createCrudRoutes({
    table: tag,
    database,
    entityName: 'Tag',
    pluralName: 'tags',
    singularName: 'tag',
    createSchema,
    checkInUse: checkTagInUse,
  })
}


