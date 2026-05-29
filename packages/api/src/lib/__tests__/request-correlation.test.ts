import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { Hono } from 'hono'
import { eq } from 'drizzle-orm'
import { handleRouteError } from '../error-handler'
import { setRequestDatabase } from '../db-context'
import { requestContextMiddleware, REQUEST_ID_HEADER } from '../../middleware/request-context'
import { setupTestDatabase, cleanupTestDatabase } from '../../__tests__/helpers/db-setup'
import { errorLogs } from '../../db/schema'
import type { Database } from '../../db/client'

describe('request correlation', () => {
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

  function createApp(): Hono {
    const app = new Hono()
    app.use('*', async (c, next) => {
      setRequestDatabase(c, testDb)
      await next()
    })
    app.use('*', requestContextMiddleware())
    app.get('/fail', () => {
      throw new Error('Correlation test failure')
    })
    app.onError((err, c) => handleRouteError(err, c))
    return app
  }

  it('persists requestId from middleware into error_logs context', async () => {
    const clientId = 'req_correlation_integration'
    const res = await createApp().request('http://localhost/fail', {
      headers: { [REQUEST_ID_HEADER]: clientId },
    })

    expect(res.status).toBe(500)
    expect(res.headers.get(REQUEST_ID_HEADER)).toBe(clientId)

    await new Promise((resolve) => setTimeout(resolve, 50))

    const rows = await testDb
      .select()
      .from(errorLogs)
      .where(eq(errorLogs.message, 'Correlation test failure'))

    expect(rows.length).toBeGreaterThanOrEqual(1)
    const context = rows[rows.length - 1].context as Record<string, unknown> | null
    expect(context?.requestId).toBe(clientId)
  })
})
