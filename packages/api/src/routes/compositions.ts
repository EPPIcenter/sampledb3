import { Hono } from 'hono'
import { db } from '../db/client'
import { composition, controlDefinition } from '../db/schema'
import { eq } from 'drizzle-orm'
import { z } from 'zod'

const compositions = new Hono()

// List all compositions
compositions.get('/', async (c) => {
  try {
    const compositionsList = await db.select().from(composition).orderBy(composition.label)
    return c.json({ compositions: compositionsList })
  } catch (error: any) {
    console.error('Error fetching compositions:', error)
    return c.json({ error: 'Failed to fetch compositions', details: error.message }, 500)
  }
})

// Get composition by ID
compositions.get('/:id', async (c) => {
  const id = parseInt(c.req.param('id'))
  
  if (isNaN(id)) {
    return c.json({ error: 'Invalid composition ID' }, 400)
  }

  try {
    const compositionRecord = await db
      .select()
      .from(composition)
      .where(eq(composition.id, id))
      .get()

    if (!compositionRecord) {
      return c.json({ error: 'Composition not found' }, 404)
    }

    return c.json({ composition: compositionRecord })
  } catch (error: any) {
    console.error('Error fetching composition:', error)
    return c.json({ error: 'Failed to fetch composition', details: error.message }, 500)
  }
})

// Create new composition
compositions.post('/', async (c) => {
  try {
    const body = await c.req.json()
    const schema = z.object({
      index: z.number().int().optional(),
      label: z.string().min(1, 'Label is required'),
      legacy: z.number().int().default(0),
    })

    const data = schema.parse(body)

    const result = await db.insert(composition).values(data).returning()

    return c.json({ composition: result[0] }, 201)
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return c.json({ error: 'Validation error', details: error.issues }, 400)
    }
    console.error('Error creating composition:', error)
    return c.json({ error: 'Failed to create composition', details: error.message }, 500)
  }
})

// Update composition
compositions.put('/:id', async (c) => {
  const id = parseInt(c.req.param('id'))
  
  if (isNaN(id)) {
    return c.json({ error: 'Invalid composition ID' }, 400)
  }

  try {
    const body = await c.req.json()
    const schema = z.object({
      index: z.number().int().optional(),
      label: z.string().min(1, 'Label is required'),
      legacy: z.number().int().optional(),
    })

    const data = schema.parse(body)

    // Check if composition exists
    const existing = await db
      .select()
      .from(composition)
      .where(eq(composition.id, id))
      .get()

    if (!existing) {
      return c.json({ error: 'Composition not found' }, 404)
    }

    const result = await db
      .update(composition)
      .set(data)
      .where(eq(composition.id, id))
      .returning()

    return c.json({ composition: result[0] })
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return c.json({ error: 'Validation error', details: error.issues }, 400)
    }
    console.error('Error updating composition:', error)
    return c.json({ error: 'Failed to update composition', details: error.message }, 500)
  }
})

// Delete composition
compositions.delete('/:id', async (c) => {
  const id = parseInt(c.req.param('id'))
  
  if (isNaN(id)) {
    return c.json({ error: 'Invalid composition ID' }, 400)
  }

  try {
    // Check if composition is in use
    const inUse = await db
      .select()
      .from(controlDefinition)
      .where(eq(controlDefinition.compositionId, id))
      .limit(1)
      .get()

    if (inUse) {
      return c.json({ error: 'Cannot delete composition: it is in use by control definitions' }, 400)
    }

    const result = await db
      .delete(composition)
      .where(eq(composition.id, id))
      .returning()

    if (result.length === 0) {
      return c.json({ error: 'Composition not found' }, 404)
    }

    return c.json({ message: 'Composition deleted successfully' })
  } catch (error: any) {
    console.error('Error deleting composition:', error)
    return c.json({ error: 'Failed to delete composition', details: error.message }, 500)
  }
})

export default compositions

