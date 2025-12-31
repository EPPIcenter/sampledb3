import { createCrudRoutes } from '../lib/crud-routes'
import { composition, controlDefinition } from '../db/schema'
import { eq } from 'drizzle-orm'
import { z } from 'zod'

const createSchema = z.object({
  index: z.number().int().optional(),
  label: z.string().min(1, 'Label is required'),
  legacy: z.number().int().default(0),
})

const updateSchema = z.object({
  index: z.number().int().optional(),
  label: z.string().min(1, 'Label is required'),
  legacy: z.number().int().optional(),
})

/**
 * Check if composition is in use by control definitions
 */
async function checkCompositionInUse(id: number, database: any): Promise<string | null> {
  const inUse = await database
    .select()
    .from(controlDefinition)
    .where(eq(controlDefinition.compositionId, id))
    .limit(1)
    .get()

  if (inUse) {
    return 'Cannot delete composition: it is in use by control definitions'
  }
  return null
}

const compositions = createCrudRoutes({
  table: composition,
  entityName: 'Composition',
  pluralName: 'compositions',
  singularName: 'composition',
  createSchema,
  updateSchema,
  orderBy: composition.label, // Order by label instead of name
  checkInUse: checkCompositionInUse,
})

export default compositions

