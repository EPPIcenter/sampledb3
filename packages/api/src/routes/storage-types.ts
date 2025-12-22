import { Hono } from 'hono'
import { db } from '../db/client'
import { storageType, location } from '../db/schema'
import { eq, and, ne, or } from 'drizzle-orm'
import { z } from 'zod'

const storageTypes = new Hono()

// List all storage types
storageTypes.get('/', async (c) => {
  try {
    const types = await db.select().from(storageType).orderBy(storageType.name)
    return c.json({ storageTypes: types })
  } catch (error: any) {
    console.error('Error fetching storage types:', error)
    return c.json({ error: 'Failed to fetch storage types', details: error.message }, 500)
  }
})

// Get storage type by ID
storageTypes.get('/:id', async (c) => {
  const id = parseInt(c.req.param('id'))
  
  if (isNaN(id)) {
    return c.json({ error: 'Invalid storage type ID' }, 400)
  }

  try {
    const typeRecord = await db
      .select()
      .from(storageType)
      .where(eq(storageType.id, id))
      .get()

    if (!typeRecord) {
      return c.json({ error: 'Storage type not found' }, 404)
    }

    return c.json({ storageType: typeRecord })
  } catch (error: any) {
    console.error('Error fetching storage type:', error)
    return c.json({ error: 'Failed to fetch storage type', details: error.message }, 500)
  }
})

// Create new storage type
storageTypes.post('/', async (c) => {
  try {
    const body = await c.req.json()
    const schema = z.object({
      name: z.string().min(1, 'Name is required'),
      description: z.string().optional(),
    })

    const data = schema.parse(body)

    // Check for duplicate name
    const existing = await db
      .select()
      .from(storageType)
      .where(eq(storageType.name, data.name))
      .get()

    if (existing) {
      return c.json({ error: 'Storage type with this name already exists' }, 400)
    }

    const result = await db.insert(storageType).values(data).returning()

    return c.json({ storageType: result[0] }, 201)
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return c.json({ error: 'Validation error', details: error.issues }, 400)
    }
    console.error('Error creating storage type:', error)
    return c.json({ error: 'Failed to create storage type', details: error.message }, 500)
  }
})

// Update storage type
storageTypes.put('/:id', async (c) => {
  const id = parseInt(c.req.param('id'))
  
  if (isNaN(id)) {
    return c.json({ error: 'Invalid storage type ID' }, 400)
  }

  try {
    const body = await c.req.json()
    const schema = z.object({
      name: z.string().min(1, 'Name is required'),
      description: z.string().optional(),
    })

    const data = schema.parse(body)

    // Check if storage type exists
    const existing = await db
      .select()
      .from(storageType)
      .where(eq(storageType.id, id))
      .get()

    if (!existing) {
      return c.json({ error: 'Storage type not found' }, 404)
    }

    // Check for duplicate name (excluding current type)
    const duplicate = await db
      .select()
      .from(storageType)
      .where(and(eq(storageType.name, data.name), ne(storageType.id, id)))
      .get()

    if (duplicate) {
      return c.json({ error: 'Storage type with this name already exists' }, 400)
    }

    const result = await db
      .update(storageType)
      .set(data)
      .where(eq(storageType.id, id))
      .returning()

    return c.json({ storageType: result[0] })
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return c.json({ error: 'Validation error', details: error.issues }, 400)
    }
    console.error('Error updating storage type:', error)
    return c.json({ error: 'Failed to update storage type', details: error.message }, 500)
  }
})

// Delete storage type
storageTypes.delete('/:id', async (c) => {
  const id = parseInt(c.req.param('id'))
  
  if (isNaN(id)) {
    return c.json({ error: 'Invalid storage type ID' }, 400)
  }

  try {
    // Check if storage type is in use (locations use storageTypeId as text, so we check by name)
    const typeRecord = await db
      .select()
      .from(storageType)
      .where(eq(storageType.id, id))
      .get()

    if (!typeRecord) {
      return c.json({ error: 'Storage type not found' }, 404)
    }

    // Check if any location uses this storage type (check by both ID and name for compatibility)
    const inUse = await db
      .select()
      .from(location)
      .where(or(
        eq(location.storageTypeId, String(typeRecord.id)),
        eq(location.storageTypeId, typeRecord.name)
      ) as any)
      .limit(1)
      .get()

    if (inUse) {
      return c.json({ error: 'Cannot delete storage type: it is in use by locations' }, 400)
    }

    const result = await db
      .delete(storageType)
      .where(eq(storageType.id, id))
      .returning()

    return c.json({ message: 'Storage type deleted successfully' })
  } catch (error: any) {
    console.error('Error deleting storage type:', error)
    return c.json({ error: 'Failed to delete storage type', details: error.message }, 500)
  }
})

export default storageTypes

