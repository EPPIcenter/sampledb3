import { createCrudRoutes } from '../lib/crud-routes'
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

const tags = createCrudRoutes({
  table: tag,
  entityName: 'Tag',
  pluralName: 'tags',
  singularName: 'tag',
  createSchema,
  checkInUse: checkTagInUse,
})

export default tags


