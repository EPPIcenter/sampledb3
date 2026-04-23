import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { Hono } from 'hono'
import { loginAndGetCookie, authenticatedRequest } from '../../__tests__/helpers/test-client'
import { setupTestDatabase, cleanupTestDatabase } from '../../__tests__/helpers/db-setup'
import { createAuthRoutes } from '../auth'
import { createContainersRoutes } from '../containers'
import { handleRouteError } from '../../lib/error-handler'
import { utcNow } from '../../lib/datetime'
import type { Database } from '../../db/client'
import { setupPasswordRequirements, setupSessionSettings, setupPaginationSettings, createTestUser } from '../../__tests__/helpers/auth-helpers'
import {
  createTestStudy,
  createTestStudySubject,
  createTestSpecimen,
  createTestSpecimenType,
  createTestLocation,
  createTestUnit,
  createTestStorageType,
} from '../../__tests__/helpers/factories'
import { cryovialBox, cryovialTube, specimen, storageContainer, micronixPlate, micronixTube, box, sheet, paper, staticWell } from '../../db/schema'
import { eq } from 'drizzle-orm'

describe('Containers API', () => {
  let testDb: Database
  let sqlite: Awaited<ReturnType<typeof setupTestDatabase>>['sqlite']
  let cookieHeader: string

  beforeEach(async () => {
    const setup = await setupTestDatabase()
    testDb = setup.db
    sqlite = setup.sqlite

    await setupPasswordRequirements(testDb, 8)
    await setupSessionSettings(testDb, 604800)
    await setupPaginationSettings(testDb)

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
    app.route('/api/containers', createContainersRoutes(testDb))

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
    app.route('/api/containers', createContainersRoutes(testDb))
    return app
  }

  describe('GET /api/containers', () => {
    it('returns 200 and containers with pagination when authenticated', async () => {
      const app = createApp()
      const res = await authenticatedRequest(app, '/api/containers', {
        method: 'GET',
        cookie: cookieHeader,
      })
      expect(res.status).toBe(200)
      const data = (await res.json()) as { containers: unknown[]; pagination: unknown }
      expect(data).toHaveProperty('containers')
      expect(data).toHaveProperty('pagination')
      expect(Array.isArray(data.containers)).toBe(true)
    })

    it('returns 401 when not authenticated', async () => {
      const app = createApp()
      const res = await authenticatedRequest(app, '/api/containers', { method: 'GET' })
      expect(res.status).toBe(401)
    })
  })

  describe('GET /api/containers/:id', () => {
    it('returns 404 for non-existent ID', async () => {
      const app = createApp()
      const res = await authenticatedRequest(app, '/api/containers/99999', {
        method: 'GET',
        cookie: cookieHeader,
      })
      expect(res.status).toBe(404)
    })

    it('returns 401 when not authenticated', async () => {
      const app = createApp()
      const res = await authenticatedRequest(app, '/api/containers/1', { method: 'GET' })
      expect(res.status).toBe(401)
    })
  })

  describe('PATCH /api/containers/:id', () => {
    let testLocation: Awaited<ReturnType<typeof createTestLocation>>
    let testUnit: Awaited<ReturnType<typeof createTestUnit>>
    let testSpecimenType: Awaited<ReturnType<typeof createTestSpecimenType>>

    beforeEach(async () => {
      const testStorageType = await createTestStorageType(testDb, { name: 'Freezer', description: 'Test' })
      testLocation = await createTestLocation(testDb, {
        name: `Patch Loc ${Date.now()}`,
        parentId: null,
        storageTypeId: String(testStorageType.id),
        canContainCollections: true,
      })
      testUnit = await createTestUnit(testDb, { symbol: 'uL', name: 'microliter', category: 'volume' })
      testSpecimenType = await createTestSpecimenType(testDb, { name: 'Whole Blood' })
    })

    it('updates cryovial_tube barcode', async () => {
      const now = utcNow()
      const [box] = await testDb
        .insert(cryovialBox)
        .values({ name: `BOX-PATCH-${Date.now()}`, locationId: testLocation.id, created: now, lastUpdated: now })
        .returning()
      const testStudy = await createTestStudy(testDb, { title: 'P Study', shortCode: 'PST' + Date.now() })
      const subj = await createTestStudySubject(testDb, { studyId: testStudy.id, name: 'S1' })
      const [spec] = await testDb
        .insert(specimen)
        .values({ studySubjectId: subj.id, specimenTypeId: testSpecimenType.id, created: now, lastUpdated: now })
        .returning()
      const [container] = await testDb
        .insert(storageContainer)
        .values({ specimenId: spec.id, unitId: testUnit.id, totalQuantity: 1, remainingQuantity: 1, created: now, lastUpdated: now })
        .returning()
      await testDb.insert(cryovialTube).values({ id: container.id, collectionId: box.id, barcode: 'OLD-CRYO', position: 'A01' })

      const app = createApp()
      const res = await authenticatedRequest(app, `/api/containers/${container.id}`, {
        method: 'PATCH',
        cookie: cookieHeader,
        json: { barcode: 'NEW-CRYO-1' },
      })
      expect(res.status).toBe(200)
      const row = await testDb.select().from(cryovialTube).where(eq(cryovialTube.id, container.id)).get()
      expect(row?.barcode).toBe('NEW-CRYO-1')
    })

    it('returns 400 when cryovial_tube barcode is already in use', async () => {
      const now = utcNow()
      const [box] = await testDb
        .insert(cryovialBox)
        .values({ name: `BOX-PATCH2-${Date.now()}`, locationId: testLocation.id, created: now, lastUpdated: now })
        .returning()
      const testStudy = await createTestStudy(testDb, { title: 'P2', shortCode: 'PS2' + Date.now() })
      const subj = await createTestStudySubject(testDb, { studyId: testStudy.id, name: 'S2' })

      const makeCryo = async (barcode: string, position: string) => {
        const [spec] = await testDb
          .insert(specimen)
          .values({ studySubjectId: subj.id, specimenTypeId: testSpecimenType.id, created: now, lastUpdated: now })
          .returning()
        const [c] = await testDb
          .insert(storageContainer)
          .values({ specimenId: spec.id, unitId: testUnit.id, totalQuantity: 1, remainingQuantity: 1, created: now, lastUpdated: now })
          .returning()
        await testDb.insert(cryovialTube).values({ id: c.id, collectionId: box.id, barcode, position })
        return c.id
      }

      await makeCryo('TAKEN-BC', 'A01')
      const id2 = await makeCryo('OTHER-BC', 'A02')

      const app = createApp()
      const res = await authenticatedRequest(app, `/api/containers/${id2}`, {
        method: 'PATCH',
        cookie: cookieHeader,
        json: { barcode: 'TAKEN-BC' },
      })
      expect(res.status).toBe(400)
      const j = (await res.json()) as { error: string }
      expect(j.error).toContain('already in use')
    })

    it('returns 400 when setting micronix_tube barcode to null', async () => {
      const now = utcNow()
      const [plate] = await testDb
        .insert(micronixPlate)
        .values({ name: `PL-${Date.now()}`, locationId: testLocation.id, created: now, lastUpdated: now, barcode: null })
        .returning()
      const sp = await createTestSpecimen(testDb, testSpecimenType.id)
      const [container] = await testDb
        .insert(storageContainer)
        .values({ specimenId: sp.id, unitId: testUnit.id, totalQuantity: 1, remainingQuantity: 1, created: now, lastUpdated: now })
        .returning()
      await testDb.insert(micronixTube).values({ id: container.id, collectionId: plate.id, barcode: 'MX-1', position: 'A01' })

      const app = createApp()
      const res = await authenticatedRequest(app, `/api/containers/${container.id}`, {
        method: 'PATCH',
        cookie: cookieHeader,
        json: { barcode: null },
      })
      expect(res.status).toBe(400)
      const j = (await res.json()) as { error: string }
      expect(j.error).toMatch(/cleared|Micronix/i)
    })

    it('returns 400 when static_well has barcode in body', async () => {
      const now = utcNow()
      const [plate] = await testDb
        .insert(micronixPlate)
        .values({ name: `PL2-${Date.now()}`, locationId: testLocation.id, created: now, lastUpdated: now, barcode: null })
        .returning()
      const sp = await createTestSpecimen(testDb, testSpecimenType.id)
      const [container] = await testDb
        .insert(storageContainer)
        .values({ specimenId: sp.id, unitId: testUnit.id, totalQuantity: 1, remainingQuantity: 1, created: now, lastUpdated: now })
        .returning()
      await testDb.insert(staticWell).values({ id: container.id, collectionId: plate.id, position: 'A01' })

      const app = createApp()
      const res = await authenticatedRequest(app, `/api/containers/${container.id}`, {
        method: 'PATCH',
        cookie: cookieHeader,
        json: { barcode: 'Nope' },
      })
      expect(res.status).toBe(400)
    })

    it('updates paper barcode', async () => {
      const now = utcNow()
      const [b] = await testDb
        .insert(box)
        .values({ name: `BX-${Date.now()}`, locationId: testLocation.id, created: now, lastUpdated: now })
        .returning()
      const [sh] = await testDb
        .insert(sheet)
        .values({ name: 'S1', boxId: b.id, bagId: null, created: now, lastUpdated: now })
        .returning()
      const sp = await createTestSpecimen(testDb, testSpecimenType.id)
      const [container] = await testDb
        .insert(storageContainer)
        .values({ specimenId: sp.id, unitId: testUnit.id, totalQuantity: 1, remainingQuantity: 1, created: now, lastUpdated: now })
        .returning()
      await testDb.insert(paper).values({ id: container.id, sheetId: sh.id, barcode: 'P-OLD', position: null })

      const app = createApp()
      const res = await authenticatedRequest(app, `/api/containers/${container.id}`, {
        method: 'PATCH',
        cookie: cookieHeader,
        json: { barcode: 'P-NEW' },
      })
      expect(res.status).toBe(200)
      const row = await testDb.select().from(paper).where(eq(paper.id, container.id)).get()
      expect(row?.barcode).toBe('P-NEW')
    })
  })
})
