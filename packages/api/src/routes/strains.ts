import { Hono } from 'hono'
import { db } from '../db/client'
import { strain, compositionStrain } from '../db/schema'
import { eq, and, ne } from 'drizzle-orm'
import { z } from 'zod'

const strains = new Hono()

// List all strains
strains.get('/', async (c) => {
  try {
    const strainsList = await db.select().from(strain).orderBy(strain.name)
    return c.json({ strains: strainsList })
  } catch (error: any) {
    console.error('Error fetching strains:', error)
    return c.json({ error: 'Failed to fetch strains', details: error.message }, 500)
  }
})

// Get strain by ID
strains.get('/:id', async (c) => {
  const id = parseInt(c.req.param('id'))
  
  if (isNaN(id)) {
    return c.json({ error: 'Invalid strain ID' }, 400)
  }

  try {
    const strainRecord = await db
      .select()
      .from(strain)
      .where(eq(strain.id, id))
      .get()

    if (!strainRecord) {
      return c.json({ error: 'Strain not found' }, 404)
    }

    return c.json({ strain: strainRecord })
  } catch (error: any) {
    console.error('Error fetching strain:', error)
    return c.json({ error: 'Failed to fetch strain', details: error.message }, 500)
  }
})

// Create new strain
strains.post('/', async (c) => {
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
      .from(strain)
      .where(eq(strain.name, data.name))
      .get()

    if (existing) {
      return c.json({ error: 'Strain with this name already exists' }, 400)
    }

    const result = await db.insert(strain).values(data).returning()

    return c.json({ strain: result[0] }, 201)
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return c.json({ error: 'Validation error', details: error.issues }, 400)
    }
    console.error('Error creating strain:', error)
    return c.json({ error: 'Failed to create strain', details: error.message }, 500)
  }
})

// Update strain
strains.put('/:id', async (c) => {
  const id = parseInt(c.req.param('id'))
  
  if (isNaN(id)) {
    return c.json({ error: 'Invalid strain ID' }, 400)
  }

  try {
    const body = await c.req.json()
    const schema = z.object({
      name: z.string().min(1, 'Name is required'),
      description: z.string().optional(),
    })

    const data = schema.parse(body)

    // Check if strain exists
    const existing = await db
      .select()
      .from(strain)
      .where(eq(strain.id, id))
      .get()

    if (!existing) {
      return c.json({ error: 'Strain not found' }, 404)
    }

    // Check for duplicate name (excluding current strain)
    const duplicate = await db
      .select()
      .from(strain)
      .where(and(eq(strain.name, data.name), ne(strain.id, id)))
      .get()

    if (duplicate) {
      return c.json({ error: 'Strain with this name already exists' }, 400)
    }

    const result = await db
      .update(strain)
      .set(data)
      .where(eq(strain.id, id))
      .returning()

    return c.json({ strain: result[0] })
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return c.json({ error: 'Validation error', details: error.issues }, 400)
    }
    console.error('Error updating strain:', error)
    return c.json({ error: 'Failed to update strain', details: error.message }, 500)
  }
})

// Delete strain
strains.delete('/:id', async (c) => {
  const id = parseInt(c.req.param('id'))
  
  if (isNaN(id)) {
    return c.json({ error: 'Invalid strain ID' }, 400)
  }

  try {
    // Check if strain is in use
    const inUse = await db
      .select()
      .from(compositionStrain)
      .where(eq(compositionStrain.strainId, id))
      .limit(1)
      .get()

    if (inUse) {
      return c.json({ error: 'Cannot delete strain: it is in use by compositions' }, 400)
    }

    const result = await db
      .delete(strain)
      .where(eq(strain.id, id))
      .returning()

    if (result.length === 0) {
      return c.json({ error: 'Strain not found' }, 404)
    }

    return c.json({ message: 'Strain deleted successfully' })
  } catch (error: any) {
    console.error('Error deleting strain:', error)
    return c.json({ error: 'Failed to delete strain', details: error.message }, 500)
  }
})

export default strains

