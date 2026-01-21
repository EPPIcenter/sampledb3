import { Hono } from 'hono'
import { z } from 'zod'
import type { Database } from '../db/client'
import { errorLogs } from '../db/schema'
import { logFrontendError, cleanupOldErrorLogs, type ErrorLogContext } from '../lib/error-logger'
import { handleRouteError } from '../lib/error-handler'
import { eq, and, desc, sql, like, or } from 'drizzle-orm'
import { createAdminMiddleware, createAuthMiddleware } from '../middleware/auth'

// Schema for frontend error submission
const frontendErrorSchema = z.object({
  message: z.string(),
  stack: z.string().optional(),
  errorCode: z.string().optional(),
  level: z.enum(['error', 'warning', 'info']).default('error'),
  context: z.record(z.string(), z.unknown()).optional(),
})

// Schema for error log query parameters
const errorLogQuerySchema = z.object({
  source: z.enum(['frontend', 'backend']).optional(),
  level: z.enum(['error', 'warning', 'info']).optional(),
  resolved: z.string().optional().transform((val) => val === 'true'),
  page: z.preprocess((val) => {
    if (val === undefined || val === null || val === '') return undefined
    if (typeof val === 'string') {
      const num = parseInt(val, 10)
      return isNaN(num) ? undefined : num
    }
    return val
  }, z.number().int().positive().optional()),
  limit: z.preprocess((val) => {
    if (val === undefined || val === null || val === '') return undefined
    if (typeof val === 'string') {
      const num = parseInt(val, 10)
      return isNaN(num) ? undefined : Math.min(num, 100)
    }
    return val
  }, z.number().int().positive().max(100).optional()),
  search: z.string().optional(),
})

/**
 * Create error logs routes
 */
export function createErrorLogsRoutes(database: Database): Hono {
  const errorLogsRoutes = new Hono()
  const authMiddleware = createAuthMiddleware(database)
  const adminMiddleware = createAdminMiddleware(database)

  // POST /api/error-logs - Accept frontend error reports
  errorLogsRoutes.post('/', authMiddleware, async (c) => {
    try {
      const body = await c.req.json()
      const errorData = frontendErrorSchema.parse(body)
      
      // Extract context from request
      const user = c.get('user')!
      const url = c.req.header('referer') || c.req.url
      const userAgent = c.req.header('user-agent')
      
      const errorContext: ErrorLogContext = {
        userId: user?.id,
        url,
        userAgent,
        additionalContext: {
          ...errorData.context,
          pageUrl: url,
        },
      }
      
      // Log the error
      await logFrontendError(
        database,
        errorData.level,
        errorData.message,
        errorData.stack ? new Error(errorData.message) : errorData.message,
        errorContext
      )
      
      return c.json({ success: true }, 201)
    } catch (error) {
      return handleRouteError(error, c)
    }
  })

  // GET /api/error-logs - Retrieve error logs with filtering and pagination
  errorLogsRoutes.get('/', adminMiddleware, async (c) => {
    try {
      const queryParams = errorLogQuerySchema.parse(c.req.query())
      const { source, level, resolved, page, limit, search } = queryParams
      
      // Build query
      let query = database.select().from(errorLogs)
      
      // Apply filters
      const conditions = []
      if (source) {
        conditions.push(eq(errorLogs.source, source))
      }
      if (level) {
        conditions.push(eq(errorLogs.level, level))
      }
      if (resolved !== undefined) {
        conditions.push(eq(errorLogs.resolved, resolved))
      }
      if (search) {
        conditions.push(
          or(
            like(errorLogs.message, `%${search}%`),
            like(errorLogs.errorCode, `%${search}%`)
          )!
        )
      }
      
      if (conditions.length > 0) {
        query = query.where(and(...conditions)) as any
      }
      
      // Order by timestamp descending (newest first)
      query = query.orderBy(desc(errorLogs.timestamp)) as any
      
      // Get total count for pagination
      let countQuery = database
        .select({ count: sql<number>`count(*)` })
        .from(errorLogs)
      
      if (conditions.length > 0) {
        countQuery = countQuery.where(and(...conditions)) as any
      }
      
      const [{ count: totalCount }] = await countQuery
      
      // Apply pagination only if provided
      const returnAll = page === undefined && limit === undefined
      if (!returnAll && page !== undefined && limit !== undefined) {
        const offset = (page - 1) * limit
        query = query.limit(limit).offset(offset) as any
      }
      
      const logs = await query
      
      return c.json({
        logs,
        pagination: returnAll ? undefined : {
          page: page || 1,
          limit: limit || 50,
          total: totalCount,
          totalPages: Math.ceil(totalCount / (limit || 50)),
        },
      })
    } catch (error) {
      return handleRouteError(error, c)
    }
  })

  // GET /api/error-logs/:id - Get a specific error log
  errorLogsRoutes.get('/:id', adminMiddleware, async (c) => {
    try {
      const id = parseInt(c.req.param('id'))
      
      if (isNaN(id)) {
        return c.json({ error: 'Invalid error log ID' }, 400)
      }
      
      const log = await database
        .select()
        .from(errorLogs)
        .where(eq(errorLogs.id, id))
        .get()
      
      if (!log) {
        return c.json({ error: 'Error log not found' }, 404)
      }
      
      return c.json(log)
    } catch (error) {
      return handleRouteError(error, c)
    }
  })

  // PATCH /api/error-logs/:id/resolve - Mark error as resolved
  errorLogsRoutes.patch('/:id/resolve', adminMiddleware, async (c) => {
    try {
      const id = parseInt(c.req.param('id'))
      
      if (isNaN(id)) {
        return c.json({ error: 'Invalid error log ID' }, 400)
      }
      
      const user = c.get('user')!
      
      const log = await database
        .select()
        .from(errorLogs)
        .where(eq(errorLogs.id, id))
        .get()
      
      if (!log) {
        return c.json({ error: 'Error log not found' }, 404)
      }
      
      await database
        .update(errorLogs)
        .set({
          resolved: true,
          resolvedAt: new Date().toISOString(),
          resolvedBy: user.id,
        })
        .where(eq(errorLogs.id, id))
      
      return c.json({ success: true })
    } catch (error) {
      return handleRouteError(error, c)
    }
  })

  // POST /api/error-logs/cleanup - Clean up old error logs based on retention policy
  errorLogsRoutes.post('/cleanup', adminMiddleware, async (c) => {
    try {
      const user = c.get('user')!
      
      // Optional retention days override in request body
      let retentionDays: number | undefined = undefined
      try {
        const body = await c.req.json()
        if (body && typeof body.retentionDays !== 'undefined') {
          retentionDays = parseInt(String(body.retentionDays), 10)
          if (isNaN(retentionDays) || retentionDays < 0) {
            return c.json({ error: 'Invalid retentionDays value. Must be a positive number.' }, 400)
          }
        }
      } catch {
        // No body provided, use default from env var
      }
      
      const result = await cleanupOldErrorLogs(database, retentionDays)
      
      return c.json({
        success: true,
        deleted: result.deleted,
        retentionDays: result.retentionDays,
        message: `Deleted ${result.deleted} error log(s) older than ${result.retentionDays} days`,
      })
    } catch (error) {
      return handleRouteError(error, c)
    }
  })

  return errorLogsRoutes
}
