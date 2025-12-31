import { createCrudRoutes } from '../lib/crud-routes'
import { strain, compositionStrain } from '../db/schema'
import { eq } from 'drizzle-orm'
import { z } from 'zod'

const createSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  description: z.string().optional(),
})

/**
 * Check if strain is in use by compositions
 */
async function checkStrainInUse(id: number, database: any): Promise<string | null> {
  const inUse = await database
    .select()
    .from(compositionStrain)
    .where(eq(compositionStrain.strainId, id))
    .limit(1)
    .get()

  if (inUse) {
    return 'Cannot delete strain: it is in use by compositions'
  }
  return null
}

const strains = createCrudRoutes({
  table: strain,
  entityName: 'Strain',
  pluralName: 'strains',
  singularName: 'strain',
  createSchema,
  checkInUse: checkStrainInUse,
})

export default strains

