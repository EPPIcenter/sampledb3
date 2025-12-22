import { Hono } from 'hono'
import { db } from '../db/client'
import { state, storageContainer } from '../db/schema'
import { eq, and, ne } from 'drizzle-orm'
import { z } from 'zod'

const states = new Hono()

// List all states
states.get('/', async (c) => {
  try {
    const statesList = await db.select().from(state).orderBy(state.name)
    return c.json({ states: statesList })
  } catch (error: any) {
    console.error('Error fetching states:', error)
    return c.json({ error: 'Failed to fetch states', details: error.message }, 500)
  }
})

// Get state by ID
states.get('/:id', async (c) => {
  const id = parseInt(c.req.param('id'))
  
  if (isNaN(id)) {
    return c.json({ error: 'Invalid state ID' }, 400)
  }

  try {
    const stateRecord = await db
      .select()
      .from(state)
      .where(eq(state.id, id))
      .get()

    if (!stateRecord) {
      return c.json({ error: 'State not found' }, 404)
    }

    return c.json({ state: stateRecord })
  } catch (error: any) {
    console.error('Error fetching state:', error)
    return c.json({ error: 'Failed to fetch state', details: error.message }, 500)
  }
})

// Create new state
states.post('/', async (c) => {
  try {
    const body = await c.req.json()
    const schema = z.object({
      name: z.string().min(1, 'Name is required'),
    })

    const data = schema.parse(body)

    // Check for duplicate name
    const existing = await db
      .select()
      .from(state)
      .where(eq(state.name, data.name))
      .get()

    if (existing) {
      return c.json({ error: 'State with this name already exists' }, 400)
    }

    const result = await db.insert(state).values(data).returning()

    return c.json({ state: result[0] }, 201)
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return c.json({ error: 'Validation error', details: error.issues }, 400)
    }
    console.error('Error creating state:', error)
    return c.json({ error: 'Failed to create state', details: error.message }, 500)
  }
})

// Update state
states.put('/:id', async (c) => {
  const id = parseInt(c.req.param('id'))
  
  if (isNaN(id)) {
    return c.json({ error: 'Invalid state ID' }, 400)
  }

  try {
    const body = await c.req.json()
    const schema = z.object({
      name: z.string().min(1, 'Name is required'),
    })

    const data = schema.parse(body)

    // Check if state exists
    const existing = await db
      .select()
      .from(state)
      .where(eq(state.id, id))
      .get()

    if (!existing) {
      return c.json({ error: 'State not found' }, 404)
    }

    // Check for duplicate name (excluding current state)
    const duplicate = await db
      .select()
      .from(state)
      .where(and(eq(state.name, data.name), ne(state.id, id)))
      .get()

    if (duplicate) {
      return c.json({ error: 'State with this name already exists' }, 400)
    }

    const result = await db
      .update(state)
      .set(data)
      .where(eq(state.id, id))
      .returning()

    return c.json({ state: result[0] })
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return c.json({ error: 'Validation error', details: error.issues }, 400)
    }
    console.error('Error updating state:', error)
    return c.json({ error: 'Failed to update state', details: error.message }, 500)
  }
})

// Delete state
states.delete('/:id', async (c) => {
  const id = parseInt(c.req.param('id'))
  
  if (isNaN(id)) {
    return c.json({ error: 'Invalid state ID' }, 400)
  }

  try {
    // Check if state is in use
    const inUse = await db
      .select()
      .from(storageContainer)
      .where(eq(storageContainer.stateId, id))
      .limit(1)
      .get()

    if (inUse) {
      return c.json({ error: 'Cannot delete state: it is in use by storage containers' }, 400)
    }

    const result = await db
      .delete(state)
      .where(eq(state.id, id))
      .returning()

    if (result.length === 0) {
      return c.json({ error: 'State not found' }, 404)
    }

    return c.json({ message: 'State deleted successfully' })
  } catch (error: any) {
    console.error('Error deleting state:', error)
    return c.json({ error: 'Failed to delete state', details: error.message }, 500)
  }
})

export default states

