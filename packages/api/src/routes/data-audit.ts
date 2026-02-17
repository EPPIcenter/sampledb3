import { Hono } from 'hono'
import { z } from 'zod'
import type { Database } from '../db/client'
import { createAdminMiddleware } from '../middleware/auth'
import { handleRouteError } from '../lib/error-handler'
import { listEmptyCollections, deleteEmptyCollections, getIntegrityReport } from '../lib/data-audit'

const deleteBodySchema = z.object({
  ids: z.object({
    micronix_plate: z.array(z.number().int().positive()).optional(),
    cryovial_box: z.array(z.number().int().positive()).optional(),
    box: z.array(z.number().int().positive()).optional(),
    bag: z.array(z.number().int().positive()).optional(),
  }),
})

/**
 * Create data audit routes (admin-only).
 */
export function createDataAuditRoutes(database: Database): Hono {
  const routes = new Hono()
  const adminMiddleware = createAdminMiddleware(database)

  routes.get('/empty-collections', adminMiddleware, async (c) => {
    try {
      const collections = await listEmptyCollections(database)
      return c.json({ collections })
    } catch (error) {
      return handleRouteError(error, c)
    }
  })

  routes.get('/integrity-report', adminMiddleware, async (c) => {
    try {
      const report = await getIntegrityReport(database)
      return c.json(report)
    } catch (error) {
      return handleRouteError(error, c)
    }
  })

  routes.post('/empty-collections/delete', adminMiddleware, async (c) => {
    try {
      const body = await c.req.json()
      const parsed = deleteBodySchema.parse(body)
      const result = await deleteEmptyCollections(database, parsed)
      return c.json({
        deleted: result.deleted,
        ...(result.errors.length > 0 ? { errors: result.errors } : {}),
      })
    } catch (error) {
      return handleRouteError(error, c)
    }
  })

  return routes
}
