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

    it('returns 409 and CONFLICT for ConflictError and logs at warning level', async () => {
      const app = createAppWithError(new ConflictError('Resource already exists'))
      const res = await app.request('http://localhost/test')
      expect(res.status).toBe(409)
      const data = await getJson(res)
      expect(data.error).toBe('Resource already exists')
      expect(data.errorCode).toBe('CONFLICT')

      await new Promise((resolve) => setTimeout(resolve, 50))
      const atErrorLevel = await testDb.select().from(errorLogs).where(eq(errorLogs.message, 'Resource already exists'))
      expect(atErrorLevel).toHaveLength(0)

      const previous = process.env.ERROR_LOG_LEVEL
      process.env.ERROR_LOG_LEVEL = 'warning'
      try {
        await app.request('http://localhost/test')
        await new Promise((resolve) => setTimeout(resolve, 50))
        const atWarningLevel = await testDb.select().from(errorLogs).where(eq(errorLogs.message, 'Resource already exists'))
        expect(atWarningLevel).toHaveLength(1)
        expect(atWarningLevel[0].level).toBe('warning')
      } finally {
        if (previous !== undefined) process.env.ERROR_LOG_LEVEL = previous
        else delete process.env.ERROR_LOG_LEVEL
      }
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

    it('returns 400 and VALIDATION_ERROR for ValidationError (custom) and logs at warning level', async () => {
      const app = createAppWithError(new ValidationError('Invalid input', { field: 'name' }))
      const res = await app.request('http://localhost/test')
      expect(res.status).toBe(400)
      const data = await getJson(res)
      expect(data.error).toBe('Invalid input')
      expect(data.errorCode).toBe('VALIDATION_ERROR')
      expect(data.details).toEqual({ field: 'name' })

      await new Promise((resolve) => setTimeout(resolve, 50))
      const atErrorLevel = await testDb.select().from(errorLogs).where(eq(errorLogs.message, 'Invalid input'))
      expect(atErrorLevel).toHaveLength(0)

      const previous = process.env.ERROR_LOG_LEVEL
      process.env.ERROR_LOG_LEVEL = 'warning'
      try {
        await app.request('http://localhost/test')
        await new Promise((resolve) => setTimeout(resolve, 50))
        const atWarningLevel = await testDb.select().from(errorLogs).where(eq(errorLogs.message, 'Invalid input'))
        expect(atWarningLevel).toHaveLength(1)
        expect(atWarningLevel[0].level).toBe('warning')
      } finally {
        if (previous !== undefined) process.env.ERROR_LOG_LEVEL = previous
        else delete process.env.ERROR_LOG_LEVEL
      }
    })

    it('returns 400 without logging an error row when a request body is malformed JSON', async () => {
      const app = new Hono()
      app.use('*', (c, next) => {
        c.set('db', testDb)
        return next()
      })
      app.post('/json', async (c) => {
        await c.req.json()
        return c.json({ ok: true })
      })
      app.onError((err, c) => handleRouteError(err, c))

      const res = await app.request('http://localhost/json', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: '{not valid json',
      })

      expect(res.status).toBe(400)
      const data = await getJson(res)
      expect(data.errorCode).toBe('VALIDATION_ERROR')
      await new Promise((resolve) => setTimeout(resolve, 50))
      expect(await testDb.select().from(errorLogs)).toHaveLength(0)
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

    it('logs a 4xx RouteError at warning level rather than error level', async () => {
      const app = createAppWithError(new RouteError(400, { error: 'Invalid format' }))
      const res = await app.request('http://localhost/test')
      expect(res.status).toBe(400)
      expect(await getJson(res)).toEqual({ error: 'Invalid format' })

      // At the default ERROR_LOG_LEVEL ('error'), a 4xx RouteError is not persisted.
      await new Promise((resolve) => setTimeout(resolve, 50))
      const atErrorLevel = await testDb.select().from(errorLogs).where(eq(errorLogs.message, 'Invalid format'))
      expect(atErrorLevel).toHaveLength(0)

      const previous = process.env.ERROR_LOG_LEVEL
      process.env.ERROR_LOG_LEVEL = 'warning'
      try {
        await app.request('http://localhost/test')
        await new Promise((resolve) => setTimeout(resolve, 50))
        const atWarningLevel = await testDb.select().from(errorLogs).where(eq(errorLogs.message, 'Invalid format'))
        expect(atWarningLevel).toHaveLength(1)
        expect(atWarningLevel[0].level).toBe('warning')
        expect(atWarningLevel[0].errorCode).toBe('RouteError')
      } finally {
        if (previous !== undefined) process.env.ERROR_LOG_LEVEL = previous
        else delete process.env.ERROR_LOG_LEVEL
      }
    })
  })

  describe('with NODE_ENV=production', () => {
    const sqlMessage = 'SQLITE_ERROR: no such column: storage_container.secret_col in SELECT * FROM storage_container'
    let previousNodeEnv: string | undefined
    let previousLogFormat: string | undefined
    let originalConsoleError: typeof console.error
    let stderrLines: string[]

    beforeEach(() => {
      previousNodeEnv = process.env.NODE_ENV
      previousLogFormat = process.env.LOG_FORMAT
      process.env.NODE_ENV = 'production'
      process.env.LOG_FORMAT = 'json'
      stderrLines = []
      originalConsoleError = console.error
      console.error = (...args: unknown[]) => {
        stderrLines.push(args.map(String).join(' '))
      }
    })

    afterEach(() => {
      console.error = originalConsoleError
      process.env.NODE_ENV = previousNodeEnv
      if (previousLogFormat === undefined) delete process.env.LOG_FORMAT
      else process.env.LOG_FORMAT = previousLogFormat
    })

    it('answers a 500 with a generic message and still logs the full error', async () => {
      const app = createAppWithError(new Error(sqlMessage))
      const res = await app.request('http://localhost/test')

      expect(res.status).toBe(500)
      const text = await res.text()
      expect(JSON.parse(text)).toEqual({ error: 'Internal server error', errorCode: 'INTERNAL_ERROR' })
      expect(text).not.toContain('SQLITE')
      expect(text).not.toContain('storage_container')

      // stdout/stderr gets the full error
      expect(stderrLines.some((line) => line.includes(sqlMessage))).toBe(true)
      // error_logs gets the full error, with its stack
      await new Promise((resolve) => setTimeout(resolve, 50))
      const rows = await testDb.select().from(errorLogs).where(eq(errorLogs.message, sqlMessage))
      expect(rows).toHaveLength(1)
      expect(rows[0].level).toBe('error')
      expect(rows[0].stack).toContain(sqlMessage)
    })

    it('answers a 500 for a non-Error thrown value with a generic message and no details', async () => {
      const res = handleRouteError(sqlMessage, createMockContext())
      expect(res.status).toBe(500)
      expect(await getJson(res)).toEqual({ error: 'Internal server error', errorCode: 'INTERNAL_ERROR' })
      expect(stderrLines.some((line) => line.includes(sqlMessage))).toBe(true)
    })

    it('keeps the cause out of the containers and search 500 bodies', async () => {
      const containers = createAppWithError(
        new RouteError(500, containersFetchFailedBody('Failed to fetch containers', new Error(sqlMessage)))
      )
      const containersRes = await containers.request('http://localhost/test')
      expect(containersRes.status).toBe(500)
      expect(await getJson(containersRes)).toEqual({ error: 'Failed to fetch containers' })

      const search = createAppWithError(new RouteError(500, searchFailedBody('flu', new Error(sqlMessage))))
      const searchText = await (await search.request('http://localhost/test')).text()
      expect(searchText).not.toContain(sqlMessage)
    })

    it('logs the cause a RouteError carries, under the route message, and sends only the body', async () => {
      const app = createAppWithError(new RouteError(500, { error: 'Failed to export containers' }, new Error(sqlMessage)))
      const res = await app.request('http://localhost/test')

      expect(res.status).toBe(500)
      expect(await getJson(res)).toEqual({ error: 'Failed to export containers' })
      expect(stderrLines.some((line) => line.includes(sqlMessage))).toBe(true)
      await new Promise((resolve) => setTimeout(resolve, 50))
      const rows = await testDb.select().from(errorLogs).where(eq(errorLogs.message, 'Failed to export containers'))
      expect(rows).toHaveLength(1)
      expect(rows[0].level).toBe('error')
      expect(rows[0].stack).toContain(sqlMessage)
    })

    it('logs a RouteError cause that is not an Error', async () => {
      const app = createAppWithError(new RouteError(500, { error: 'Failed to export inventory' }, sqlMessage))
      await app.request('http://localhost/test')

      expect(stderrLines.some((line) => line.includes(sqlMessage))).toBe(true)
      await new Promise((resolve) => setTimeout(resolve, 50))
      const rows = await testDb.select().from(errorLogs).where(eq(errorLogs.message, 'Failed to export inventory'))
      expect(rows).toHaveLength(1)
      expect(rows[0].stack).toContain(sqlMessage)
    })

    it('keeps the raw SQLite text out of a constraint-conflict 409', async () => {
      const error = Object.assign(new Error('UNIQUE constraint failed: study.title'), { code: 'SQLITE_CONSTRAINT_UNIQUE' })
      const res = await createAppWithError(error).request('http://localhost/test')
      expect(res.status).toBe(409)
      expect(await res.text()).not.toContain('UNIQUE constraint failed')
    })
  })
})
