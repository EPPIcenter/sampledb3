import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { authenticatedRequest } from '../../__tests__/helpers/test-client'
import {
  setupAuthenticatedRouteTest,
  type AuthenticatedRouteTestContext,
} from '../../__tests__/helpers/authenticated-route-test'
import { createCollectionsRoutes } from '../collections'
import { utcNow } from '../../lib/datetime'
import {
  createTestLocation,
  createTestStorageType,
  createTestMicronixPlate,
  createTestSpecimenType,
  createTestSpecimen,
  createTestUnit,
  createTestStudy,
  createTestStudySubject,
  createTestBox,
  createTestSheet,
  createTestStorageContainer,
  createTestMicronixTube,
  createTestCryovialBox,
  createTestCryovialTube,
} from '../../__tests__/helpers/factories'
import { setScannerConfigurations } from '../../lib/settings'
import { eq } from 'drizzle-orm'
import {
  storageContainer,
  micronixTube,
  box,
  bag,
  sheet,
  paper,
  cryovialBox,
  cryovialTube,
  micronixPlate,
  specimen,
  qpcrExperiment,
  qpcrExperimentWell,
  containerDerivation,
  studySubject,
  users,
} from '../../db/schema'

describe('Collections API', () => {
  let ctx: AuthenticatedRouteTestContext

  beforeEach(async () => {
    ctx = await setupAuthenticatedRouteTest({
      user: {
        email: 'admin@test.com',
        name: 'Admin',
        password: 'password123',
        role: 'admin',
      },
      mount: (app, { db }) => {
        app.route('/api/collections', createCollectionsRoutes(db))
      },
    })
  })

  afterEach(() => {
    ctx.cleanup()
  })

  describe('GET /api/collections/plates/micronix/:id', () => {
    it('returns 404 for non-existent plate', async () => {
      const res = await ctx.request('/api/collections/plates/micronix/99999', {
        method: 'GET',
      })
      expect(res.status).toBe(404)
      const data = (await res.json()) as { error: string }
      expect(data.error).toBe('Plate not found')
    })

    it('returns 400 for invalid plate ID', async () => {
      const res = await ctx.request('/api/collections/plates/micronix/notanid', {
        method: 'GET',
      })
      expect(res.status).toBe(400)
    })

    it('returns 401 when not authenticated', async () => {
      const res = await authenticatedRequest(ctx.createRequestApp(), '/api/collections/plates/micronix/1', {
        method: 'GET',
      })
      expect(res.status).toBe(401)
    })

    it('returns 200 and plate detail when plate exists', async () => {
      const storageType = await createTestStorageType(ctx.db, {
        name: 'Shelf',
        description: 'Test',
      })
      const loc = await createTestLocation(ctx.db, {
        name: 'Loc1',
        storageTypeId: String(storageType.id),
        canContainCollections: true,
      })
      const plate = await createTestMicronixPlate(ctx.db, {
        name: 'Plate1',
        locationId: loc.id,
      })

      const res = await ctx.request(
        `/api/collections/plates/micronix/${plate.id}`,
        { method: 'GET' }
      )
      expect(res.status).toBe(200)
      const data = (await res.json()) as { plate: { id: number; name: string }; wells: unknown }
      expect(data.plate).toBeDefined()
      expect(data.plate.id).toBe(plate.id)
      expect(data.plate.name).toBe('Plate1')
      expect(data.wells).toBeDefined()
    })
  })

  describe('GET collection detail with unplaced Containers', () => {
    async function setupCollectionFixtures() {
      const storageType = await createTestStorageType(ctx.db, { name: 'Unplaced freezer' })
      const loc = await createTestLocation(ctx.db, {
        name: 'Unplaced freezer',
        storageTypeId: String(storageType.id),
        canContainCollections: true,
      })
      const unit = await createTestUnit(ctx.db, { symbol: 'uL', name: 'microliter', category: 'volume' })
      const specimenType = await createTestSpecimenType(ctx.db, { name: 'Blood' })
      const testSpecimen = await createTestSpecimen(ctx.db, specimenType.id)
      const newContainer = () =>
        createTestStorageContainer(ctx.db, { specimenId: testSpecimen.id, unitId: unit.id })
      return { locationId: loc.id, newContainer }
    }

    it('returns every plate tube, listing those without a grid cell under unplaced', async () => {
      const { locationId, newContainer } = await setupCollectionFixtures()
      const plate = await createTestMicronixPlate(ctx.db, { name: 'Plate-unplaced', locationId })
      const tubes: Array<[string, string | null]> = [
        ['MX-A01', 'A01'],
        ['MX-NULL-1', null],
        ['MX-NULL-2', null],
        ['MX-BAD', 'A1145868849'],
      ]
      for (const [barcode, position] of tubes) {
        const c = await newContainer()
        await createTestMicronixTube(ctx.db, { containerId: c.id, collectionId: plate.id, barcode, position })
      }

      const res = await ctx.request(`/api/collections/plates/micronix/${plate.id}`, { method: 'GET' })

      expect(res.status).toBe(200)
      const data = (await res.json()) as {
        wells: Record<string, { barcode: string }>
        unplaced: Array<{ barcode: string; position?: string; container?: unknown }>
      }
      expect(Object.keys(data.wells)).toEqual(['A01'])
      expect(data.unplaced.map((e) => [e.barcode, e.position ?? null])).toEqual([
        ['MX-BAD', 'A1145868849'],
        ['MX-NULL-1', null],
        ['MX-NULL-2', null],
      ])
      expect(data.unplaced.every((e) => e.container != null)).toBe(true)
    })

    it('returns every cryovial tube, listing those without a grid cell under unplaced', async () => {
      const { locationId, newContainer } = await setupCollectionFixtures()
      const boxRecord = await createTestCryovialBox(ctx.db, { name: 'Box-unplaced', locationId })
      const tubes: Array<[string, string | null]> = [
        ['CV-J10', 'J10'],
        ['CV-NULL', null],
        ['CV-DASH', '--A01'],
        ['CV-NA', 'NA01'],
      ]
      for (const [barcode, position] of tubes) {
        const c = await newContainer()
        await createTestCryovialTube(ctx.db, { containerId: c.id, collectionId: boxRecord.id, barcode, position })
      }

      const res = await ctx.request(`/api/collections/boxes/cryovial/${boxRecord.id}`, { method: 'GET' })

      expect(res.status).toBe(200)
      const data = (await res.json()) as {
        positions: Record<string, Array<{ barcode: string }>>
        unplaced: Array<{ barcode: string; position?: string }>
      }
      expect(Object.keys(data.positions)).toEqual(['J10'])
      expect(data.unplaced.map((e) => [e.barcode, e.position ?? null])).toEqual([
        ['CV-DASH', '--A01'],
        ['CV-NA', 'NA01'],
        ['CV-NULL', null],
      ])
    })

    it('returns 404 for a missing cryovial box', async () => {
      const res = await ctx.request('/api/collections/boxes/cryovial/99999', { method: 'GET' })
      expect(res.status).toBe(404)
    })
  })

  describe('POST /api/collections/check', () => {
    it('returns 200 and results for check request', async () => {
      const res = await ctx.request('/api/collections/check', {
        method: 'POST',
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

    it('rejects sheets, whose names only identify a record within a box or bag', async () => {
      const res = await ctx.request('/api/collections/check', {
        method: 'POST',
        json: { collections: [{ identifier: 'Sheet-1', type: 'sheet' }] },
      })
      expect(res.status).toBe(400)
    })

    it('returns 400 for invalid body', async () => {
      const res = await ctx.request('/api/collections/check', {
        method: 'POST',
        json: { collections: 'not-an-array' },
      })
      expect(res.status).toBe(400)
    })

    it('returns 401 when not authenticated', async () => {
      const res = await authenticatedRequest(ctx.createRequestApp(), '/api/collections/check', {
        method: 'POST',
        json: { collections: [] },
      })
      expect(res.status).toBe(401)
    })
  })

  describe('POST /api/collections/containers/move', () => {
    it('returns 400 for invalid move payload', async () => {
      const res = await ctx.request('/api/collections/containers/move', {
        method: 'POST',
        json: { moves: 'not-an-array' },
      })
      expect(res.status).toBe(400)
    })

    it.each(['Z99', 'hello world'])('returns 400 naming the row for a move to %s and writes nothing', async (target) => {
      const storageType = await createTestStorageType(ctx.db, { name: 'Freezer' })
      const loc = await createTestLocation(ctx.db, { name: 'Loc', storageTypeId: String(storageType.id) })
      const plate = await createTestMicronixPlate(ctx.db, { name: 'P96', locationId: loc.id })
      const container = await createTestStorageContainer(ctx.db)
      await createTestMicronixTube(ctx.db, { containerId: container.id, collectionId: plate.id, barcode: 'MT-1', position: 'A01' })

      const res = await ctx.request('/api/collections/containers/move', {
        method: 'POST',
        json: {
          mappings: [{ fromCollectionName: 'P96', toCollectionName: 'P96' }],
          moves: [{ identifier: { type: 'barcode', barcode: 'MT-1' }, targetPosition: target }],
        },
      })

      expect(res.status).toBe(400)
      const body = await res.json()
      expect(body.errors).toEqual([{ row: 1, error: expect.stringContaining(`Position "${target}"`) }])
      const tube = ctx.db.select().from(micronixTube).where(eq(micronixTube.id, container.id)).get()
      expect(tube?.position).toBe('A01')
    })

    it('stores a1 as A01', async () => {
      const storageType = await createTestStorageType(ctx.db, { name: 'Freezer' })
      const loc = await createTestLocation(ctx.db, { name: 'Loc', storageTypeId: String(storageType.id) })
      const plate = await createTestMicronixPlate(ctx.db, { name: 'P96', locationId: loc.id })
      const container = await createTestStorageContainer(ctx.db)
      await createTestMicronixTube(ctx.db, { containerId: container.id, collectionId: plate.id, barcode: 'MT-1', position: 'B05' })

      const res = await ctx.request('/api/collections/containers/move', {
        method: 'POST',
        json: {
          mappings: [{ fromCollectionName: 'P96', toCollectionName: 'P96' }],
          moves: [{ identifier: { type: 'barcode', barcode: 'MT-1' }, targetPosition: 'a1' }],
        },
      })

      expect(res.status).toBe(200)
      const tube = ctx.db.select().from(micronixTube).where(eq(micronixTube.id, container.id)).get()
      expect(tube?.position).toBe('A01')
    })

    it('returns 200 with moved and errors when a best-effort move moves some Containers', async () => {
      const storageType = await createTestStorageType(ctx.db, { name: 'Freezer' })
      const loc = await createTestLocation(ctx.db, { name: 'Loc', storageTypeId: String(storageType.id) })
      const plate = await createTestMicronixPlate(ctx.db, { name: 'P96', locationId: loc.id })
      const container = await createTestStorageContainer(ctx.db)
      await createTestMicronixTube(ctx.db, { containerId: container.id, collectionId: plate.id, barcode: 'MT-1', position: 'A01' })

      const res = await ctx.request('/api/collections/containers/move', {
        method: 'POST',
        json: {
          atomicMode: 'best_effort',
          mappings: [{ fromCollectionName: 'P96', toCollectionName: 'P96' }],
          moves: [
            { identifier: { type: 'barcode', barcode: 'MT-1' }, targetPosition: 'C03' },
            { identifier: { type: 'barcode', barcode: 'MISSING' }, targetPosition: 'D04' },
          ],
        },
      })

      expect(res.status).toBe(200)
      expect(await res.json()).toEqual({ success: false, moved: 1, errors: [{ row: 2, error: 'Container not found' }] })
      const tube = ctx.db.select().from(micronixTube).where(eq(micronixTube.id, container.id)).get()
      expect(tube?.position).toBe('C03')
    })

    it('records the logged-in user and time on a moved Container', async () => {
      const storageType = await createTestStorageType(ctx.db, { name: 'Freezer' })
      const loc = await createTestLocation(ctx.db, { name: 'Loc', storageTypeId: String(storageType.id) })
      const plate = await createTestMicronixPlate(ctx.db, { name: 'P96', locationId: loc.id })
      const container = await createTestStorageContainer(ctx.db)
      await createTestMicronixTube(ctx.db, { containerId: container.id, collectionId: plate.id, barcode: 'MT-1', position: 'A01' })
      const old = '2020-01-01T00:00:00.000Z'
      await ctx.db.update(storageContainer).set({ lastUpdated: old }).where(eq(storageContainer.id, container.id))

      const res = await ctx.request('/api/collections/containers/move', {
        method: 'POST',
        json: {
          mappings: [{ fromCollectionName: 'P96', toCollectionName: 'P96' }],
          moves: [{ identifier: { type: 'barcode', barcode: 'MT-1' }, targetPosition: 'B02' }],
        },
      })

      expect(res.status).toBe(200)
      const admin = ctx.db.select().from(users).where(eq(users.email, 'admin@test.com')).get()
      const after = ctx.db.select().from(storageContainer).where(eq(storageContainer.id, container.id)).get()
      expect(after?.updatedBy).toBe(admin?.id)
      expect(after?.lastUpdated).not.toBe(old)
    })

    it('returns 401 when not authenticated', async () => {
      const res = await authenticatedRequest(ctx.createRequestApp(), '/api/collections/containers/move', {
        method: 'POST',
        json: { mappings: [], moves: [] },
      })
      expect(res.status).toBe(401)
    })
  })

  describe('POST /api/collections/move', () => {
    async function setupPlateAndBox() {
      const storageType = await createTestStorageType(ctx.db, { name: 'Freezer' })
      const src = await createTestLocation(ctx.db, { name: 'Src', storageTypeId: String(storageType.id), canContainCollections: true })
      const dst = await createTestLocation(ctx.db, { name: 'Dst', storageTypeId: String(storageType.id), canContainCollections: true })
      const plate = await createTestMicronixPlate(ctx.db, { name: 'Plate1', locationId: src.id })
      const cryoBox = await createTestCryovialBox(ctx.db, { name: 'CryoBox1', locationId: src.id })
      return { src, dst, plate, cryoBox }
    }

    it('commits nothing across plates and boxes when an all-or-nothing move has a failing box', async () => {
      const { src, dst, plate } = await setupPlateAndBox()

      const res = await ctx.request('/api/collections/move', {
        method: 'POST',
        json: {
          atomicMode: 'all_or_nothing',
          moves: [
            { collectionType: 'micronix_plate', identifier: { type: 'id', id: plate.id }, targetLocationId: dst.id },
            { collectionType: 'cryovial_box', identifier: { type: 'id', id: 999_999 }, targetLocationId: dst.id },
          ],
        },
      })

      expect(res.status).toBe(400)
      const body = await res.json()
      expect(body.moved).toBe(0)
      expect(body.errors).toEqual([{ row: 2, error: expect.stringContaining('ID 999999') }])
      const after = ctx.db.select().from(micronixPlate).where(eq(micronixPlate.id, plate.id)).get()
      expect(after?.locationId).toBe(src.id)
    })

    it('returns 200 with moved and errors when a best-effort move moves some Collections', async () => {
      const { src, dst, plate, cryoBox } = await setupPlateAndBox()

      const res = await ctx.request('/api/collections/move', {
        method: 'POST',
        json: {
          atomicMode: 'best_effort',
          moves: [
            { collectionType: 'micronix_plate', identifier: { type: 'id', id: plate.id }, targetLocationId: dst.id },
            { collectionType: 'cryovial_box', identifier: { type: 'id', id: cryoBox.id }, targetLocationId: src.id },
          ],
        },
      })

      expect(res.status).toBe(200)
      expect(await res.json()).toEqual({
        success: false,
        moved: 1,
        errors: [{ row: 2, error: expect.stringContaining('already at location') }],
      })
      expect(ctx.db.select().from(micronixPlate).where(eq(micronixPlate.id, plate.id)).get()?.locationId).toBe(dst.id)
    })

    it('records the logged-in user and time on each moved Collection', async () => {
      const { dst, plate, cryoBox } = await setupPlateAndBox()
      const old = '2020-01-01T00:00:00.000Z'
      await ctx.db.update(micronixPlate).set({ lastUpdated: old }).where(eq(micronixPlate.id, plate.id))
      await ctx.db.update(cryovialBox).set({ lastUpdated: old }).where(eq(cryovialBox.id, cryoBox.id))

      const res = await ctx.request('/api/collections/move', {
        method: 'POST',
        json: {
          moves: [
            { collectionType: 'micronix_plate', identifier: { type: 'id', id: plate.id }, targetLocationId: dst.id },
            { collectionType: 'cryovial_box', identifier: { type: 'id', id: cryoBox.id }, targetLocationId: dst.id },
          ],
        },
      })

      expect(res.status).toBe(200)
      expect(await res.json()).toEqual({ success: true, moved: 2 })
      const admin = ctx.db.select().from(users).where(eq(users.email, 'admin@test.com')).get()
      const afterPlate = ctx.db.select().from(micronixPlate).where(eq(micronixPlate.id, plate.id)).get()
      const afterBox = ctx.db.select().from(cryovialBox).where(eq(cryovialBox.id, cryoBox.id)).get()
      expect(afterPlate?.updatedBy).toBe(admin?.id)
      expect(afterPlate?.lastUpdated).not.toBe(old)
      expect(afterBox?.updatedBy).toBe(admin?.id)
      expect(afterBox?.lastUpdated).not.toBe(old)
    })

    it('returns 400 for a move with no Collection type', async () => {
      const { dst, plate } = await setupPlateAndBox()

      const res = await ctx.request('/api/collections/move', {
        method: 'POST',
        json: { moves: [{ identifier: { type: 'id', id: plate.id }, targetLocationId: dst.id }] },
      })

      expect(res.status).toBe(400)
      expect((await res.json()).errors).toEqual([{ row: 1, error: 'collectionType is required' }])
    })
  })

  describe('POST /api/collections/sheets/move', () => {
    it('returns a typed 409 when the target box already has a sheet with that name', async () => {
      const storageType = await createTestStorageType(ctx.db, { name: 'Freezer' })
      const loc = await createTestLocation(ctx.db, {
        name: 'Loc',
        storageTypeId: String(storageType.id),
        canContainCollections: true,
      })
      const boxA = await createTestBox(ctx.db, { name: 'BoxA', locationId: loc.id })
      const boxB = await createTestBox(ctx.db, { name: 'BoxB', locationId: loc.id })
      const moving = await createTestSheet(ctx.db, { name: 'Sheet-1', boxId: boxA.id })
      await createTestSheet(ctx.db, { name: 'Sheet-1', boxId: boxB.id })

      const res = await ctx.request('/api/collections/sheets/move', {
        method: 'POST',
        json: { sheetIds: [moving.id], targetCollectionId: boxB.id, targetCollectionType: 'box' },
      })

      expect(res.status).toBe(409)
      expect(await res.json()).toEqual({
        error: "The target box already has a sheet named 'Sheet-1'. Rename one of them first.",
        errorCode: 'CONFLICT',
      })
    })
  })

  describe('POST /api/collections/plates/micronix/validate-scan', () => {
    it('returns 200 with inferenceReport when infer would fail (multiple plates)', async () => {
      await setScannerConfigurations(ctx.db, {
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

      const storageType = await createTestStorageType(ctx.db, { name: 'Freezer' })
      const location = await createTestLocation(ctx.db, {
        name: 'Loc',
        storageTypeId: String(storageType.id),
      })
      const plate1 = await createTestMicronixPlate(ctx.db, { name: 'Plate1', locationId: location.id })
      const plate2 = await createTestMicronixPlate(ctx.db, { name: 'Plate2', locationId: location.id })
      const specimenType = await createTestSpecimenType(ctx.db, { name: 'Blood' })
      const specimen = await createTestSpecimen(ctx.db, specimenType.id)
      const unit = await createTestUnit(ctx.db, { symbol: 'uL', name: 'microliter', category: 'volume' })
      const now = utcNow()

      const [c1] = await ctx.db.insert(storageContainer).values({
        specimenId: specimen.id,
        unitId: unit.id,
        totalQuantity: 1.0,
        remainingQuantity: 1.0,
        created: now,
        lastUpdated: now,
      }).returning()
      await ctx.db.insert(micronixTube).values({
        id: c1!.id,
        collectionId: plate1.id,
        barcode: 'MT001',
        position: 'A01',
      })

      const [c2] = await ctx.db.insert(storageContainer).values({
        specimenId: specimen.id,
        unitId: unit.id,
        totalQuantity: 1.0,
        remainingQuantity: 1.0,
        created: now,
        lastUpdated: now,
      }).returning()
      await ctx.db.insert(micronixTube).values({
        id: c2!.id,
        collectionId: plate2.id,
        barcode: 'MT002',
        position: 'A02',
      })

      const res = await ctx.request('/api/collections/plates/micronix/validate-scan', {
        method: 'POST',
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
      const res = await ctx.request('/api/collections/list-all', {
        method: 'GET',
      })
      expect(res.status).toBe(200)
      const data = (await res.json()) as { plates?: unknown[]; boxes?: unknown[]; bags?: unknown[] }
      expect(data).toBeDefined()
    })

    it('returns 401 when not authenticated', async () => {
      const res = await authenticatedRequest(ctx.createRequestApp(), '/api/collections/list-all', { method: 'GET' })
      expect(res.status).toBe(401)
    })
  })

  describe('POST /api/collections/resolve', () => {
    it('returns found: true with id and location when collection exists', async () => {
      const storageType = await createTestStorageType(ctx.db, { name: 'Shelf', description: 'Test' })
      const loc = await createTestLocation(ctx.db, {
        name: 'Freezer A',
        storageTypeId: String(storageType.id),
        canContainCollections: true,
        path: '/Freezer A',
      })
      const now = utcNow()
      const [boxRecord] = await ctx.db.insert(box).values({
        name: 'ResolveTestBox',
        locationId: loc.id,
        created: now,
        lastUpdated: now,
      }).returning()

      const res = await ctx.request('/api/collections/resolve', {
        method: 'POST',
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
      const res = await ctx.request('/api/collections/resolve', {
        method: 'POST',
        json: { name: 'NonexistentBox', type: 'box' },
      })
      expect(res.status).toBe(200)
      const data = (await res.json()) as { found: boolean }
      expect(data.found).toBe(false)
    })

    it('returns 401 when not authenticated', async () => {
      const res = await authenticatedRequest(ctx.createRequestApp(), '/api/collections/resolve', {
        method: 'POST',
        json: { name: 'X', type: 'box' },
      })
      expect(res.status).toBe(401)
    })
  })

  describe('POST /api/collections/delete-with-contents/preflight', () => {
    it('returns preflight summary matching contract schema for an empty plate', async () => {
      const storageType = await createTestStorageType(ctx.db, { name: 'StPre' })
      const loc = await createTestLocation(ctx.db, {
        name: 'LocPre',
        storageTypeId: String(storageType.id),
        canContainCollections: true,
      })
      const plate = await createTestMicronixPlate(ctx.db, { name: 'PlatePre1', locationId: loc.id })

      const res = await ctx.request('/api/collections/delete-with-contents/preflight', {
        method: 'POST',
        json: { collectionType: 'micronix_plate', id: plate.id },
      })
      expect(res.status).toBe(200)
      const data = (await res.json()) as {
        canDelete: boolean
        blockers: Array<{ code: string; message: string }>
        summary: { containerCount: number; specimenCount: number }
      }
      expect(data.canDelete).toBe(true)
      expect(data.blockers).toEqual([])
      expect(data.summary).toEqual({ containerCount: 0, specimenCount: 0 })
    })
  })

  describe('POST /api/collections/delete-with-contents', () => {
    it('returns 404 when collection does not exist', async () => {
      const res = await ctx.request('/api/collections/delete-with-contents', {
        method: 'POST',
        json: { collectionType: 'micronix_plate', id: 999_999, removeEmptySubjects: false },
      })
      expect(res.status).toBe(404)
    })

    it.each(['micronix_plate', 'cryovial_box', 'box', 'bag'] as const)(
      'returns 404 when the %s does not exist',
      async (collectionType) => {
        const res = await ctx.request('/api/collections/delete-with-contents', {
          method: 'POST',
          json: { collectionType, id: 999_999, removeEmptySubjects: false },
        })
        expect(res.status).toBe(404)
      },
    )

    it.each(['cryovial_box', 'box', 'bag'] as const)(
      'deletes a %s with its container, specimen and sheets',
      async (collectionType) => {
        const storageType = await createTestStorageType(ctx.db, { name: `St-${collectionType}` })
        const loc = await createTestLocation(ctx.db, {
          name: `Loc-${collectionType}`,
          storageTypeId: String(storageType.id),
          canContainCollections: true,
        })
        const st = await createTestSpecimenType(ctx.db, { name: `ST-${collectionType}` })
        const sp = await createTestSpecimen(ctx.db, st.id)
        const unit = await createTestUnit(ctx.db, { symbol: 'uL', name: 'microliter', category: 'volume' })
        const now = utcNow()
        const [c] = await ctx.db
          .insert(storageContainer)
          .values({ specimenId: sp.id, unitId: unit.id, totalQuantity: 1, remainingQuantity: 1, created: now, lastUpdated: now })
          .returning()
        if (!c) throw new Error('no container')
        const collection = { name: `Coll-${collectionType}`, locationId: loc.id, created: now, lastUpdated: now }

        let id: number
        if (collectionType === 'cryovial_box') {
          const [row] = await ctx.db.insert(cryovialBox).values(collection).returning()
          id = row!.id
          await ctx.db.insert(cryovialTube).values({ id: c.id, collectionId: id, barcode: 'CRYO1', position: 'A1' })
        } else {
          const table = collectionType === 'box' ? box : bag
          const [row] = await ctx.db.insert(table).values(collection).returning()
          id = row!.id
          const [sh] = await ctx.db
            .insert(sheet)
            .values({ name: 'S1', boxId: collectionType === 'box' ? id : null, bagId: collectionType === 'bag' ? id : null, created: now, lastUpdated: now })
            .returning()
          await ctx.db.insert(paper).values({ id: c.id, sheetId: sh!.id })
        }

        const res = await ctx.request('/api/collections/delete-with-contents', {
          method: 'POST',
          json: { collectionType, id, removeEmptySubjects: false },
        })
        expect(res.status).toBe(200)
        expect(await res.json()).toMatchObject({
          containersDeleted: 1,
          specimensDeleted: 1,
          sheetsDeleted: collectionType === 'cryovial_box' ? 0 : 1,
          collectionDeleted: true,
        })
        expect(await ctx.db.select().from(storageContainer).where(eq(storageContainer.id, c.id)).get()).toBeUndefined()
        expect(await ctx.db.select().from(sheet).all()).toEqual([])
      },
    )

    it('deletes a micronix plate, its tubes, and fully-contained specimens', async () => {
      const storageType = await createTestStorageType(ctx.db, { name: 'StDel' })
      const loc = await createTestLocation(ctx.db, {
        name: 'LocDel',
        storageTypeId: String(storageType.id),
        canContainCollections: true,
      })
      const plate = await createTestMicronixPlate(ctx.db, { name: 'PlateDel1', locationId: loc.id })
      const st = await createTestSpecimenType(ctx.db, { name: 'STDel' })
      const sp = await createTestSpecimen(ctx.db, st.id)
      const unit = await createTestUnit(ctx.db, { symbol: 'uL', name: 'microliter', category: 'volume' })
      const now = utcNow()
      const [c] = await ctx.db
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
      await ctx.db.insert(micronixTube).values({
        id: c.id,
        collectionId: plate.id,
        barcode,
        position: 'A01',
      })

      const res = await ctx.request('/api/collections/delete-with-contents', {
        method: 'POST',
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

      const leftPlate = await ctx.db.select().from(micronixPlate).where(eq(micronixPlate.id, plate.id)).all()
      expect(leftPlate.length).toBe(0)
      const leftSc = await ctx.db.select().from(storageContainer).where(eq(storageContainer.id, c.id)).all()
      expect(leftSc.length).toBe(0)
      const leftSp = await ctx.db.select().from(specimen).where(eq(specimen.id, sp.id)).all()
      expect(leftSp.length).toBe(0)
    })

    it('returns 409 with blockers when qPCR links a container in the collection', async () => {
      const storageType = await createTestStorageType(ctx.db, { name: 'StQ' })
      const loc = await createTestLocation(ctx.db, {
        name: 'LocQ',
        storageTypeId: String(storageType.id),
        canContainCollections: true,
      })
      const plate = await createTestMicronixPlate(ctx.db, { name: 'PlateQ1', locationId: loc.id })
      const st = await createTestSpecimenType(ctx.db, { name: 'STQ' })
      const sp = await createTestSpecimen(ctx.db, st.id)
      const unit = await createTestUnit(ctx.db, { symbol: 'uL', name: 'microliter', category: 'volume' })
      const now = utcNow()
      const [c] = await ctx.db
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
      await ctx.db.insert(micronixTube).values({
        id: c.id,
        collectionId: plate.id,
        barcode: `BCQ${Date.now()}`,
        position: 'A01',
      })

      const [exp] = await ctx.db
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
      await ctx.db.insert(qpcrExperimentWell).values({
        qpcrExperimentId: exp.id,
        wellPosition: 'A01',
        storageContainerId: c.id,
        contentType: 'unknown',
        standardDensity: null,
      })

      const res = await ctx.request('/api/collections/delete-with-contents', {
        method: 'POST',
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
      const storageType = await createTestStorageType(ctx.db, { name: 'StDer' })
      const loc1 = await createTestLocation(ctx.db, {
        name: 'L1',
        storageTypeId: String(storageType.id),
        canContainCollections: true,
      })
      const loc2 = await createTestLocation(ctx.db, {
        name: 'L2',
        storageTypeId: String(storageType.id),
        canContainCollections: true,
      })
      const p1 = await createTestMicronixPlate(ctx.db, { name: 'P1der', locationId: loc1.id })
      const p2 = await createTestMicronixPlate(ctx.db, { name: 'P2der', locationId: loc2.id })
      const st = await createTestSpecimenType(ctx.db, { name: 'STder' })
      const sp = await createTestSpecimen(ctx.db, st.id)
      const unit = await createTestUnit(ctx.db, { symbol: 'uL', name: 'm', category: 'volume' })
      const t = utcNow()
      const [parent] = await ctx.db
        .insert(storageContainer)
        .values({ specimenId: sp.id, unitId: unit.id, totalQuantity: 1, remainingQuantity: 1, created: t, lastUpdated: t })
        .returning()
      const [child] = await ctx.db
        .insert(storageContainer)
        .values({ specimenId: sp.id, unitId: unit.id, totalQuantity: 1, remainingQuantity: 1, created: t, lastUpdated: t })
        .returning()
      if (!parent || !child) throw new Error('sc')
      await ctx.db.insert(micronixTube).values({ id: parent.id, collectionId: p1.id, barcode: `BPD${Date.now()}`, position: 'A01' })
      await ctx.db.insert(micronixTube).values({ id: child.id, collectionId: p2.id, barcode: `BCH${Date.now()}b`, position: 'A01' })
      await ctx.db
        .insert(containerDerivation)
        .values({ parentContainerId: parent.id, childContainerId: child.id, derivationType: 'aliquot', created: t })

      const res = await ctx.request('/api/collections/delete-with-contents', {
        method: 'POST',
        json: { collectionType: 'micronix_plate', id: p1.id, removeEmptySubjects: false },
      })
      expect(res.status).toBe(409)
      const data = (await res.json()) as { error: string; blockers: Array<{ code: string; message: string }> }
      const der = data.blockers.find((x) => x.code === 'container_derivation_spans_outside_collection')
      expect(der).toBeDefined()
      expect(der!.message).toMatch(/derivation|parent|child|container/i)
    })

    it('deletes a plate that only has the child side of a cross-plate derivation (parent in other plate)', async () => {
      const storageType = await createTestStorageType(ctx.db, { name: 'StChOnly' })
      const loc1 = await createTestLocation(ctx.db, {
        name: 'Lch1',
        storageTypeId: String(storageType.id),
        canContainCollections: true,
      })
      const loc2 = await createTestLocation(ctx.db, {
        name: 'Lch2',
        storageTypeId: String(storageType.id),
        canContainCollections: true,
      })
      const pParent = await createTestMicronixPlate(ctx.db, { name: 'PparCh', locationId: loc1.id })
      const pChild = await createTestMicronixPlate(ctx.db, { name: 'PchOnly', locationId: loc2.id })
      const st = await createTestSpecimenType(ctx.db, { name: 'STch' })
      const sp = await createTestSpecimen(ctx.db, st.id)
      const unit = await createTestUnit(ctx.db, { symbol: 'uL', name: 'm', category: 'volume' })
      const t = utcNow()
      const [parent] = await ctx.db
        .insert(storageContainer)
        .values({ specimenId: sp.id, unitId: unit.id, totalQuantity: 1, remainingQuantity: 1, created: t, lastUpdated: t })
        .returning()
      const [child] = await ctx.db
        .insert(storageContainer)
        .values({ specimenId: sp.id, unitId: unit.id, totalQuantity: 1, remainingQuantity: 1, created: t, lastUpdated: t })
        .returning()
      if (!parent || !child) throw new Error('sc')
      await ctx.db.insert(micronixTube).values({ id: parent.id, collectionId: pParent.id, barcode: `Bpar${Date.now()}`, position: 'A01' })
      await ctx.db.insert(micronixTube).values({ id: child.id, collectionId: pChild.id, barcode: `Bch${Date.now()}`, position: 'A01' })
      const [der] = await ctx.db
        .insert(containerDerivation)
        .values({ parentContainerId: parent.id, childContainerId: child.id, derivationType: 'aliquot', created: t })
        .returning()
      if (!der) throw new Error('der')

      const res = await ctx.request('/api/collections/delete-with-contents', {
        method: 'POST',
        json: { collectionType: 'micronix_plate', id: pChild.id, removeEmptySubjects: false },
      })
      expect(res.status).toBe(200)

      const pChildLeft = await ctx.db.select().from(micronixPlate).where(eq(micronixPlate.id, pChild.id)).all()
      expect(pChildLeft.length).toBe(0)
      const pParentLeft = await ctx.db.select().from(micronixPlate).where(eq(micronixPlate.id, pParent.id)).all()
      expect(pParentLeft.length).toBe(1)
      const parentSc = await ctx.db.select().from(storageContainer).where(eq(storageContainer.id, parent.id)).all()
      expect(parentSc.length).toBe(1)
      const ders = await ctx.db.select().from(containerDerivation).where(eq(containerDerivation.id, der.id)).all()
      expect(ders.length).toBe(0)
    })

    it('does not remove a specimen that still has a container in another plate', async () => {
      const storageType = await createTestStorageType(ctx.db, { name: 'StSplit' })
      const loc = await createTestLocation(ctx.db, {
        name: 'Lsp',
        storageTypeId: String(storageType.id),
        canContainCollections: true,
      })
      const p1 = await createTestMicronixPlate(ctx.db, { name: 'Psplit1', locationId: loc.id })
      const p2 = await createTestMicronixPlate(ctx.db, { name: 'Psplit2', locationId: loc.id })
      const st = await createTestSpecimenType(ctx.db, { name: 'STsplit' })
      const sp = await createTestSpecimen(ctx.db, st.id)
      const unit = await createTestUnit(ctx.db, { symbol: 'uL', name: 'm', category: 'volume' })
      const t = utcNow()
      const [c1] = await ctx.db
        .insert(storageContainer)
        .values({ specimenId: sp.id, unitId: unit.id, totalQuantity: 1, remainingQuantity: 1, created: t, lastUpdated: t })
        .returning()
      const [c2] = await ctx.db
        .insert(storageContainer)
        .values({ specimenId: sp.id, unitId: unit.id, totalQuantity: 1, remainingQuantity: 1, created: t, lastUpdated: t })
        .returning()
      if (!c1 || !c2) throw new Error('sc')
      await ctx.db
        .insert(micronixTube)
        .values({ id: c1.id, collectionId: p1.id, barcode: `C1${Date.now()}`, position: 'A01' })
      await ctx.db
        .insert(micronixTube)
        .values({ id: c2.id, collectionId: p2.id, barcode: `C2${Date.now()}`, position: 'A01' })

      const res = await ctx.request('/api/collections/delete-with-contents', {
        method: 'POST',
        json: { collectionType: 'micronix_plate', id: p1.id, removeEmptySubjects: false },
      })
      expect(res.status).toBe(200)
      const left = await ctx.db.select().from(specimen).where(eq(specimen.id, sp.id)).all()
      expect(left.length).toBe(1)
    })

    it('deletes a study subject with no remaining specimens when removeEmptySubjects is true', async () => {
      const storageType = await createTestStorageType(ctx.db, { name: 'StSub' })
      const loc = await createTestLocation(ctx.db, {
        name: 'Lsub',
        storageTypeId: String(storageType.id),
        canContainCollections: true,
      })
      const plate = await createTestMicronixPlate(ctx.db, { name: 'PlSub', locationId: loc.id })
      const st = await createTestSpecimenType(ctx.db, { name: 'STsub' })
      const study = await createTestStudy(ctx.db, { title: 'S', shortCode: `SUBJ${Date.now()}` })
      const subject = await createTestStudySubject(ctx.db, { studyId: study.id, name: 'Sub1' })
      const sp = await createTestSpecimen(ctx.db, st.id, { studySubjectId: subject.id })
      const unit = await createTestUnit(ctx.db, { symbol: 'uL', name: 'm', category: 'volume' })
      const t = utcNow()
      const [c] = await ctx.db
        .insert(storageContainer)
        .values({ specimenId: sp.id, unitId: unit.id, totalQuantity: 1, remainingQuantity: 1, created: t, lastUpdated: t })
        .returning()
      if (!c) throw new Error('sc')
      await ctx.db.insert(micronixTube).values({ id: c.id, collectionId: plate.id, barcode: `Bsub${Date.now()}`, position: 'A01' })

      const res = await ctx.request('/api/collections/delete-with-contents', {
        method: 'POST',
        json: { collectionType: 'micronix_plate', id: plate.id, removeEmptySubjects: true },
      })
      expect(res.status).toBe(200)
      const data = (await res.json()) as { subjectsDeleted: number }
      expect(data.subjectsDeleted).toBe(1)
      const leftSubj = await ctx.db.select().from(studySubject).where(eq(studySubject.id, subject.id)).all()
      expect(leftSubj.length).toBe(0)
    })
  })
})
