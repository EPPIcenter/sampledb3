import { createCrudRoutes } from '../lib/crud-routes'
import { strain, controlDefinition } from '../db/schema'
import { eq } from 'drizzle-orm'
import { z } from 'zod'

const createSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  description: z.string().optional(),
})

/**
 * Check if strain is in use by control definitions
 * Strains are stored in control definitions' properties JSON
 */
async function checkStrainInUse(id: number, database: any): Promise<string | null> {
  // Get all control definitions
  const definitions = await database
    .select()
    .from(controlDefinition)
    .all()

  // Check if any control definition's properties JSON contains this strain ID
  for (const def of definitions) {
    const props = def.properties as any
    if (props?.strains && Array.isArray(props.strains)) {
      const hasStrain = props.strains.some((s: any) => {
        const strainId = typeof s === 'number' ? s : s.id
        return strainId === id
      })
      if (hasStrain) {
        return `Cannot delete strain: it is in use by control definition "${def.name}"`
      }
    }
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

