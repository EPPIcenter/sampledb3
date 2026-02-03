import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { Hono } from 'hono'
import { loginAndGetCookie, authenticatedRequest } from '../../__tests__/helpers/test-client'
import { setupTestDatabase, cleanupTestDatabase } from '../../__tests__/helpers/db-setup'
import { createAuthRoutes } from '../auth'
import { createControlsRoutes } from '../controls'
import { handleRouteError } from '../../lib/error-handler'
import type { Database } from '../../db/client'
import {
  setupPasswordRequirements,
  setupSessionSettings,
  createTestUser,
} from '../../__tests__/helpers/auth-helpers'
import {
  createTestControlDefinition,
  createTestStrain,
  createTestUnit,
} from '../../__tests__/helpers/factories'

const BASE = '/api/blood-controls'

describe('Controls API', () => {
  let testDb: Database
  let sqlite: Awaited<ReturnType<typeof setupTestDatabase>>['sqlite']
  let cookieHeader: string

  beforeEach(async () => {
    const setup = await setupTestDatabase()
    testDb = setup.db
    sqlite = setup.sqlite

    await setupPasswordRequirements(testDb, 8)
    await setupSessionSettings(testDb, 604800)

    await createTestUser(testDb, {
      email: 'admin@test.com',
      name: 'Admin',
      password: 'password123',
      role: 'admin',
    })

    const app = new Hono()
    app.use('*', (c, next) => {
      c.set('db', testDb)
      return next()
    })
    app.route('/api/auth', createAuthRoutes(testDb, testDb))
    app.route('/api/blood-controls', createControlsRoutes(testDb))

    cookieHeader = await loginAndGetCookie(app, 'admin@test.com', 'password123')
  })

  afterEach(() => {
    if (sqlite) {
      cleanupTestDatabase(sqlite)
    }
  })

  function createApp(): Hono {
    const app = new Hono()
    app.use('*', (c, next) => {
      c.set('db', testDb)
      return next()
    })
    app.onError((err, c) => handleRouteError(err, c))
    app.route('/api/blood-controls', createControlsRoutes(testDb))
    return app
  }

  describe(`GET ${BASE}`, () => {
    it('returns 200 and controls list when authenticated', async () => {
      const app = createApp()
      const res = await authenticatedRequest(app, BASE, {
        method: 'GET',
        cookie: cookieHeader,
      })
      expect(res.status).toBe(200)
      const data = (await res.json()) as { controls: unknown[] }
      expect(data).toHaveProperty('controls')
      expect(Array.isArray(data.controls)).toBe(true)
    })

    it('returns 401 when not authenticated', async () => {
      const app = createApp()
      const res = await authenticatedRequest(app, BASE, { method: 'GET' })
      expect(res.status).toBe(401)
    })
  })

  describe(`GET ${BASE}/:id`, () => {
    it('returns 404 for non-existent definition', async () => {
      const app = createApp()
      const res = await authenticatedRequest(app, `${BASE}/99999`, {
        method: 'GET',
        cookie: cookieHeader,
      })
      expect(res.status).toBe(404)
      const data = (await res.json()) as { error: string }
      expect(data.error).toContain('not found')
    })

    it('returns 400 for invalid ID', async () => {
      const app = createApp()
      const res = await authenticatedRequest(app, `${BASE}/notanid`, {
        method: 'GET',
        cookie: cookieHeader,
      })
      expect(res.status).toBe(400)
    })

    it('returns 401 when not authenticated', async () => {
      const app = createApp()
      const res = await authenticatedRequest(app, `${BASE}/1`, { method: 'GET' })
      expect(res.status).toBe(401)
    })

    it('returns 200 and definition when it exists', async () => {
      const def = await createTestControlDefinition(testDb, {
        name: 'Test Control Def',
        controlType: 'blood',
      })
      const app = createApp()
      const res = await authenticatedRequest(app, `${BASE}/${def.id}`, {
        method: 'GET',
        cookie: cookieHeader,
      })
      expect(res.status).toBe(200)
      const data = (await res.json()) as { control: { id: number; name: string } }
      expect(data.control).toBeDefined()
      expect(data.control.id).toBe(def.id)
      expect(data.control.name).toBe('Test Control Def')
    })
  })

  describe(`GET ${BASE}/batches`, () => {
    it('returns 200 and batches list when authenticated', async () => {
      const app = createApp()
      const res = await authenticatedRequest(app, `${BASE}/batches`, {
        method: 'GET',
        cookie: cookieHeader,
      })
      expect(res.status).toBe(200)
      const data = (await res.json()) as { batches: unknown[] }
      expect(data).toHaveProperty('batches')
      expect(Array.isArray(data.batches)).toBe(true)
    })

    it('returns 401 when not authenticated', async () => {
      const app = createApp()
      const res = await authenticatedRequest(app, `${BASE}/batches`, { method: 'GET' })
      expect(res.status).toBe(401)
    })
  })

  describe(`POST ${BASE}/:id/batches`, () => {
    it('returns 201 when creating a batch', async () => {
      const definition = await createTestControlDefinition(testDb, {
        name: 'Batch Test Def',
        controlType: 'blood',
      })
      const app = createApp()
      const res = await authenticatedRequest(app, `${BASE}/${definition.id}/batches`, {
        method: 'POST',
        cookie: cookieHeader,
        json: { productionDate: '2024-01-01' },
      })
      expect(res.status).toBe(201)
      const data = (await res.json()) as { batch: { id: number; controlDefinitionId: number } }
      expect(data.batch).toBeDefined()
      expect(data.batch.controlDefinitionId).toBe(definition.id)
    })

    it('returns 404 when definition does not exist', async () => {
      const app = createApp()
      const res = await authenticatedRequest(app, `${BASE}/99999/batches`, {
        method: 'POST',
        cookie: cookieHeader,
        json: { productionDate: '2024-01-01' },
      })
      expect(res.status).toBe(404)
    })

    it('returns 401 when not authenticated', async () => {
      const definition = await createTestControlDefinition(testDb, {
        name: 'Def For Auth Test',
        controlType: 'blood',
      })
      const app = createApp()
      const res = await authenticatedRequest(app, `${BASE}/${definition.id}/batches`, {
        method: 'POST',
        json: { productionDate: '2024-01-01' },
      })
      expect(res.status).toBe(401)
    })
  })

  describe(`POST ${BASE}`, () => {
    it('returns 201 when creating a control definition with valid payload', async () => {
      const strain = await createTestStrain(testDb, { name: 'Strain A' })
      const unit = await createTestUnit(testDb, {
        symbol: 'p/ul',
        name: 'parasites per microliter',
        category: 'concentration',
      })
      const app = createApp()
      const res = await authenticatedRequest(app, BASE, {
        method: 'POST',
        cookie: cookieHeader,
        json: {
          targetDensity: 1000,
          targetDensityUnitId: unit.id,
          strains: [{ strainId: strain.id, percentage: 100 }],
        },
      })
      expect(res.status).toBe(201)
      const data = (await res.json()) as { control: { id: number; name: string } }
      expect(data.control).toBeDefined()
      expect(data.control.id).toBeDefined()
    })

    it('returns 400 when strains are missing', async () => {
      const app = createApp()
      const res = await authenticatedRequest(app, BASE, {
        method: 'POST',
        cookie: cookieHeader,
        json: {
          targetDensity: 1000,
          strains: [],
        },
      })
      expect(res.status).toBe(400)
      const data = (await res.json()) as { error: string }
      expect(data.error).toContain('strain')
    })

    it('returns 401 when not authenticated', async () => {
      const app = createApp()
      const res = await authenticatedRequest(app, BASE, {
        method: 'POST',
        json: { targetDensity: 1000, strains: [] },
      })
      expect(res.status).toBe(401)
    })
  })
})
