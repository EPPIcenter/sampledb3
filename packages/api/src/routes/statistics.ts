import { Hono } from 'hono'
import type { Database } from '../db/client'
import { getAdminStatistics } from '../lib/statistics/admin-stats'
import { getDashboardStatistics } from '../lib/statistics/dashboard-stats'
import { parseStatisticsFilters } from '../lib/statistics/parse-filters'
import { handleRouteError } from '../lib/error-handler'
import { createAdminMiddleware, createAuthMiddleware } from '../middleware/auth'

/** Create statistics routes with database injection. */
export function createStatisticsRoutes(database: Database) {
  const statistics = new Hono()
  const authMiddleware = createAuthMiddleware(database)
  const adminMiddleware = createAdminMiddleware(database)

  statistics.get('/', authMiddleware, async (c) => {
    try {
      const filters = parseStatisticsFilters(c)
      const data = await getDashboardStatistics(database, filters)
      return c.json(data)
    } catch (error: unknown) {
      return handleRouteError(error, c)
    }
  })

  statistics.get('/admin', adminMiddleware, async (c) => {
    try {
      const data = await getAdminStatistics(database)
      return c.json(data)
    } catch (error: unknown) {
      return handleRouteError(error, c)
    }
  })

  return statistics
}
