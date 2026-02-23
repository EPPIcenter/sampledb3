import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { Hono } from 'hono'
import { loginAndGetCookie, authenticatedRequest } from '../../__tests__/helpers/test-client'
import { setupTestDatabase, cleanupTestDatabase } from '../../__tests__/helpers/db-setup'
import { createAuthRoutes } from '../auth'
import { createCollectionsRoutes } from '../collections'
import { handleRouteError } from '../../lib/error-handler'
import type { Database } from '../../db/client'
import {
  setupPasswordRequirements,
  setupSessionSettings,
  createTestUser,
} from '../../__tests__/helpers/auth-helpers'
import {
  createTestLocation,
  createTestStorageType,
  createTestMicronixPlate,
  createTestSpecimenType,
  createTestSpecimen,
  createTestUnit,
} from '../../__tests__/helpers/factories'
import { setScannerConfigurations } from '../../lib/settings'
import { storageContainer, micronixTube } from '../../db/schema'

describe('Collections API', () => {
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
    app.route('/api/collections', createCollectionsRoutes(testDb))

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
    app.route('/api/collections', createCollectionsRoutes(testDb))
    return app
  }

  describe('GET /api/collections/plates/micronix/:id', () => {
    it('returns 404 for non-existent plate', async () => {
      const app = createApp()
      const res = await authenticatedRequest(app, '/api/collections/plates/micronix/99999', {
        method: 'GET',
        cookie: cookieHeader,
      })
      expect(res.status).toBe(404)
      const data = (await res.json()) as { error: string }
      expect(data.error).toBe('Plate not found')
    })

    it('returns 400 for invalid plate ID', async () => {
      const app = createApp()
      const res = await authenticatedRequest(app, '/api/collections/plates/micronix/notanid', {
        method: 'GET',
        cookie: cookieHeader,
      })
      expect(res.status).toBe(400)
    })

    it('returns 401 when not authenticated', async () => {
      const app = createApp()
      const res = await authenticatedRequest(app, '/api/collections/plates/micronix/1', {
        method: 'GET',
      })
      expect(res.status).toBe(401)
    })

    it('returns 200 and plate detail when plate exists', async () => {
      const storageType = await createTestStorageType(testDb, {
        name: 'Shelf',
        description: 'Test',
      })
      const loc = await createTestLocation(testDb, {
        name: 'Loc1',
        storageTypeId: String(storageType.id),
        canContainCollections: true,
      })
      const plate = await createTestMicronixPlate(testDb, {
        name: 'Plate1',
        locationId: loc.id,
      })

      const app = createApp()
      const res = await authenticatedRequest(
        app,
        `/api/collections/plates/micronix/${plate.id}`,
        { method: 'GET', cookie: cookieHeader }
      )
      expect(res.status).toBe(200)
      const data = (await res.json()) as { plate: { id: number; name: string }; wells: unknown }
      expect(data.plate).toBeDefined()
      expect(data.plate.id).toBe(plate.id)
      expect(data.plate.name).toBe('Plate1')
      expect(data.wells).toBeDefined()
    })
  })

  describe('POST /api/collections/check', () => {
    it('returns 200 and results for check request', async () => {
      const app = createApp()
      const res = await authenticatedRequest(app, '/api/collections/check', {
        method: 'POST',
        cookie: cookieHeader,
        json: {
          collections: [
            { identifier: 'nonexistent', type: 'micronix_plate' as const },
          ],
        },
      })
      expect(res.status).toBe(200)
      const data = (await res.json()) as { results: Array<{ identifier: string; exists: boolean }> }
      expect(data.results).toHaveLength(1)
      expect(data.results[0].identifier).toBe('nonexistent')
      expect(data.results[0].exists).toBe(false)
    })

    it('returns 400 for invalid body', async () => {
      const app = createApp()
      const res = await authenticatedRequest(app, '/api/collections/check', {
        method: 'POST',
        cookie: cookieHeader,
        json: { collections: 'not-an-array' },
      })
      expect(res.status).toBe(400)
    })

    it('returns 401 when not authenticated', async () => {
      const app = createApp()
      const res = await authenticatedRequest(app, '/api/collections/check', {
        method: 'POST',
        json: { collections: [] },
      })
      expect(res.status).toBe(401)
    })
  })

  describe('POST /api/collections/containers/move', () => {
    it('returns 400 for invalid move payload', async () => {
      const app = createApp()
      const res = await authenticatedRequest(app, '/api/collections/containers/move', {
        method: 'POST',
        cookie: cookieHeader,
        json: { moves: 'not-an-array' },
      })
      expect(res.status).toBe(400)
    })

    it('returns 401 when not authenticated', async () => {
      const app = createApp()
      const res = await authenticatedRequest(app, '/api/collections/containers/move', {
        method: 'POST',
        json: { mappings: [], moves: [] },
      })
      expect(res.status).toBe(401)
    })
  })

  describe('POST /api/collections/plates/micronix/validate-scan', () => {
    it('returns 200 with inferenceReport when infer would fail (multiple plates)', async () => {
      await setScannerConfigurations(testDb, {
        configurations: [
          {
            id: 'scan-config',
            name: 'Test',
            barcodeColumn: 'Barcode',
            positionType: 'single',
            positionColumn: 'Well',
            skipRows: 0,
          },
        ],
      }, null)

      const storageType = await createTestStorageType(testDb, { name: 'Freezer' })
      const location = await createTestLocation(testDb, {
        name: 'Loc',
        storageTypeId: String(storageType.id),
      })
      const plate1 = await createTestMicronixPlate(testDb, { name: 'Plate1', locationId: location.id })
      const plate2 = await createTestMicronixPlate(testDb, { name: 'Plate2', locationId: location.id })
      const specimenType = await createTestSpecimenType(testDb, { name: 'Blood' })
      const specimen = await createTestSpecimen(testDb, specimenType.id)
      const unit = await createTestUnit(testDb, { symbol: 'uL', name: 'microliter', category: 'volume' })
      const now = new Date().toISOString()

      const [c1] = await testDb.insert(storageContainer).values({
        specimenId: specimen.id,
        unitId: unit.id,
        totalQuantity: 1.0,
        remainingQuantity: 1.0,
        created: now,
        lastUpdated: now,
      }).returning()
      await testDb.insert(micronixTube).values({
        id: c1!.id,
        collectionId: plate1.id,
        barcode: 'MT001',
        position: 'A01',
      })

      const [c2] = await testDb.insert(storageContainer).values({
        specimenId: specimen.id,
        unitId: unit.id,
        totalQuantity: 1.0,
        remainingQuantity: 1.0,
        created: now,
        lastUpdated: now,
      }).returning()
      await testDb.insert(micronixTube).values({
        id: c2!.id,
        collectionId: plate2.id,
        barcode: 'MT002',
        position: 'A02',
      })

      const app = createApp()
      const res = await authenticatedRequest(app, '/api/collections/plates/micronix/validate-scan', {
        method: 'POST',
        cookie: cookieHeader,
        json: {
          csvText: 'Well,Barcode\nA01,MT001\nA02,MT002',
          scannerConfigurationId: 'scan-config',
        },
      })
      expect(res.status).toBe(200)
      const data = (await res.json()) as { inferenceReport?: { unknownBarcodes: string[]; plateBreakdown: unknown[] } }
      expect(data.inferenceReport).toBeDefined()
      expect(data.inferenceReport!.unknownBarcodes).toEqual([])
      expect(data.inferenceReport!.plateBreakdown).toHaveLength(2)
    })
  })

  describe('GET /api/collections/list-all', () => {
    it('returns 200 and list when authenticated', async () => {
      const app = createApp()
      const res = await authenticatedRequest(app, '/api/collections/list-all', {
        method: 'GET',
        cookie: cookieHeader,
      })
      expect(res.status).toBe(200)
      const data = (await res.json()) as { plates?: unknown[]; boxes?: unknown[]; bags?: unknown[] }
      expect(data).toBeDefined()
    })

    it('returns 401 when not authenticated', async () => {
      const app = createApp()
      const res = await authenticatedRequest(app, '/api/collections/list-all', { method: 'GET' })
      expect(res.status).toBe(401)
    })
  })
})
