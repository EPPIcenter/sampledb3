import { Hono } from 'hono'
import { db } from '../db/client'
import { sampleType } from '../db/schema'
import { eq, and, ne } from 'drizzle-orm'
import { z } from 'zod'

const sampleTypes = new Hono()

// List all sample types
sampleTypes.get('/', async (c) => {
  try {
    const types = await db.select().from(sampleType).orderBy(sampleType.name)
    return c.json({ sampleTypes: types })
  } catch (error: any) {
    console.error('Error fetching sample types:', error)
    return c.json({ error: 'Failed to fetch sample types', details: error.message }, 500)
  }
})

// Get sample type by ID
sampleTypes.get('/:id', async (c) => {
  const id = parseInt(c.req.param('id'))
  
  if (isNaN(id)) {
    return c.json({ error: 'Invalid sample type ID' }, 400)
  }

  try {
    const typeRecord = await db
      .select()
      .from(sampleType)
      .where(eq(sampleType.id, id))
      .get()

    if (!typeRecord) {
      return c.json({ error: 'Sample type not found' }, 404)
    }

    return c.json({ sampleType: typeRecord })
  } catch (error: any) {
    console.error('Error fetching sample type:', error)
    return c.json({ error: 'Failed to fetch sample type', details: error.message }, 500)
  }
})

// Create new sample type
sampleTypes.post('/', async (c) => {
  try {
    const body = await c.req.json()
    const schema = z.object({
      name: z.string().min(1, 'Name is required'),
      description: z.string().optional(),
      parentId: z.number().int().optional(),
    })

    const data = schema.parse(body)

    // Check for duplicate name
    const existing = await db
      .select()
      .from(sampleType)
      .where(eq(sampleType.name, data.name))
      .get()

    if (existing) {
      return c.json({ error: 'Sample type with this name already exists' }, 400)
    }

    // Validate parentId if provided
    if (data.parentId) {
      const parent = await db
        .select()
        .from(sampleType)
        .where(eq(sampleType.id, data.parentId))
        .get()

      if (!parent) {
        return c.json({ error: 'Parent sample type not found' }, 400)
      }
    }

    const result = await db.insert(sampleType).values(data).returning()

    return c.json({ sampleType: result[0] }, 201)
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return c.json({ error: 'Validation error', details: error.issues }, 400)
    }
    console.error('Error creating sample type:', error)
    return c.json({ error: 'Failed to create sample type', details: error.message }, 500)
  }
})

// Update sample type
sampleTypes.put('/:id', async (c) => {
  const id = parseInt(c.req.param('id'))
  
  if (isNaN(id)) {
    return c.json({ error: 'Invalid sample type ID' }, 400)
  }

  try {
    const body = await c.req.json()
    const schema = z.object({
      name: z.string().min(1, 'Name is required'),
      description: z.string().optional(),
      parentId: z.number().int().optional().nullable(),
    })

    const data = schema.parse(body)

    // Check if sample type exists
    const existing = await db
      .select()
      .from(sampleType)
      .where(eq(sampleType.id, id))
      .get()

    if (!existing) {
      return c.json({ error: 'Sample type not found' }, 404)
    }

    // Check for duplicate name (excluding current type)
    const duplicate = await db
      .select()
      .from(sampleType)
      .where(and(eq(sampleType.name, data.name), ne(sampleType.id, id)))
      .get()

    if (duplicate) {
      return c.json({ error: 'Sample type with this name already exists' }, 400)
    }

    // Validate parentId if provided (and not null)
    if (data.parentId !== undefined && data.parentId !== null) {
      if (data.parentId === id) {
        return c.json({ error: 'Sample type cannot be its own parent' }, 400)
      }
      const parent = await db
        .select()
        .from(sampleType)
        .where(eq(sampleType.id, data.parentId))
        .get()

      if (!parent) {
        return c.json({ error: 'Parent sample type not found' }, 400)
      }
    }

    const result = await db
      .update(sampleType)
      .set(data)
      .where(eq(sampleType.id, id))
      .returning()

    return c.json({ sampleType: result[0] })
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return c.json({ error: 'Validation error', details: error.issues }, 400)
    }
    console.error('Error updating sample type:', error)
    return c.json({ error: 'Failed to update sample type', details: error.message }, 500)
  }
})

// Delete sample type
sampleTypes.delete('/:id', async (c) => {
  const id = parseInt(c.req.param('id'))
  
  if (isNaN(id)) {
    return c.json({ error: 'Invalid sample type ID' }, 400)
  }

  try {
    // Check if sample type has children
    const children = await db
      .select()
      .from(sampleType)
      .where(eq(sampleType.parentId, id))
      .limit(1)
      .get()

    if (children) {
      return c.json({ error: 'Cannot delete sample type: it has child sample types' }, 400)
    }

    const result = await db
      .delete(sampleType)
      .where(eq(sampleType.id, id))
      .returning()

    if (result.length === 0) {
      return c.json({ error: 'Sample type not found' }, 404)
    }

    return c.json({ message: 'Sample type deleted successfully' })
  } catch (error: any) {
    console.error('Error deleting sample type:', error)
    return c.json({ error: 'Failed to delete sample type', details: error.message }, 500)
  }
})

export default sampleTypes

