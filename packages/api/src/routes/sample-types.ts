import { createCrudRoutes } from '../lib/crud-routes'
import { sampleType } from '../db/schema'
import { eq } from 'drizzle-orm'
import { z } from 'zod'

const createSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  description: z.string().optional(),
  parentId: z.number().int().optional(),
})

const updateSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  description: z.string().optional(),
  parentId: z.number().int().optional().nullable(),
})

/**
 * Validate parentId on create
 */
async function validateCreate(data: any, database: any): Promise<string | null> {
  if (data.parentId) {
    const parent = await database
      .select()
      .from(sampleType)
      .where(eq(sampleType.id, data.parentId))
      .get()

    if (!parent) {
      return 'Parent sample type not found'
    }
  }
  return null
}

/**
 * Validate parentId on update
 */
async function validateUpdate(id: number, data: any, database: any): Promise<string | null> {
  if (data.parentId !== undefined && data.parentId !== null) {
    if (data.parentId === id) {
      return 'Sample type cannot be its own parent'
    }
    const parent = await database
      .select()
      .from(sampleType)
      .where(eq(sampleType.id, data.parentId))
      .get()

    if (!parent) {
      return 'Parent sample type not found'
    }
  }
  return null
}

/**
 * Check if sample type has children
 */
async function checkSampleTypeInUse(id: number, database: any): Promise<string | null> {
  const children = await database
    .select()
    .from(sampleType)
    .where(eq(sampleType.parentId, id))
    .limit(1)
    .get()

  if (children) {
    return 'Cannot delete sample type: it has child sample types'
  }
  return null
}

const sampleTypes = createCrudRoutes({
  table: sampleType,
  entityName: 'Sample type',
  pluralName: 'sampleTypes',
  singularName: 'sampleType',
  createSchema,
  updateSchema,
  validateCreate,
  validateUpdate,
  checkInUse: checkSampleTypeInUse,
})

export default sampleTypes

