import { Hono } from 'hono'
import { db } from '../db/client'
import { specimenType, specimen } from '../db/schema'
import { eq, and, ne } from 'drizzle-orm'
import { z } from 'zod'

const specimenTypes = new Hono()

// List specimen types
specimenTypes.get('/', async (c) => {
  try {
    const types = await db.select().from(specimenType).orderBy(specimenType.name)

    return c.json({
      specimenTypes: types.map((t) => ({
        id: t.id,
        name: t.name,
        created: t.created,
        lastUpdated: t.lastUpdated,
      })),
    })
  } catch (error: any) {
    console.error('Error fetching specimen types:', error)
    return c.json({ error: 'Failed to fetch specimen types', details: error.message }, 500)
  }
})

// Get specimen type by ID
specimenTypes.get('/:id', async (c) => {
  const id = parseInt(c.req.param('id'))
  
  if (isNaN(id)) {
    return c.json({ error: 'Invalid specimen type ID' }, 400)
  }

  try {
    const typeRecord = await db
      .select()
      .from(specimenType)
      .where(eq(specimenType.id, id))
      .get()

    if (!typeRecord) {
      return c.json({ error: 'Specimen type not found' }, 404)
    }

    return c.json({ specimenType: typeRecord })
  } catch (error: any) {
    console.error('Error fetching specimen type:', error)
    return c.json({ error: 'Failed to fetch specimen type', details: error.message }, 500)
  }
})

// Create new specimen type
specimenTypes.post('/', async (c) => {
  try {
    const body = await c.req.json()
    const schema = z.object({
      name: z.string().min(1, 'Name is required'),
    })

    const data = schema.parse(body)

    // Check for duplicate name
    const existing = await db
      .select()
      .from(specimenType)
      .where(eq(specimenType.name, data.name))
      .get()

    if (existing) {
      return c.json({ error: 'Specimen type with this name already exists' }, 400)
    }

    const now = new Date().toISOString()
    const result = await db
      .insert(specimenType)
      .values({
        name: data.name,
        created: now,
        lastUpdated: now,
      })
      .returning()

    return c.json({ specimenType: result[0] }, 201)
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return c.json({ error: 'Validation error', details: error.issues }, 400)
    }
    console.error('Error creating specimen type:', error)
    return c.json({ error: 'Failed to create specimen type', details: error.message }, 500)
  }
})

// Update specimen type
specimenTypes.put('/:id', async (c) => {
  const id = parseInt(c.req.param('id'))
  
  if (isNaN(id)) {
    return c.json({ error: 'Invalid specimen type ID' }, 400)
  }

  try {
    const body = await c.req.json()
    const schema = z.object({
      name: z.string().min(1, 'Name is required'),
    })

    const data = schema.parse(body)

    // Check if specimen type exists
    const existing = await db
      .select()
      .from(specimenType)
      .where(eq(specimenType.id, id))
      .get()

    if (!existing) {
      return c.json({ error: 'Specimen type not found' }, 404)
    }

    // Check for duplicate name (excluding current type)
    const duplicate = await db
      .select()
      .from(specimenType)
      .where(and(eq(specimenType.name, data.name), ne(specimenType.id, id)))
      .get()

    if (duplicate) {
      return c.json({ error: 'Specimen type with this name already exists' }, 400)
    }

    const result = await db
      .update(specimenType)
      .set({
        name: data.name,
        lastUpdated: new Date().toISOString(),
      })
      .where(eq(specimenType.id, id))
      .returning()

    return c.json({ specimenType: result[0] })
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return c.json({ error: 'Validation error', details: error.issues }, 400)
    }
    console.error('Error updating specimen type:', error)
    return c.json({ error: 'Failed to update specimen type', details: error.message }, 500)
  }
})

// Delete specimen type
specimenTypes.delete('/:id', async (c) => {
  const id = parseInt(c.req.param('id'))
  
  if (isNaN(id)) {
    return c.json({ error: 'Invalid specimen type ID' }, 400)
  }

  try {
    // Check if specimen type is in use
    const inUse = await db
      .select()
      .from(specimen)
      .where(eq(specimen.specimenTypeId, id))
      .limit(1)
      .get()

    if (inUse) {
      return c.json({ error: 'Cannot delete specimen type: it is in use by specimens' }, 400)
    }

    const result = await db
      .delete(specimenType)
      .where(eq(specimenType.id, id))
      .returning()

    if (result.length === 0) {
      return c.json({ error: 'Specimen type not found' }, 404)
    }

    return c.json({ message: 'Specimen type deleted successfully' })
  } catch (error: any) {
    console.error('Error deleting specimen type:', error)
    return c.json({ error: 'Failed to delete specimen type', details: error.message }, 500)
  }
})

export default specimenTypes


