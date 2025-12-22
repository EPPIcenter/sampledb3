import { Hono } from 'hono'
import { db } from '../db/client'
import { storageContainer, micronixPlate, cryovialBox } from '../db/schema'
import { eq, inArray, sql } from 'drizzle-orm'
import { z } from 'zod'

const bulk = new Hono()

// Bulk move containers
bulk.post('/containers/move', async (c) => {
  try {
    const body = await c.req.json()
    const schema = z.object({
      containerIds: z.array(z.number().int()),
      locationId: z.number().int(),
    })
    
    const data = schema.parse(body)
    
    // Update micronix plates
    await db
      .update(micronixPlate)
      .set({
        locationId: data.locationId,
        lastUpdated: new Date().toISOString(),
      })
      .where(inArray(micronixPlate.id, data.containerIds))
    
    // Update cryovial boxes
    await db
      .update(cryovialBox)
      .set({
        locationId: data.locationId,
        lastUpdated: new Date().toISOString(),
      })
      .where(inArray(cryovialBox.id, data.containerIds))
    
    return c.json({ success: true, moved: data.containerIds.length })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return c.json({ error: 'Invalid input', details: error.issues }, 400)
    }
    return c.json({ error: 'Internal server error' }, 500)
  }
})

// Bulk update container states
bulk.patch('/containers/state', async (c) => {
  try {
    const body = await c.req.json()
    const schema = z.object({
      containerIds: z.array(z.number().int()),
      stateId: z.number().int().optional(),
    })
    
    const data = schema.parse(body)
    
    const updateData: any = {
      lastUpdated: new Date().toISOString(),
    }
    
    if (data.stateId !== undefined) {
      updateData.stateId = data.stateId
    }
    
    await db
      .update(storageContainer)
      .set(updateData)
      .where(inArray(storageContainer.id, data.containerIds))
    
    return c.json({ success: true, updated: data.containerIds.length })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return c.json({ error: 'Invalid input', details: error.issues }, 400)
    }
    return c.json({ error: 'Internal server error' }, 500)
  }
})

export default bulk
