import { Hono } from 'hono'
import { db } from '../db/client'
import { cellLine } from '../db/schema'
import { eq } from 'drizzle-orm'

const cellLines = new Hono()

// List all cell lines
cellLines.get('/', async (c) => {
  try {
    const lines = await db.select().from(cellLine).orderBy(cellLine.name)
    return c.json({ cellLines: lines })
  } catch (error: any) {
    console.error('Error fetching cell lines:', error)
    return c.json({ error: 'Failed to fetch cell lines', details: error.message }, 500)
  }
})

// Get cell line by ID
cellLines.get('/:id', async (c) => {
  const id = parseInt(c.req.param('id'))
  
  if (isNaN(id)) {
    return c.json({ error: 'Invalid cell line ID' }, 400)
  }

  try {
    const line = await db
      .select()
      .from(cellLine)
      .where(eq(cellLine.id, id))
      .get()

    if (!line) {
      return c.json({ error: 'Cell line not found' }, 404)
    }

    return c.json({ cellLine: line })
  } catch (error: any) {
    console.error('Error fetching cell line:', error)
    return c.json({ error: 'Failed to fetch cell line', details: error.message }, 500)
  }
})

export default cellLines

