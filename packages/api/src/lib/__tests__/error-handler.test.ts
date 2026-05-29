import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { Hono } from 'hono'
import { z } from 'zod'
import {
  handleRouteError,
  UnauthorizedError,
  ExpectedNotFoundError,
  NotFoundError,
  ConflictError,
  ValidationError,
  RouteError,
  searchFailedBody,
  containersFetchFailedBody,
} from '../error-handler'
import { setupTestDatabase, cleanupTestDatabase } from '../../__tests__/helpers/db-setup'
import { errorLogs } from '../../db/schema'
import { eq } from 'drizzle-orm'
import type { Database } from '../../db/client'

describe('error-handler', () => {
  let testDb: Database
  let sqlite: Awaited<ReturnType<typeof setupTestDatabase>>['sqlite']

  beforeEach(async () => {
    const setup = await setupTestDatabase()
    testDb = setup.db
    sqlite = setup.sqlite
  })

  afterEach(() => {
    if (sqlite) {
      cleanupTestDatabase(sqlite)
    }
  })

  function createAppWithError(error: unknown): Hono {
    const app = new Hono()
    app.use('*', (c, next) => {
      c.set('db', testDb)
      return next()
    })
    app.get('/test', () => {
      throw error
    })
    app.onError((err, c) => handleRouteError(err, c))
    return app
  }

  /** Minimal mock context for testing handleRouteError directly (avoids Hono throw/onError behavior). */
  function createMockContext(): Parameters<typeof handleRouteError>[1] {
    return {
      get: (key: string) => (key === 'db' ? testDb : undefined),
      set: () => {},
      req: {
        url: 'http://localhost/test',
        method: 'GET',
        header: () => undefined,
      },
      json: (body: unknown, status?: number) =>
        new Response(JSON.stringify(body), {
          status: status ?? 200,
          headers: { 'Content-Type': 'application/json' },
        }),
    } as unknown as Parameters<typeof handleRouteError>[1]
  }

  async function getJson(res: Response): Promise<Record<string, unknown>> {
    return (await res.json()) as Record<string, unknown>
  }

  describe('handleRouteError', () => {
    it('returns 401 and UNAUTHORIZED for UnauthorizedError', async () => {
      const app = createAppWithError(new UnauthorizedError('No session ID provided'))
      const res = await app.request('http://localhost/test')
      expect(res.status).toBe(401)
      const data = await getJson(res)
      expect(data.error).toBe('No session ID provided')
      expect(data.errorCode).toBe('UNAUTHORIZED')
    })

    it('returns 404 and NOT_FOUND for NotFoundError', async () => {
      const app = createAppWithError(new NotFoundError('Study', 42))
      const res = await app.request('http://localhost/test')
      expect(res.status).toBe(404)
      const data = await getJson(res)
      expect((data.error as string)).toContain('not found')
      expect(data.errorCode).toBe('NOT_FOUND')
    })

    it('returns 404 for ExpectedNotFoundError without persisting to error_logs', async () => {
      const app = createAppWithError(new ExpectedNotFoundError('Study not found'))
      const res = await app.request('http://localhost/test')
      expect(res.status).toBe(404)
      const data = await getJson(res)
      expect(data.error).toBe('Study not found')
      expect(data.errorCode).toBe('NOT_FOUND')

      await new Promise((resolve) => setTimeout(resolve, 50))
      const rows = await testDb
        .select()
        .from(errorLogs)
        .where(eq(errorLogs.message, 'Study not found'))
      expect(rows.length).toBe(0)
    })

    it('persists NotFoundError at warning level when threshold allows', async () => {
      const previous = process.env.ERROR_LOG_LEVEL
      process.env.ERROR_LOG_LEVEL = 'warning'

      try {
        const app = createAppWithError(new NotFoundError('Specimen', 99))
        await app.request('http://localhost/test')

        await new Promise((resolve) => setTimeout(resolve, 50))
        const rows = await testDb
          .select()
          .from(errorLogs)
          .where(eq(errorLogs.message, 'Specimen with id 99 not found'))
        expect(rows.length).toBeGreaterThanOrEqual(1)
        expect(rows[rows.length - 1].level).toBe('warning')
      } finally {
        if (previous !== undefined) {
          process.env.ERROR_LOG_LEVEL = previous
        } else {
          delete process.env.ERROR_LOG_LEVEL
        }
      }
    })

    it('returns 409 and CONFLICT for ConflictError', async () => {
      const app = createAppWithError(new ConflictError('Resource already exists'))
      const res = await app.request('http://localhost/test')
      expect(res.status).toBe(409)
      const data = await getJson(res)
      expect(data.error).toBe('Resource already exists')
      expect(data.errorCode).toBe('CONFLICT')
    })

    it('returns 400 and VALIDATION_ERROR for ZodError', async () => {
      const err = z.object({ name: z.string().min(1) }).safeParse({ name: '' }).error!
      const c = createMockContext()
      const res = handleRouteError(err, c)
      const data = await getJson(res)
      expect(res.status).toBe(400)
      expect(data.error).toBe('Validation error')
      expect(data.errorCode).toBe('VALIDATION_ERROR')
      expect(data.details).toBeDefined()
    })

    it('returns 400 and VALIDATION_ERROR for ValidationError (custom)', async () => {
      const app = createAppWithError(new ValidationError('Invalid input', { field: 'name' }))
      const res = await app.request('http://localhost/test')
      expect(res.status).toBe(400)
      const data = await getJson(res)
      expect(data.error).toBe('Invalid input')
      expect(data.errorCode).toBe('VALIDATION_ERROR')
      expect(data.details).toEqual({ field: 'name' })
    })

    it('returns 500 for generic Error', async () => {
      const app = createAppWithError(new Error('Something broke'))
      const res = await app.request('http://localhost/test')
      expect(res.status).toBe(500)
      const data = await getJson(res)
      expect(data.error).toBe('Something broke')
      expect(data.errorCode).toBeDefined()
    })

    it('returns 500 for non-Error thrown value', async () => {
      const c = createMockContext()
      const res = handleRouteError('string error', c)
      const data = await getJson(res)
      expect(res.status).toBe(500)
      expect(data.error).toBeDefined()
      expect(data.errorCode).toBeDefined()
    })

    it('returns custom body for RouteError (search shape)', async () => {
      const body = searchFailedBody('flu', new Error('db down'))
      const app = createAppWithError(new RouteError(500, body))
      const res = await app.request('http://localhost/test')
      expect(res.status).toBe(500)
      const data = await getJson(res)
      expect(data.error).toBe('Search failed')
      expect(data.query).toBe('flu')
      expect(data.details).toBe('db down')
    })

    it('returns custom body for RouteError (containers shape)', async () => {
      const body = containersFetchFailedBody('Failed to fetch containers', new Error('timeout'))
      const app = createAppWithError(new RouteError(500, body))
      const res = await app.request('http://localhost/test')
      const data = await getJson(res)
      expect(res.status).toBe(500)
      expect(data.error).toBe('Failed to fetch containers')
      expect(data.details).toBe('timeout')
    })
  })
})
