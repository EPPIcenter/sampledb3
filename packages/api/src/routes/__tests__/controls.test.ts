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

  describe(`POST ${BASE}/definitions/find`, () => {
    it('returns 200 and definition when composition and density match', async () => {
      const strain = await createTestStrain(testDb, { name: 'Find Strain' })
      const unit = await createTestUnit(testDb, {
        symbol: 'p/ul',
        name: 'parasites per microliter',
        category: 'concentration',
      })
      const existing = await createTestControlDefinition(testDb, {
        name: 'Existing Find Def',
        controlType: 'blood',
        properties: {
          strains: [{ id: strain.id, name: 'Find Strain', percentage: 100 }],
          targetDensity: 500,
          targetDensityUnitId: unit.id,
        },
      })
      const app = createApp()
      const res = await authenticatedRequest(app, `${BASE}/definitions/find`, {
        method: 'POST',
        cookie: cookieHeader,
        json: {
          strains: [{ strainId: strain.id, percentage: 100 }],
          targetDensity: 500,
          targetDensityUnitId: unit.id,
        },
      })
      expect(res.status).toBe(200)
      const data = (await res.json()) as { control: { id: number; name: string; unitSymbol?: string } }
      expect(data.control).toBeDefined()
      expect(data.control.id).toBe(existing.id)
      expect(data.control.name).toBe('Existing Find Def')
    })

    it('returns 404 when no definition matches and does not create', async () => {
      const strain = await createTestStrain(testDb, { name: 'No Match Strain' })
      const app = createApp()
      const listRes = await authenticatedRequest(app, BASE, {
        method: 'GET',
        cookie: cookieHeader,
      })
      expect(listRes.status).toBe(200)
      const listData = (await listRes.json()) as { controls?: unknown[] }
      const countBefore = Array.isArray(listData.controls) ? listData.controls.length : 0

      const findRes = await authenticatedRequest(app, `${BASE}/definitions/find`, {
        method: 'POST',
        cookie: cookieHeader,
        json: {
          strains: [{ strainId: strain.id, percentage: 100 }],
          targetDensity: 99999,
        },
      })
      expect(findRes.status).toBe(404)
      const findData = (await findRes.json()) as { error: string }
      expect(findData.error).toContain('No control definition found')

      const listRes2 = await authenticatedRequest(app, BASE, {
        method: 'GET',
        cookie: cookieHeader,
      })
      const listData2 = (await listRes2.json()) as { controls?: unknown[] }
      const countAfter = Array.isArray(listData2.controls) ? listData2.controls.length : 0
      expect(countAfter).toBe(countBefore)
    })
  })

  describe(`POST ${BASE}/definitions/bulk`, () => {
    it('creates multiple definitions for same composition with different densities', async () => {
      const strain = await createTestStrain(testDb, { name: 'Bulk Strain' })
      const unit = await createTestUnit(testDb, {
        symbol: 'p/ul',
        name: 'parasites per microliter',
        category: 'concentration',
      })
      const app = createApp()
      const res = await authenticatedRequest(app, `${BASE}/definitions/bulk`, {
        method: 'POST',
        cookie: cookieHeader,
        json: {
          strains: [{ strainId: strain.id, percentage: 100 }],
          targetDensities: [100, 500, 1000],
          targetDensityUnitId: unit.id,
          names: ['Bulk 100', 'Bulk 500', 'Bulk 1K'],
        },
      })
      expect(res.status).toBe(201)
      const data = (await res.json()) as { controls: Array<{ id: number; name: string; targetDensity?: number }> }
      expect(data.controls).toBeDefined()
      expect(data.controls).toHaveLength(3)
      const densities = data.controls.map((c) => c.targetDensity).sort((a, b) => (a ?? 0) - (b ?? 0))
      expect(densities).toEqual([100, 500, 1000])
      const ids = data.controls.map((c) => c.id)
      expect(new Set(ids).size).toBe(3)
    })

    it('returns existing definition when composition and density already exist (get-or-create)', async () => {
      const strain = await createTestStrain(testDb, { name: 'Bulk Existing Strain' })
      const unit = await createTestUnit(testDb, {
        symbol: 'p/ul',
        name: 'parasites per microliter',
        category: 'concentration',
      })
      const existing = await createTestControlDefinition(testDb, {
        name: 'Existing Bulk Def',
        controlType: 'blood',
        properties: {
          strains: [{ id: strain.id, name: 'Bulk Existing Strain', percentage: 100 }],
          targetDensity: 500,
          targetDensityUnitId: unit.id,
        },
      })
      const app = createApp()
      const res = await authenticatedRequest(app, `${BASE}/definitions/bulk`, {
        method: 'POST',
        cookie: cookieHeader,
        json: {
          strains: [{ strainId: strain.id, percentage: 100 }],
          targetDensities: [500, 1000],
          targetDensityUnitId: unit.id,
          names: ['Existing Bulk Def', 'New 1K'],
        },
      })
      expect(res.status).toBe(201)
      const data = (await res.json()) as { controls: Array<{ id: number; name: string; targetDensity?: number }> }
      expect(data.controls).toHaveLength(2)
      const at500 = data.controls.find((c) => c.targetDensity === 500)
      expect(at500).toBeDefined()
      expect(at500!.id).toBe(existing.id)
      expect(at500!.name).toBe('Existing Bulk Def')
      const at1000 = data.controls.find((c) => c.targetDensity === 1000)
      expect(at1000).toBeDefined()
      expect(at1000!.id).not.toBe(existing.id)
    })

    it('returns 400 when targetDensities is empty', async () => {
      const strain = await createTestStrain(testDb, { name: 'Strain Empty' })
      const app = createApp()
      const res = await authenticatedRequest(app, `${BASE}/definitions/bulk`, {
        method: 'POST',
        cookie: cookieHeader,
        json: {
          strains: [{ strainId: strain.id, percentage: 100 }],
          targetDensities: [],
          names: [],
        },
      })
      expect(res.status).toBe(400)
    })

    it('returns 400 when strains are missing', async () => {
      const app = createApp()
      const res = await authenticatedRequest(app, `${BASE}/definitions/bulk`, {
        method: 'POST',
        cookie: cookieHeader,
        json: {
          strains: [],
          targetDensities: [100, 200],
          names: ['A', 'B'],
        },
      })
      expect(res.status).toBe(400)
      const body = (await res.json()) as { error: string }
      expect(body.error).toContain('strain')
    })

    it('returns 401 when not authenticated', async () => {
      const app = createApp()
      const res = await authenticatedRequest(app, `${BASE}/definitions/bulk`, {
        method: 'POST',
        json: {
          strains: [{ strainId: 1, percentage: 100 }],
          targetDensities: [100],
          names: ['One'],
        },
      })
      expect(res.status).toBe(401)
    })

    it('uses provided names when names array is supplied and length matches targetDensities', async () => {
      const strain = await createTestStrain(testDb, { name: 'Name Strain' })
      const unit = await createTestUnit(testDb, {
        symbol: 'p/ul',
        name: 'parasites per microliter',
        category: 'concentration',
      })
      const app = createApp()
      const res = await authenticatedRequest(app, `${BASE}/definitions/bulk`, {
        method: 'POST',
        cookie: cookieHeader,
        json: {
          strains: [{ strainId: strain.id, percentage: 100 }],
          targetDensities: [100, 500, 1000],
          targetDensityUnitId: unit.id,
          names: ['Custom 100', 'Custom 500', 'Custom 1K'],
        },
      })
      expect(res.status).toBe(201)
      const data = (await res.json()) as { controls: Array<{ id: number; name: string; targetDensity?: number }> }
      expect(data.controls).toHaveLength(3)
      expect(new Set(data.controls.map((c) => c.name))).toEqual(new Set(['Custom 100', 'Custom 500', 'Custom 1K']))
      expect(data.controls.map((c) => c.targetDensity).sort((a, b) => (a ?? 0) - (b ?? 0))).toEqual([100, 500, 1000])
    })

    it('returns 400 when names is missing', async () => {
      const strain = await createTestStrain(testDb, { name: 'Strain N' })
      const app = createApp()
      const res = await authenticatedRequest(app, `${BASE}/definitions/bulk`, {
        method: 'POST',
        cookie: cookieHeader,
        json: {
          strains: [{ strainId: strain.id, percentage: 100 }],
          targetDensities: [100, 500],
        },
      })
      expect(res.status).toBe(400)
    })

    it('returns 400 when names length does not match targetDensities length', async () => {
      const strain = await createTestStrain(testDb, { name: 'Strain N' })
      const app = createApp()
      const res = await authenticatedRequest(app, `${BASE}/definitions/bulk`, {
        method: 'POST',
        cookie: cookieHeader,
        json: {
          strains: [{ strainId: strain.id, percentage: 100 }],
          targetDensities: [100, 500],
          names: ['Only One Name'],
        },
      })
      expect(res.status).toBe(400)
    })

    it('returns 400 when provided name is already used by another definition', async () => {
      const strain = await createTestStrain(testDb, { name: 'Strain Dup' })
      const unit = await createTestUnit(testDb, {
        symbol: 'p/ul',
        name: 'parasites per microliter',
        category: 'concentration',
      })
      await createTestControlDefinition(testDb, {
        name: 'Taken Name',
        controlType: 'blood',
        properties: {
          strains: [{ id: strain.id, name: 'Strain Dup', percentage: 100 }],
          targetDensity: 999,
          targetDensityUnitId: unit.id,
        },
      })
      const app = createApp()
      const res = await authenticatedRequest(app, `${BASE}/definitions/bulk`, {
        method: 'POST',
        cookie: cookieHeader,
        json: {
          strains: [{ strainId: strain.id, percentage: 100 }],
          targetDensities: [200, 300],
          targetDensityUnitId: unit.id,
          names: ['Taken Name', 'Other Name'],
        },
      })
      expect(res.status).toBe(400)
      const body = (await res.json()) as { error?: string }
      expect(body.error).toBeDefined()
      expect(String(body.error).toLowerCase()).toMatch(/name|unique|taken|duplicate/)
    })
  })

  describe(`PATCH ${BASE}/batches/:id`, () => {
    it('returns 200 and updates batch name', async () => {
      const strain = await createTestStrain(testDb, { name: 'Strain Patch' })
      const definition = await createTestControlDefinition(testDb, {
        name: 'DefPatch',
        properties: {
          strains: [{ id: strain.id, name: 'Strain Patch', percentage: 100 }],
          targetDensity: 500,
        },
      })
      const app = createApp()
      const createRes = await authenticatedRequest(app, `${BASE}/${definition.id}/batches`, {
        method: 'POST',
        cookie: cookieHeader,
        json: { name: 'Original Name', productionDate: '2026-04-01' },
      })
      expect(createRes.status).toBe(201)
      const { batch } = (await createRes.json()) as { batch: { id: number } }

      const patchRes = await authenticatedRequest(app, `${BASE}/batches/${batch.id}`, {
        method: 'PATCH',
        cookie: cookieHeader,
        json: { name: 'Updated Name' },
      })
      expect(patchRes.status).toBe(200)
      const patchData = (await patchRes.json()) as { batch: { id: number; name: string } }
      expect(patchData.batch.name).toBe('Updated Name')
    })

    it('returns 200 and updates production date', async () => {
      const strain = await createTestStrain(testDb, { name: 'Strain Date' })
      const definition = await createTestControlDefinition(testDb, {
        name: 'DefDate',
        properties: {
          strains: [{ id: strain.id, name: 'Strain Date', percentage: 100 }],
          targetDensity: 600,
        },
      })
      const app = createApp()
      const createRes = await authenticatedRequest(app, `${BASE}/${definition.id}/batches`, {
        method: 'POST',
        cookie: cookieHeader,
        json: { name: 'BatchDate', productionDate: '2026-01-01' },
      })
      expect(createRes.status).toBe(201)
      const { batch } = (await createRes.json()) as { batch: { id: number } }

      const patchRes = await authenticatedRequest(app, `${BASE}/batches/${batch.id}`, {
        method: 'PATCH',
        cookie: cookieHeader,
        json: { productionDate: '2026-06-15' },
      })
      expect(patchRes.status).toBe(200)
      const patchData = (await patchRes.json()) as { batch: { id: number; productionDate: string } }
      expect(patchData.batch.productionDate).toBe('2026-06-15')
    })

    it('returns 400 when name already exists', async () => {
      const strain = await createTestStrain(testDb, { name: 'Strain Dup' })
      const definition = await createTestControlDefinition(testDb, {
        name: 'DefDup',
        properties: {
          strains: [{ id: strain.id, name: 'Strain Dup', percentage: 100 }],
          targetDensity: 700,
        },
      })
      const app = createApp()
      await authenticatedRequest(app, `${BASE}/${definition.id}/batches`, {
        method: 'POST',
        cookie: cookieHeader,
        json: { name: 'Existing Batch', productionDate: '2026-04-01' },
      })
      const createRes = await authenticatedRequest(app, `${BASE}/${definition.id}/batches`, {
        method: 'POST',
        cookie: cookieHeader,
        json: { name: 'Second Batch', productionDate: '2026-04-02' },
      })
      expect(createRes.status).toBe(201)
      const { batch } = (await createRes.json()) as { batch: { id: number } }

      const patchRes = await authenticatedRequest(app, `${BASE}/batches/${batch.id}`, {
        method: 'PATCH',
        cookie: cookieHeader,
        json: { name: 'Existing Batch' },
      })
      expect(patchRes.status).toBe(400)
    })

    it('returns 404 for non-existent batch', async () => {
      const app = createApp()
      const res = await authenticatedRequest(app, `${BASE}/batches/99999`, {
        method: 'PATCH',
        cookie: cookieHeader,
        json: { name: 'Ghost Batch' },
      })
      expect(res.status).toBe(404)
    })
  })

  describe(`DELETE ${BASE}/batches/:batchId/specimens/:specimenId`, () => {
    it('returns 200 and deletes the specimen from the batch', async () => {
      const strain = await createTestStrain(testDb, { name: 'Strain Del' })
      const definition = await createTestControlDefinition(testDb, {
        name: 'DefDel',
        properties: {
          strains: [{ id: strain.id, name: 'Strain Del', percentage: 100 }],
          targetDensity: 800,
        },
      })
      const app = createApp()
      const createRes = await authenticatedRequest(app, `${BASE}/${definition.id}/batches`, {
        method: 'POST',
        cookie: cookieHeader,
        json: { name: 'BatchDel', productionDate: '2026-04-01' },
      })
      expect(createRes.status).toBe(201)
      const { batch } = (await createRes.json()) as { batch: { id: number } }

      const { specimen, controlBatch: controlBatchTable } = await import('../../db/schema')
      const { eq } = await import('drizzle-orm')
      const { createTestSpecimenType } = await import('../../__tests__/helpers/factories')
      const specType = await createTestSpecimenType(testDb, { name: 'Blood Del' })
      const [spec] = await testDb.insert(specimen).values({
        controlBatchId: batch.id,
        specimenTypeId: specType.id,
        collectionDate: '2026-04-01',
      }).returning()

      const delRes = await authenticatedRequest(app, `${BASE}/batches/${batch.id}/specimens/${spec.id}`, {
        method: 'DELETE',
        cookie: cookieHeader,
      })
      expect(delRes.status).toBe(200)

      const remaining = await testDb.select().from(specimen).where(eq(specimen.id, spec.id)).get()
      expect(remaining).toBeUndefined()
    })

    it('returns 404 when specimen does not belong to the batch', async () => {
      const strain = await createTestStrain(testDb, { name: 'Strain NotBelong' })
      const definition = await createTestControlDefinition(testDb, {
        name: 'DefNotBelong',
        properties: {
          strains: [{ id: strain.id, name: 'Strain NotBelong', percentage: 100 }],
          targetDensity: 900,
        },
      })
      const app = createApp()
      const createRes = await authenticatedRequest(app, `${BASE}/${definition.id}/batches`, {
        method: 'POST',
        cookie: cookieHeader,
        json: { name: 'BatchNotBelong', productionDate: '2026-04-01' },
      })
      expect(createRes.status).toBe(201)
      const { batch } = (await createRes.json()) as { batch: { id: number } }

      const delRes = await authenticatedRequest(app, `${BASE}/batches/${batch.id}/specimens/99999`, {
        method: 'DELETE',
        cookie: cookieHeader,
      })
      expect(delRes.status).toBe(404)
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
