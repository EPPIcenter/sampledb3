import { createCrudRoutes } from '../lib/crud-routes'
import { specimenType, specimen } from '../db/schema'
import { eq } from 'drizzle-orm'
import { z } from 'zod'

const createSchema = z.object({
  name: z.string().min(1, 'Name is required'),
})

/**
 * Transform list response to include only specific fields
 */
function transformList(item: any) {
  return {
    id: item.id,
    name: item.name,
    created: item.created,
    lastUpdated: item.lastUpdated,
  }
}

/**
 * Check if specimen type is in use by specimens
 */
async function checkSpecimenTypeInUse(id: number, database: any): Promise<string | null> {
  const inUse = await database
    .select()
    .from(specimen)
    .where(eq(specimen.specimenTypeId, id))
    .limit(1)
    .get()

  if (inUse) {
    return 'Cannot delete specimen type: it is in use by specimens'
  }
  return null
}

/**
 * Set created and lastUpdated timestamps on create
 */
function onCreateDefaults() {
  const now = new Date().toISOString()
  return {
    created: now,
    lastUpdated: now,
  }
}

/**
 * Update lastUpdated timestamp on update
 */
function onUpdateDefaults() {
  return {
    lastUpdated: new Date().toISOString(),
  }
}

const specimenTypes = createCrudRoutes({
  table: specimenType,
  entityName: 'Specimen type',
  pluralName: 'specimenTypes',
  singularName: 'specimenType',
  createSchema,
  transformList,
  checkInUse: checkSpecimenTypeInUse,
  onCreateDefaults,
  onUpdateDefaults,
})

export default specimenTypes


