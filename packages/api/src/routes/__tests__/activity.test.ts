import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { Hono } from 'hono'
import { loginAndGetCookie, authenticatedRequest } from '../../__tests__/helpers/test-client'
import { setupTestDatabase, cleanupTestDatabase } from '../../__tests__/helpers/db-setup'
import {
  createTestControlDefinition,
  createTestControlBatch,
  createTestSpecimenType,
  createTestSpecimen,
} from '../../__tests__/helpers/factories'
import { createAuthRoutes } from '../auth'
import { createActivityRoutes } from '../activity'
import { handleRouteError } from '../../lib/error-handler'
import { setupPasswordRequirements, setupSessionSettings, createTestUser } from '../../__tests__/helpers/auth-helpers'
import type { Database } from '../../db/client'

describe('Activity API', () => {
  let app: Hono
  let testDb: Database
  let sqlite: Awaited<ReturnType<typeof setupTestDatabase>>['sqlite']
  let cookie: string

  beforeEach(async () => {
    const setup = await setupTestDatabase()
    testDb = setup.db
    sqlite = setup.sqlite

    await setupPasswordRequirements(testDb, 8)
    await setupSessionSettings(testDb, 604800)

    await createTestUser(testDb, {
      email: 'user@test.com',
      name: 'User',
      password: 'password123',
      role: 'member',
    })

    app = new Hono()
    app.use('*', (c, next) => {
      c.set('db', testDb)
      return next()
    })
    app.onError((err, c) => handleRouteError(err, c))
    app.route('/api/auth', createAuthRoutes(testDb, testDb))
    app.route('/api/activity', createActivityRoutes(testDb))

    cookie = await loginAndGetCookie(app, 'user@test.com', 'password123')
  })

  afterEach(() => {
    if (sqlite) {
      cleanupTestDatabase(sqlite)
    }
  })

  describe('GET /api/activity/recent', () => {
    it('returns 200 and array', async () => {
      const res = await authenticatedRequest(app, '/api/activity/recent', {
        method: 'GET',
        cookie,
      })
      expect(res.status).toBe(200)
      const data = (await res.json()) as { activity?: unknown[] }
      expect(Array.isArray(data.activity)).toBe(true)
    })

    it('returns 401 when not authenticated', async () => {
      const res = await authenticatedRequest(app, '/api/activity/recent', { method: 'GET' })
      expect(res.status).toBe(401)
    })

    it('returns control specimen labels without database ID, with definition and batch names', async () => {
      const definition = await createTestControlDefinition(testDb, {
        name: 'HPV18 DBS Control',
        controlType: 'blood',
      })
      const batch = await createTestControlBatch(testDb, definition.id, {
        name: 'HPV18-2024-001',
        productionDate: '2024-01-15',
      })
      const specimenType = await createTestSpecimenType(testDb, { name: 'DBS' })
      const controlSpecimen = await createTestSpecimen(testDb, specimenType.id, {
        controlBatchId: batch.id,
      })

      const res = await authenticatedRequest(app, '/api/activity/recent', {
        method: 'GET',
        cookie,
      })
      expect(res.status).toBe(200)
      const data = (await res.json()) as { activity?: Array<{ id: number; type: string; label: string }> }
      expect(Array.isArray(data.activity)).toBe(true)

      const specimenActivity = data.activity!.find(
        (a) => a.type === 'specimen' && a.id === controlSpecimen.id
      )
      expect(specimenActivity).toBeDefined()
      expect(specimenActivity!.label).not.toMatch(/#\d+/)
      expect(specimenActivity!.label).toContain('HPV18 DBS Control')
      expect(specimenActivity!.label).toContain('HPV18-2024-001')
    })
  })
})
