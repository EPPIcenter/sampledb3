import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { Hono } from 'hono'
import { loginAndGetCookie, authenticatedRequest } from '../../__tests__/helpers/test-client'
import { setupTestDatabase, cleanupTestDatabase } from '../../__tests__/helpers/db-setup'
import { createAuthRoutes } from '../auth'
import { createCollectionsRoutes } from '../collections'
import { handleRouteError } from '../../lib/error-handler'
import { utcNow } from '../../lib/datetime'
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
  createTestStudy,
  createTestStudySubject,
} from '../../__tests__/helpers/factories'
import { setScannerConfigurations } from '../../lib/settings'
import { eq } from 'drizzle-orm'
import {
  storageContainer,
  micronixTube,
  box,
  micronixPlate,
  specimen,
  qpcrExperiment,
  qpcrExperimentWell,
  containerDerivation,
  studySubject,
} from '../../db/schema'

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
      const now = utcNow()

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

  describe('POST /api/collections/resolve', () => {
    it('returns found: true with id and location when collection exists', async () => {
      const storageType = await createTestStorageType(testDb, { name: 'Shelf', description: 'Test' })
      const loc = await createTestLocation(testDb, {
        name: 'Freezer A',
        storageTypeId: String(storageType.id),
        canContainCollections: true,
        path: '/Freezer A',
      })
      const now = utcNow()
      const [boxRecord] = await testDb.insert(box).values({
        name: 'ResolveTestBox',
        locationId: loc.id,
        created: now,
        lastUpdated: now,
      }).returning()

      const app = createApp()
      const res = await authenticatedRequest(app, '/api/collections/resolve', {
        method: 'POST',
        cookie: cookieHeader,
        json: { name: 'ResolveTestBox', type: 'box' },
      })
      expect(res.status).toBe(200)
      const data = (await res.json()) as { found: boolean; id?: number; name?: string; type?: string; locationId?: number; locationName?: string }
      expect(data.found).toBe(true)
      expect(data.id).toBe(boxRecord!.id)
      expect(data.name).toBe('ResolveTestBox')
      expect(data.type).toBe('box')
      expect(data.locationId).toBe(loc.id)
      expect(data.locationName).toBeDefined()
    })

    it('returns found: false when collection does not exist', async () => {
      const app = createApp()
      const res = await authenticatedRequest(app, '/api/collections/resolve', {
        method: 'POST',
        cookie: cookieHeader,
        json: { name: 'NonexistentBox', type: 'box' },
      })
      expect(res.status).toBe(200)
      const data = (await res.json()) as { found: boolean }
      expect(data.found).toBe(false)
    })

    it('returns 401 when not authenticated', async () => {
      const app = createApp()
      const res = await authenticatedRequest(app, '/api/collections/resolve', {
        method: 'POST',
        json: { name: 'X', type: 'box' },
      })
      expect(res.status).toBe(401)
    })
  })

  describe('POST /api/collections/delete-with-contents', () => {
    it('returns 404 when collection does not exist', async () => {
      const app = createApp()
      const res = await authenticatedRequest(app, '/api/collections/delete-with-contents', {
        method: 'POST',
        cookie: cookieHeader,
        json: { collectionType: 'micronix_plate', id: 999_999, removeEmptySubjects: false },
      })
      expect(res.status).toBe(404)
    })

    it('deletes a micronix plate, its tubes, and fully-contained specimens', async () => {
      const storageType = await createTestStorageType(testDb, { name: 'StDel' })
      const loc = await createTestLocation(testDb, {
        name: 'LocDel',
        storageTypeId: String(storageType.id),
        canContainCollections: true,
      })
      const plate = await createTestMicronixPlate(testDb, { name: 'PlateDel1', locationId: loc.id })
      const st = await createTestSpecimenType(testDb, { name: 'STDel' })
      const sp = await createTestSpecimen(testDb, st.id)
      const unit = await createTestUnit(testDb, { symbol: 'uL', name: 'microliter', category: 'volume' })
      const now = utcNow()
      const [c] = await testDb
        .insert(storageContainer)
        .values({
          specimenId: sp.id,
          unitId: unit.id,
          totalQuantity: 1,
          remainingQuantity: 1,
          created: now,
          lastUpdated: now,
        })
        .returning()
      if (!c) throw new Error('no container')
      const barcode = `BCDEL${Date.now()}`
      await testDb.insert(micronixTube).values({
        id: c.id,
        collectionId: plate.id,
        barcode,
        position: 'A01',
      })

      const app = createApp()
      const res = await authenticatedRequest(app, '/api/collections/delete-with-contents', {
        method: 'POST',
        cookie: cookieHeader,
        json: { collectionType: 'micronix_plate', id: plate.id, removeEmptySubjects: false },
      })
      expect(res.status).toBe(200)
      const data = (await res.json()) as {
        containersDeleted: number
        specimensDeleted: number
        collectionDeleted: boolean
        subjectsDeleted: number
      }
      expect(data.containersDeleted).toBe(1)
      expect(data.specimensDeleted).toBe(1)
      expect(data.collectionDeleted).toBe(true)
      expect(data.subjectsDeleted).toBe(0)

      const leftPlate = await testDb.select().from(micronixPlate).where(eq(micronixPlate.id, plate.id)).all()
      expect(leftPlate.length).toBe(0)
      const leftSc = await testDb.select().from(storageContainer).where(eq(storageContainer.id, c.id)).all()
      expect(leftSc.length).toBe(0)
      const leftSp = await testDb.select().from(specimen).where(eq(specimen.id, sp.id)).all()
      expect(leftSp.length).toBe(0)
    })

    it('returns 409 with blockers when qPCR links a container in the collection', async () => {
      const storageType = await createTestStorageType(testDb, { name: 'StQ' })
      const loc = await createTestLocation(testDb, {
        name: 'LocQ',
        storageTypeId: String(storageType.id),
        canContainCollections: true,
      })
      const plate = await createTestMicronixPlate(testDb, { name: 'PlateQ1', locationId: loc.id })
      const st = await createTestSpecimenType(testDb, { name: 'STQ' })
      const sp = await createTestSpecimen(testDb, st.id)
      const unit = await createTestUnit(testDb, { symbol: 'uL', name: 'microliter', category: 'volume' })
      const now = utcNow()
      const [c] = await testDb
        .insert(storageContainer)
        .values({
          specimenId: sp.id,
          unitId: unit.id,
          totalQuantity: 1,
          remainingQuantity: 1,
          created: now,
          lastUpdated: now,
        })
        .returning()
      if (!c) throw new Error('no container')
      await testDb.insert(micronixTube).values({
        id: c.id,
        collectionId: plate.id,
        barcode: `BCQ${Date.now()}`,
        position: 'A01',
      })

      const [exp] = await testDb
        .insert(qpcrExperiment)
        .values({
          name: 'Q block',
          templateFormat: 'biorad',
          status: 'setup',
          created: now,
          lastUpdated: now,
        })
        .returning()
      if (!exp) throw new Error('no exp')
      await testDb.insert(qpcrExperimentWell).values({
        qpcrExperimentId: exp.id,
        wellPosition: 'A01',
        storageContainerId: c.id,
        contentType: 'unknown',
        standardDensity: null,
      })

      const app = createApp()
      const res = await authenticatedRequest(app, '/api/collections/delete-with-contents', {
        method: 'POST',
        cookie: cookieHeader,
        json: { collectionType: 'micronix_plate', id: plate.id, removeEmptySubjects: false },
      })
      expect(res.status).toBe(409)
      const data = (await res.json()) as {
        error: string
        blockers: Array<{ code: string; message: string }>
      }
      expect(data.error).toBeDefined()
      expect(data.blockers.length).toBeGreaterThan(0)
      const b = data.blockers[0]!
      expect(b.code).toBe('qpcr_wells_link_storage_containers')
      expect(b.message).toMatch(/qPCR/i)
    })

    it('returns 409 when a container derivation links inside and outside the collection', async () => {
      const storageType = await createTestStorageType(testDb, { name: 'StDer' })
      const loc1 = await createTestLocation(testDb, {
        name: 'L1',
        storageTypeId: String(storageType.id),
        canContainCollections: true,
      })
      const loc2 = await createTestLocation(testDb, {
        name: 'L2',
        storageTypeId: String(storageType.id),
        canContainCollections: true,
      })
      const p1 = await createTestMicronixPlate(testDb, { name: 'P1der', locationId: loc1.id })
      const p2 = await createTestMicronixPlate(testDb, { name: 'P2der', locationId: loc2.id })
      const st = await createTestSpecimenType(testDb, { name: 'STder' })
      const sp = await createTestSpecimen(testDb, st.id)
      const unit = await createTestUnit(testDb, { symbol: 'uL', name: 'm', category: 'volume' })
      const t = utcNow()
      const [parent] = await testDb
        .insert(storageContainer)
        .values({ specimenId: sp.id, unitId: unit.id, totalQuantity: 1, remainingQuantity: 1, created: t, lastUpdated: t })
        .returning()
      const [child] = await testDb
        .insert(storageContainer)
        .values({ specimenId: sp.id, unitId: unit.id, totalQuantity: 1, remainingQuantity: 1, created: t, lastUpdated: t })
        .returning()
      if (!parent || !child) throw new Error('sc')
      await testDb.insert(micronixTube).values({ id: parent.id, collectionId: p1.id, barcode: `BPD${Date.now()}`, position: 'A01' })
      await testDb.insert(micronixTube).values({ id: child.id, collectionId: p2.id, barcode: `BCH${Date.now()}b`, position: 'A01' })
      await testDb
        .insert(containerDerivation)
        .values({ parentContainerId: parent.id, childContainerId: child.id, derivationType: 'aliquot', created: t })

      const app = createApp()
      const res = await authenticatedRequest(app, '/api/collections/delete-with-contents', {
        method: 'POST',
        cookie: cookieHeader,
        json: { collectionType: 'micronix_plate', id: p1.id, removeEmptySubjects: false },
      })
      expect(res.status).toBe(409)
      const data = (await res.json()) as { error: string; blockers: Array<{ code: string; message: string }> }
      const der = data.blockers.find((x) => x.code === 'container_derivation_spans_outside_collection')
      expect(der).toBeDefined()
      expect(der!.message).toMatch(/derivation|parent|child|container/i)
    })

    it('deletes a plate that only has the child side of a cross-plate derivation (parent in other plate)', async () => {
      const storageType = await createTestStorageType(testDb, { name: 'StChOnly' })
      const loc1 = await createTestLocation(testDb, {
        name: 'Lch1',
        storageTypeId: String(storageType.id),
        canContainCollections: true,
      })
      const loc2 = await createTestLocation(testDb, {
        name: 'Lch2',
        storageTypeId: String(storageType.id),
        canContainCollections: true,
      })
      const pParent = await createTestMicronixPlate(testDb, { name: 'PparCh', locationId: loc1.id })
      const pChild = await createTestMicronixPlate(testDb, { name: 'PchOnly', locationId: loc2.id })
      const st = await createTestSpecimenType(testDb, { name: 'STch' })
      const sp = await createTestSpecimen(testDb, st.id)
      const unit = await createTestUnit(testDb, { symbol: 'uL', name: 'm', category: 'volume' })
      const t = utcNow()
      const [parent] = await testDb
        .insert(storageContainer)
        .values({ specimenId: sp.id, unitId: unit.id, totalQuantity: 1, remainingQuantity: 1, created: t, lastUpdated: t })
        .returning()
      const [child] = await testDb
        .insert(storageContainer)
        .values({ specimenId: sp.id, unitId: unit.id, totalQuantity: 1, remainingQuantity: 1, created: t, lastUpdated: t })
        .returning()
      if (!parent || !child) throw new Error('sc')
      await testDb.insert(micronixTube).values({ id: parent.id, collectionId: pParent.id, barcode: `Bpar${Date.now()}`, position: 'A01' })
      await testDb.insert(micronixTube).values({ id: child.id, collectionId: pChild.id, barcode: `Bch${Date.now()}`, position: 'A01' })
      const [der] = await testDb
        .insert(containerDerivation)
        .values({ parentContainerId: parent.id, childContainerId: child.id, derivationType: 'aliquot', created: t })
        .returning()
      if (!der) throw new Error('der')

      const app = createApp()
      const res = await authenticatedRequest(app, '/api/collections/delete-with-contents', {
        method: 'POST',
        cookie: cookieHeader,
        json: { collectionType: 'micronix_plate', id: pChild.id, removeEmptySubjects: false },
      })
      expect(res.status).toBe(200)

      const pChildLeft = await testDb.select().from(micronixPlate).where(eq(micronixPlate.id, pChild.id)).all()
      expect(pChildLeft.length).toBe(0)
      const pParentLeft = await testDb.select().from(micronixPlate).where(eq(micronixPlate.id, pParent.id)).all()
      expect(pParentLeft.length).toBe(1)
      const parentSc = await testDb.select().from(storageContainer).where(eq(storageContainer.id, parent.id)).all()
      expect(parentSc.length).toBe(1)
      const ders = await testDb.select().from(containerDerivation).where(eq(containerDerivation.id, der.id)).all()
      expect(ders.length).toBe(0)
    })

    it('does not remove a specimen that still has a container in another plate', async () => {
      const storageType = await createTestStorageType(testDb, { name: 'StSplit' })
      const loc = await createTestLocation(testDb, {
        name: 'Lsp',
        storageTypeId: String(storageType.id),
        canContainCollections: true,
      })
      const p1 = await createTestMicronixPlate(testDb, { name: 'Psplit1', locationId: loc.id })
      const p2 = await createTestMicronixPlate(testDb, { name: 'Psplit2', locationId: loc.id })
      const st = await createTestSpecimenType(testDb, { name: 'STsplit' })
      const sp = await createTestSpecimen(testDb, st.id)
      const unit = await createTestUnit(testDb, { symbol: 'uL', name: 'm', category: 'volume' })
      const t = utcNow()
      const [c1] = await testDb
        .insert(storageContainer)
        .values({ specimenId: sp.id, unitId: unit.id, totalQuantity: 1, remainingQuantity: 1, created: t, lastUpdated: t })
        .returning()
      const [c2] = await testDb
        .insert(storageContainer)
        .values({ specimenId: sp.id, unitId: unit.id, totalQuantity: 1, remainingQuantity: 1, created: t, lastUpdated: t })
        .returning()
      if (!c1 || !c2) throw new Error('sc')
      await testDb
        .insert(micronixTube)
        .values({ id: c1.id, collectionId: p1.id, barcode: `C1${Date.now()}`, position: 'A01' })
      await testDb
        .insert(micronixTube)
        .values({ id: c2.id, collectionId: p2.id, barcode: `C2${Date.now()}`, position: 'A01' })

      const app = createApp()
      const res = await authenticatedRequest(app, '/api/collections/delete-with-contents', {
        method: 'POST',
        cookie: cookieHeader,
        json: { collectionType: 'micronix_plate', id: p1.id, removeEmptySubjects: false },
      })
      expect(res.status).toBe(200)
      const left = await testDb.select().from(specimen).where(eq(specimen.id, sp.id)).all()
      expect(left.length).toBe(1)
    })

    it('deletes a study subject with no remaining specimens when removeEmptySubjects is true', async () => {
      const storageType = await createTestStorageType(testDb, { name: 'StSub' })
      const loc = await createTestLocation(testDb, {
        name: 'Lsub',
        storageTypeId: String(storageType.id),
        canContainCollections: true,
      })
      const plate = await createTestMicronixPlate(testDb, { name: 'PlSub', locationId: loc.id })
      const st = await createTestSpecimenType(testDb, { name: 'STsub' })
      const study = await createTestStudy(testDb, { title: 'S', shortCode: `SUBJ${Date.now()}` })
      const subject = await createTestStudySubject(testDb, { studyId: study.id, name: 'Sub1' })
      const sp = await createTestSpecimen(testDb, st.id, { studySubjectId: subject.id })
      const unit = await createTestUnit(testDb, { symbol: 'uL', name: 'm', category: 'volume' })
      const t = utcNow()
      const [c] = await testDb
        .insert(storageContainer)
        .values({ specimenId: sp.id, unitId: unit.id, totalQuantity: 1, remainingQuantity: 1, created: t, lastUpdated: t })
        .returning()
      if (!c) throw new Error('sc')
      await testDb.insert(micronixTube).values({ id: c.id, collectionId: plate.id, barcode: `Bsub${Date.now()}`, position: 'A01' })

      const app = createApp()
      const res = await authenticatedRequest(app, '/api/collections/delete-with-contents', {
        method: 'POST',
        cookie: cookieHeader,
        json: { collectionType: 'micronix_plate', id: plate.id, removeEmptySubjects: true },
      })
      expect(res.status).toBe(200)
      const data = (await res.json()) as { subjectsDeleted: number }
      expect(data.subjectsDeleted).toBe(1)
      const leftSubj = await testDb.select().from(studySubject).where(eq(studySubject.id, subject.id)).all()
      expect(leftSubj.length).toBe(0)
    })
  })
})
