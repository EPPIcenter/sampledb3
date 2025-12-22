import { Hono } from 'hono'
import { db } from '../db/client'
import { specimen, study, storageContainer } from '../db/schema'
import { sql } from 'drizzle-orm'

const activity = new Hono()

// Get recent activity across all entity types
activity.get('/recent', async (c) => {
  try {
    const limit = parseInt(c.req.query('limit') || '10')
    
    // Get recent specimens
    const recentSpecimens = await db
      .select({
        id: specimen.id,
        type: sql<string>`'specimen'`.as('type'),
        created: specimen.created,
        lastUpdated: specimen.lastUpdated,
      })
      .from(specimen)
      .orderBy(sql`COALESCE(${specimen.lastUpdated}, ${specimen.created}) DESC`)
      .limit(limit)
    
    // Get recent studies
    const recentStudies = await db
      .select({
        id: study.id,
        type: sql<string>`'study'`.as('type'),
        created: study.created,
        lastUpdated: study.lastUpdated,
      })
      .from(study)
      .orderBy(sql`COALESCE(${study.lastUpdated}, ${study.created}) DESC`)
      .limit(limit)
    
    // Get recent containers
    const recentContainers = await db
      .select({
        id: storageContainer.id,
        type: sql<string>`'container'`.as('type'),
        created: storageContainer.created,
        lastUpdated: storageContainer.lastUpdated,
      })
      .from(storageContainer)
      .orderBy(sql`COALESCE(${storageContainer.lastUpdated}, ${storageContainer.created}) DESC`)
      .limit(limit)
    
    // Combine and sort by timestamp
    const allActivity = [
      ...recentSpecimens.map(s => ({ ...s, timestamp: s.lastUpdated || s.created || '' })),
      ...recentStudies.map(s => ({ ...s, timestamp: s.lastUpdated || s.created || '' })),
      ...recentContainers.map(c => ({ ...c, timestamp: c.lastUpdated || c.created || '' })),
    ]
      .filter(item => item.timestamp) // Filter out items without timestamps
      .sort((a, b) => {
        const timeA = new Date(a.timestamp).getTime()
        const timeB = new Date(b.timestamp).getTime()
        return timeB - timeA
      })
      .slice(0, limit)
    
    return c.json({ activity: allActivity })
  } catch (error: any) {
    console.error('Error fetching recent activity:', error)
    return c.json({ error: 'Failed to fetch recent activity', details: error.message }, 500)
  }
})

export default activity
