import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { Hono } from 'hono'
import { loginAndGetCookie, authenticatedRequest } from '../../__tests__/helpers/test-client'
import { setupTestDatabase, cleanupTestDatabase } from '../../__tests__/helpers/db-setup'
import { createAuthRoutes } from '../auth'
import { createImportsRoutes } from '../imports'
import { handleRouteError } from '../../lib/error-handler'
import type { Database } from '../../db/client'
import { setupPasswordRequirements, setupSessionSettings, createTestUser } from '../../__tests__/helpers/auth-helpers'
import {
  createTestStudy,
  createTestSpecimenType,
  createTestLocation,
  createTestStorageType,
  createTestUnit,
} from '../../__tests__/helpers/factories'
import { studySubject, specimen, specimenTypeContainerType, containerTypeUnit, micronixPlate, cryovialBox, settings } from '../../db/schema'
import { eq } from 'drizzle-orm'

describe('Imports API', () => {
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
    app.route('/api/imports', createImportsRoutes(testDb))

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
    app.route('/api/imports', createImportsRoutes(testDb))
    return app
  }

  describe('POST /api/imports/derivations-csv', () => {
    it('returns 400 with invalid body (empty csv)', async () => {
      const app = createApp()
      const res = await authenticatedRequest(app, '/api/imports/derivations-csv', {
        method: 'POST',
        cookie: cookieHeader,
        json: { csv: '' },
      })
      expect(res.status).toBe(400)
    })

    it('returns 401 when not authenticated', async () => {
      const app = createApp()
      const res = await authenticatedRequest(app, '/api/imports/derivations-csv', {
        method: 'POST',
        json: { csv: 'parent_container_id,container_type\n1,micronix_tube' },
      })
      expect(res.status).toBe(401)
    })
  })

  describe('POST /api/imports/derivations-csv/validate', () => {
    it('returns 400 with invalid body (empty csv)', async () => {
      const app = createApp()
      const res = await authenticatedRequest(app, '/api/imports/derivations-csv/validate', {
        method: 'POST',
        cookie: cookieHeader,
        json: { csv: '' },
      })
      expect(res.status).toBe(400)
    })

    it('returns 401 when not authenticated', async () => {
      const app = createApp()
      const res = await authenticatedRequest(app, '/api/imports/derivations-csv/validate', {
        method: 'POST',
        json: { csv: 'header' },
      })
      expect(res.status).toBe(401)
    })
  })

  describe('POST /api/imports/bulk-combined', () => {
    it('full_file mode rolls back all data when any subject is invalid', async () => {
      await createTestStudy(testDb, { title: 'Import Study', shortCode: 'IMPBULK' })
      await createTestSpecimenType(testDb, { name: 'Whole Blood' })
      const beforeSubjects = await testDb.select().from(studySubject)
      const beforeSpecimens = await testDb.select().from(specimen)

      const app = createApp()
      const res = await authenticatedRequest(app, '/api/imports/bulk-combined', {
        method: 'POST',
        cookie: cookieHeader,
        json: {
          studyShortCode: 'IMPBULK',
          atomicMode: 'full_file',
          subjects: [
            {
              subjectName: 'SUBJ-OK',
              specimens: [{ specimenTypeName: 'Whole Blood', collectionDate: '2025-01-01' }],
            },
            {
              subjectName: 'SUBJ-BAD',
              specimens: [{ specimenTypeName: 'Missing Type', collectionDate: '2025-01-02' }],
            },
          ],
        },
      })

      expect(res.status).toBe(400)
      const afterSubjects = await testDb.select().from(studySubject)
      const afterSpecimens = await testDb.select().from(specimen)
      expect(afterSubjects.length).toBe(beforeSubjects.length)
      expect(afterSpecimens.length).toBe(beforeSpecimens.length)
    })

    it('per_subject mode allows partial success and returns indexed errors', async () => {
      await createTestStudy(testDb, { title: 'Import Study2', shortCode: 'IMPBULK2' })
      await createTestSpecimenType(testDb, { name: 'Plasma' })
      const app = createApp()

      const res = await authenticatedRequest(app, '/api/imports/bulk-combined', {
        method: 'POST',
        cookie: cookieHeader,
        json: {
          studyShortCode: 'IMPBULK2',
          atomicMode: 'per_subject',
          subjects: [
            {
              subjectName: 'PARTIAL-OK',
              specimens: [{ specimenTypeName: 'Plasma', collectionDate: '2025-03-01' }],
            },
            {
              subjectName: 'PARTIAL-BAD',
              specimens: [{ specimenTypeName: 'Unknown Specimen', collectionDate: '2025-03-02' }],
            },
          ],
        },
      })

      expect(res.status).toBe(201)
      const data = (await res.json()) as { results: Array<{ subject: { name: string } }>; errors?: Array<{ index: number; error: string }> }
      expect(data.results).toHaveLength(1)
      expect(data.results[0].subject.name).toBe('PARTIAL-OK')
      expect(data.errors).toBeDefined()
      expect(data.errors?.[0]?.index).toBe(1)

      const persisted = await testDb
        .select()
        .from(studySubject)
      expect(persisted.find((s) => s.name === 'PARTIAL-OK')).toBeDefined()
      expect(persisted.find((s) => s.name === 'PARTIAL-BAD')).toBeUndefined()
    })

    it('returns 400 when createCollections specifies a location that cannot contain collections', async () => {
      await createTestStudy(testDb, { title: 'Location Check Study', shortCode: 'LOCCHECK' })
      await createTestSpecimenType(testDb, { name: 'Whole Blood' })
      const storageType = await createTestStorageType(testDb, { name: 'Freezer', description: 'Test' })
      const noCollLoc = await createTestLocation(testDb, {
        name: 'No Collections Here',
        parentId: null,
        storageTypeId: String(storageType.id),
        canContainCollections: false,
      })

      const app = createApp()
      const res = await authenticatedRequest(app, '/api/imports/bulk-combined', {
        method: 'POST',
        cookie: cookieHeader,
        json: {
          studyShortCode: 'LOCCHECK',
          atomicMode: 'full_file',
          createCollections: [
            { type: 'micronix_plate', name: 'Plate1', locationId: noCollLoc.id },
          ],
          subjects: [
            {
              subjectName: 'SUBJ1',
              specimens: [{ specimenTypeName: 'Whole Blood', collectionDate: '2025-01-01' }],
            },
          ],
        },
      })

      expect(res.status).toBe(400)
      const body = (await res.json()) as { error?: string }
      expect(body.error).toContain('cannot contain collections')

      const plates = await testDb.select().from(micronixPlate).where(eq(micronixPlate.name, 'Plate1'))
      expect(plates.length).toBe(0)
    })

    it('returns 400 when specimen container collectionLocationId points to a location that cannot contain collections', async () => {
      await createTestStudy(testDb, { title: 'Inline Loc Check Study', shortCode: 'INLINELOC' })
      const testSpecimenType = await createTestSpecimenType(testDb, { name: 'Whole Blood' })
      const storageType = await createTestStorageType(testDb, { name: 'Freezer', description: 'Test' })
      const noCollLoc = await createTestLocation(testDb, {
        name: 'No Collections',
        parentId: null,
        storageTypeId: String(storageType.id),
        canContainCollections: false,
      })
      const testUnit = await createTestUnit(testDb, { symbol: 'uL', name: 'microliter', category: 'volume' })
      await testDb.insert(specimenTypeContainerType).values({
        specimenTypeId: testSpecimenType.id,
        containerType: 'cryovial_tube',
      })
      await testDb.insert(containerTypeUnit).values({ containerType: 'cryovial_tube', unitId: testUnit.id })
      await testDb.insert(settings).values({
        key: 'container_defaults',
        userId: null,
        value: {
          cryovial_tube: { totalQuantity: 1.0, remainingQuantity: 1.0, defaultUnitSymbol: 'uL' },
        },
      })

      const app = createApp()
      const res = await authenticatedRequest(app, '/api/imports/bulk-combined', {
        method: 'POST',
        cookie: cookieHeader,
        json: {
          studyShortCode: 'INLINELOC',
          atomicMode: 'full_file',
          subjects: [
            {
              subjectName: 'SUBJ1',
              specimens: [
                {
                  specimenTypeName: 'Whole Blood',
                  collectionDate: '2025-01-01',
                  container: {
                    containerType: 'cryovial_tube',
                    collectionName: 'NewBox',
                    collectionLocationId: noCollLoc.id,
                    barcode: 'BC1',
                    position: 'A01',
                  },
                },
              ],
            },
          ],
        },
      })

      expect(res.status).toBe(400)
      const body = (await res.json()) as { error?: string }
      expect(body.error).toContain('cannot contain collections')

      const boxes = await testDb.select().from(cryovialBox).where(eq(cryovialBox.name, 'NewBox'))
      expect(boxes.length).toBe(0)
    })
  })

  describe('POST /api/imports/bulk-combined/validate', () => {
    it('returns valid: true for a valid payload (no containers)', async () => {
      await createTestStudy(testDb, { title: 'Validate Study', shortCode: 'VAL' })
      await createTestSpecimenType(testDb, { name: 'Whole Blood' })
      const app = createApp()
      const res = await authenticatedRequest(app, '/api/imports/bulk-combined/validate', {
        method: 'POST',
        cookie: cookieHeader,
        json: {
          studyShortCode: 'VAL',
          atomicMode: 'full_file',
          subjects: [
            { subjectName: 'S1', specimens: [{ specimenTypeName: 'Whole Blood', collectionDate: '2025-01-01' }] },
            { subjectName: 'S2', specimens: [{ specimenTypeName: 'Whole Blood', collectionDate: '2025-01-02' }] },
          ],
        },
      })
      expect(res.status).toBe(200)
      const data = (await res.json()) as { valid: boolean; errors: Array<{ message: string }> }
      expect(data.valid).toBe(true)
      expect(data.errors).toHaveLength(0)
    })

    it('returns valid: false and errors when study does not exist', async () => {
      const app = createApp()
      const res = await authenticatedRequest(app, '/api/imports/bulk-combined/validate', {
        method: 'POST',
        cookie: cookieHeader,
        json: {
          studyShortCode: 'NOSTUDY',
          atomicMode: 'full_file',
          subjects: [{ subjectName: 'S1', specimens: [{ specimenTypeName: 'Any', collectionDate: '2025-01-01' }] }],
        },
      })
      expect(res.status).toBe(200)
      const data = (await res.json()) as { valid: boolean; errors: Array<{ message: string }> }
      expect(data.valid).toBe(false)
      expect(data.errors.length).toBeGreaterThan(0)
      expect(data.errors.some((e) => e.message.toLowerCase().includes('study') || e.message.includes('not found'))).toBe(true)
    })

    it('returns valid: false when specimen type is not found', async () => {
      await createTestStudy(testDb, { title: 'Val Study', shortCode: 'VAL2' })
      const app = createApp()
      const res = await authenticatedRequest(app, '/api/imports/bulk-combined/validate', {
        method: 'POST',
        cookie: cookieHeader,
        json: {
          studyShortCode: 'VAL2',
          atomicMode: 'full_file',
          subjects: [
            { subjectName: 'S1', specimens: [{ specimenTypeName: 'Nonexistent Type', collectionDate: '2025-01-01' }] },
          ],
        },
      })
      expect(res.status).toBe(200)
      const data = (await res.json()) as { valid: boolean; errors: Array<{ message: string }> }
      expect(data.valid).toBe(false)
      expect(data.errors.some((e) => e.message.includes('Nonexistent Type') || e.message.includes('not found'))).toBe(true)
    })

    it('returns valid: false when createCollections location cannot contain collections', async () => {
      await createTestStudy(testDb, { title: 'Val Loc', shortCode: 'VALLOC' })
      await createTestSpecimenType(testDb, { name: 'Blood' })
      const storageType = await createTestStorageType(testDb, { name: 'Freezer', description: 'Test' })
      const noCollLoc = await createTestLocation(testDb, {
        name: 'No Coll',
        parentId: null,
        storageTypeId: String(storageType.id),
        canContainCollections: false,
      })
      const app = createApp()
      const res = await authenticatedRequest(app, '/api/imports/bulk-combined/validate', {
        method: 'POST',
        cookie: cookieHeader,
        json: {
          studyShortCode: 'VALLOC',
          atomicMode: 'full_file',
          createCollections: [{ type: 'micronix_plate', name: 'P1', locationId: noCollLoc.id }],
          subjects: [
            { subjectName: 'S1', specimens: [{ specimenTypeName: 'Blood', collectionDate: '2025-01-01' }] },
          ],
        },
      })
      expect(res.status).toBe(200)
      const data = (await res.json()) as { valid: boolean; errors: Array<{ message: string }> }
      expect(data.valid).toBe(false)
      expect(data.errors.some((e) => e.message.includes('cannot contain collections'))).toBe(true)
    })

    it('returns valid: false when collection date is invalid (future)', async () => {
      await createTestStudy(testDb, { title: 'Date Study', shortCode: 'DATED' })
      await createTestSpecimenType(testDb, { name: 'Blood' })
      const app = createApp()
      const res = await authenticatedRequest(app, '/api/imports/bulk-combined/validate', {
        method: 'POST',
        cookie: cookieHeader,
        json: {
          studyShortCode: 'DATED',
          atomicMode: 'full_file',
          subjects: [
            { subjectName: 'S1', specimens: [{ specimenTypeName: 'Blood', collectionDate: '2030-01-01' }] },
          ],
        },
      })
      expect(res.status).toBe(200)
      const data = (await res.json()) as { valid: boolean; errors: Array<{ message: string }> }
      expect(data.valid).toBe(false)
      expect(data.errors.some((e) => e.message.toLowerCase().includes('date') || e.message.toLowerCase().includes('future'))).toBe(true)
    })
  })
})
