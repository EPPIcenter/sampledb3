import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { Hono } from 'hono'
import { loginAndGetCookie, authenticatedRequest } from '../../__tests__/helpers/test-client'
import { setupTestDatabase, cleanupTestDatabase } from '../../__tests__/helpers/db-setup'
import { createAuthRoutes } from '../auth'
import { createSpecimensRoutes } from '../specimens'
import { handleRouteError } from '../../lib/error-handler'
import { setupPasswordRequirements, setupSessionSettings, createTestUser } from '../../__tests__/helpers/auth-helpers'
import {
  createTestStudy,
  createTestStudySubject,
  createTestSpecimenType,
  createTestLocation,
  createTestUnit,
  createTestStorageType,
} from '../../__tests__/helpers/factories'
import type { Database } from '../../db/client'
import {
  specimenTypeContainerType,
  containerTypeUnit,
  settings,
  cryovialBox,
  specimen,
} from '../../db/schema'
import { eq } from 'drizzle-orm'

describe('Specimens API', () => {
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
      email: 'member@test.com',
      name: 'Member',
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
    app.route('/api/specimens', createSpecimensRoutes(testDb))
  })

  afterEach(() => {
    if (sqlite) {
      cleanupTestDatabase(sqlite)
    }
  })

  beforeEach(async () => {
    cookie = await loginAndGetCookie(app, 'member@test.com', 'password123')
  })

  describe('GET /api/specimens', () => {
    it('returns 200 and specimens array', async () => {
      const res = await authenticatedRequest(app, '/api/specimens', {
        method: 'GET',
        cookie,
      })
      expect(res.status).toBe(200)
      const data = (await res.json()) as { specimens?: unknown[]; data?: unknown[] }
      const list = data.specimens ?? data.data
      expect(Array.isArray(list)).toBe(true)
    })

    it('returns 401 when not authenticated', async () => {
      const res = await authenticatedRequest(app, '/api/specimens', { method: 'GET' })
      expect(res.status).toBe(401)
    })
  })

  describe('POST /api/specimens/bulk', () => {
    let testStudy: Awaited<ReturnType<typeof createTestStudy>>
    let testSubject: Awaited<ReturnType<typeof createTestStudySubject>>
    let testSpecimenType: Awaited<ReturnType<typeof createTestSpecimenType>>
    let testLocation: Awaited<ReturnType<typeof createTestLocation>>

    beforeEach(async () => {
      testStudy = await createTestStudy(testDb, { title: 'Bulk Study', shortCode: 'BLK01' })
      testSubject = await createTestStudySubject(testDb, { studyId: testStudy.id, name: 'BULK-SUBJ' })
      testSpecimenType = await createTestSpecimenType(testDb, { name: 'Whole Blood' })
      const testStorageType = await createTestStorageType(testDb, { name: 'Freezer', description: 'Test' })
      testLocation = await createTestLocation(testDb, {
        name: 'Bulk Loc',
        parentId: null,
        storageTypeId: String(testStorageType.id),
        canContainCollections: true,
      })
      const testUnit = await createTestUnit(testDb, { symbol: 'uL', name: 'microliter', category: 'volume' })
      await testDb.insert(specimenTypeContainerType).values({
        specimenTypeId: testSpecimenType.id,
        containerType: 'cryovial_tube',
      })
      await testDb.insert(containerTypeUnit).values({
        containerType: 'cryovial_tube',
        unitId: testUnit.id,
      })
      const now = new Date().toISOString()
      await testDb.insert(settings).values({
        key: 'container_defaults',
        value: {
          cryovial_tube: { totalQuantity: 1.0, remainingQuantity: 1.0, defaultUnitSymbol: 'uL' },
        },
        userId: null,
      })
      await testDb.insert(cryovialBox).values({
        name: 'BULK-BOX',
        locationId: testLocation.id,
        created: now,
        lastUpdated: now,
      })
    })

    it('reuses existing specimen (get-or-create): same subject + type + date twice returns created: 1', async () => {
      const res = await authenticatedRequest(app, '/api/specimens/bulk', {
        method: 'POST',
        cookie,
        json: {
          specimens: [
            {
              sourceType: 'subject',
              studyShortCode: 'BLK01',
              subjectName: 'BULK-SUBJ',
              specimenTypeName: 'Whole Blood',
              collectionDate: '2024-06-01',
              container: {
                containerType: 'cryovial_tube',
                collectionName: 'BULK-BOX',
                position: 'A01',
              },
            },
            {
              sourceType: 'subject',
              studyShortCode: 'BLK01',
              subjectName: 'BULK-SUBJ',
              specimenTypeName: 'Whole Blood',
              collectionDate: '2024-06-01',
              container: {
                containerType: 'cryovial_tube',
                collectionName: 'BULK-BOX',
                position: 'A02',
              },
            },
          ],
        },
      })
      expect(res.status).toBe(201)
      const data = (await res.json()) as {
        specimens: Array<{ id: number }>
        created: number
        containersCreated: number
      }
      expect(data.created).toBe(1)
      expect(data.containersCreated).toBe(2)
      expect(data.specimens).toHaveLength(2)
      const specimenIds = data.specimens.map((s) => s.id)
      expect(specimenIds[0]).toBe(specimenIds[1])
      const count = await testDb
        .select({ id: specimen.id })
        .from(specimen)
        .where(eq(specimen.studySubjectId, testSubject.id))
      expect(count).toHaveLength(1)
    })
  })
})
