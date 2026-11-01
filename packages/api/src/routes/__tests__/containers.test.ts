import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { authenticatedRequest } from '../../__tests__/helpers/test-client'
import {
  setupAuthenticatedRouteTest,
  type AuthenticatedRouteTestContext,
} from '../../__tests__/helpers/authenticated-route-test'
import { createContainersRoutes } from '../containers'
import * as containerEnrichment from '../../lib/container-api-enrichment'
import * as containerReadView from '../../lib/container-read-view'
import * as identifierResolution from '../../lib/identifier-resolution'
import { utcNow } from '../../lib/datetime'
import {
  createTestStudy,
  createTestStudySubject,
  createTestSpecimen,
  createTestSpecimenType,
  createTestLocation,
  createTestUnit,
  createTestStorageType,
  createTestCryovialBox,
  createTestCryovialTube,
  createTestStorageContainer,
  createTestTag,
  createTestContainerTags,
  createTestMicronixPlate,
  createTestMicronixTube,
  createTestBox,
  createTestSheet,
  createTestPaper,
} from '../../__tests__/helpers/factories'
import { cryovialBox, cryovialTube, specimen, storageContainer, micronixPlate, micronixTube, box, sheet, paper, staticWell, storageContainerTag, errorLogs } from '../../db/schema'
import { eq } from 'drizzle-orm'

describe('Containers API', () => {
  let ctx: AuthenticatedRouteTestContext

  beforeEach(async () => {
    ctx = await setupAuthenticatedRouteTest({
      settings: { pagination: true },
      user: {
        email: 'admin@test.com',
        name: 'Admin',
        password: 'password123',
        role: 'admin',
      },
      mount: (app, { db }) => {
        app.route('/api/containers', createContainersRoutes(db))
      },
    })
  })

  afterEach(() => {
    vi.restoreAllMocks()
    ctx.cleanup()
  })

  describe('GET /api/containers', () => {
    it('returns 200 and containers with pagination when authenticated', async () => {
      const res = await ctx.request('/api/containers')
      expect(res.status).toBe(200)
      const data = (await res.json()) as { containers: unknown[]; pagination: unknown }
      expect(data).toHaveProperty('containers')
      expect(data).toHaveProperty('pagination')
      expect(Array.isArray(data.containers)).toBe(true)
    })

    it('returns 401 when not authenticated', async () => {
      const res = await authenticatedRequest(ctx.createRequestApp(), '/api/containers', { method: 'GET' })
      expect(res.status).toBe(401)
    })

    it('returns 500 with containers error shape when list fails', async () => {
      vi.spyOn(containerEnrichment, 'enrichContainersForApi').mockRejectedValueOnce(
        new Error('enrichment failed'),
      )
      const res = await ctx.request('/api/containers')
      expect(res.status).toBe(500)
      const data = (await res.json()) as { error: string; details: string }
      expect(data.error).toBe('Failed to fetch containers')
      expect(data.details).toBe('enrichment failed')
      vi.restoreAllMocks()
    })

    describe('tag_ids filter', () => {
      type ListResponse = {
        containers: Array<{ id: number }>
        pagination: { page: number; limit: number; total: number; totalPages: number }
      }

      async function containerTagged(unitId: number, specimenId: number, tagIds: number[]) {
        const container = await createTestStorageContainer(ctx.db, { unitId, specimenId })
        if (tagIds.length > 0) {
          await ctx.db
            .insert(storageContainerTag)
            .values(tagIds.map((tagId) => ({ storageContainerId: container.id, tagId })))
        }
        return container.id
      }

      async function list(query: string): Promise<ListResponse> {
        const res = await ctx.request(`/api/containers?${query}`)
        expect(res.status).toBe(200)
        return (await res.json()) as ListResponse
      }

      let red: number
      let blue: number
      let unused: number
      let redAndBlue: number[]
      let redOnly: number

      beforeEach(async () => {
        red = (await createTestTag(ctx.db, { name: 'red' })).id
        blue = (await createTestTag(ctx.db, { name: 'blue' })).id
        unused = (await createTestTag(ctx.db, { name: 'unused' })).id
        const unit = await createTestUnit(ctx.db, { symbol: 'uL', name: 'microliter', category: 'volume' })
        const specimenType = await createTestSpecimenType(ctx.db, { name: 'Blood' })
        const testSpecimen = await createTestSpecimen(ctx.db, specimenType.id)
        redAndBlue = [
          await containerTagged(unit.id, testSpecimen.id, [red, blue]),
          await containerTagged(unit.id, testSpecimen.id, [red, blue]),
          await containerTagged(unit.id, testSpecimen.id, [red, blue]),
        ]
        redOnly = await containerTagged(unit.id, testSpecimen.id, [red])
        await containerTagged(unit.id, testSpecimen.id, [blue])
        await containerTagged(unit.id, testSpecimen.id, [])
      })

      it('lists Containers carrying the one selected Tag', async () => {
        const data = await list(`tag_ids=${red}&limit=10`)
        expect(data.containers.map((c) => c.id).sort((a, b) => a - b)).toEqual([...redAndBlue, redOnly])
        expect(data.pagination.total).toBe(4)
      })

      it('excludes Containers with only some of the selected Tags from the page and the total', async () => {
        const first = await list(`tag_ids=${red}&tag_ids=${blue}&limit=2&page=1`)
        const second = await list(`tag_ids=${red}&tag_ids=${blue}&limit=2&page=2`)
        expect([...first.containers, ...second.containers].map((c) => c.id)).toEqual(redAndBlue)
        expect(first.containers).toHaveLength(2)
        expect(first.pagination).toEqual({ page: 1, limit: 2, total: 3, totalPages: 2 })
        expect(second.pagination).toEqual({ page: 2, limit: 2, total: 3, totalPages: 2 })
      })

      it('returns an empty page when no Container carries every selected Tag', async () => {
        const data = await list(`tag_ids=${red}&tag_ids=${unused}&limit=2`)
        expect(data.containers).toEqual([])
        expect(data.pagination).toEqual({ page: 1, limit: 2, total: 0, totalPages: 0 })
      })
    })
  })

  describe('GET /api/containers/:id', () => {
    it('returns 404 for non-existent ID', async () => {
      const res = await ctx.request('/api/containers/99999')
      expect(res.status).toBe(404)
    })

    it('returns 401 when not authenticated', async () => {
      const res = await authenticatedRequest(ctx.createRequestApp(), '/api/containers/1', { method: 'GET' })
      expect(res.status).toBe(401)
    })

    it('returns omit-on-wire paper container detail', async () => {
      const now = utcNow()
      const testStorageType = await createTestStorageType(ctx.db, { name: 'Freezer', description: 'Test' })
      const testLocation = await createTestLocation(ctx.db, {
        name: `Paper Loc ${Date.now()}`,
        parentId: null,
        storageTypeId: String(testStorageType.id),
        canContainCollections: true,
      })
      const [b] = await ctx.db
        .insert(box)
        .values({ name: `BX-GET-${Date.now()}`, locationId: testLocation.id, created: now, lastUpdated: now })
        .returning()
      const [sh] = await ctx.db
        .insert(sheet)
        .values({ name: '2058121', boxId: b!.id, bagId: null, created: now, lastUpdated: now })
        .returning()
      const sp = await createTestSpecimen(ctx.db, (await createTestSpecimenType(ctx.db, { name: 'DBS' })).id)
      const testUnit = await createTestUnit(ctx.db, { symbol: 'spots', name: 'spots', category: 'count' })
      const [container] = await ctx.db
        .insert(storageContainer)
        .values({ specimenId: sp.id, unitId: testUnit.id, totalQuantity: 1, remainingQuantity: 1, created: now, lastUpdated: now })
        .returning()
      await ctx.db.insert(paper).values({ id: container!.id, sheetId: sh!.id, sublabel: 'Spot-A' })

      const res = await ctx.request(`/api/containers/${container!.id}`)
      expect(res.status).toBe(200)
      const data = (await res.json()) as {
        container: {
          containerType: string
          sublabel?: string
          collection?: Record<string, unknown>
        }
      }
      expect(data.container.containerType).toBe('paper')
      expect(data.container.sublabel).toBe('Spot-A')
      expect(data.container.collection).toEqual({ type: 'sheet', id: sh!.id, name: '2058121' })
      expect(data.container.collection).not.toHaveProperty('position')
      expect(data.container.collection).not.toHaveProperty('barcode')
    })

    it('returns 500 with container error shape when get fails', async () => {
      vi.spyOn(containerReadView, 'loadContainerReadViews').mockRejectedValueOnce(
        new Error('enrichment failed'),
      )
      const now = utcNow()
      const testStudy = await createTestStudy(ctx.db, { title: 'Err Study', shortCode: 'ERR' + Date.now() })
      const subj = await createTestStudySubject(ctx.db, { studyId: testStudy.id, name: 'S1' })
      const st = await createTestSpecimenType(ctx.db, { name: 'Whole Blood' })
      const unit = await createTestUnit(ctx.db, { symbol: 'uL', name: 'microliter', category: 'volume' })
      const [spec] = await ctx.db
        .insert(specimen)
        .values({ studySubjectId: subj.id, specimenTypeId: st.id, created: now, lastUpdated: now })
        .returning()
      const [container] = await ctx.db
        .insert(storageContainer)
        .values({
          specimenId: spec.id,
          unitId: unit.id,
          totalQuantity: 1,
          remainingQuantity: 1,
          created: now,
          lastUpdated: now,
        })
        .returning()

      const res = await ctx.request(`/api/containers/${container.id}`)
      expect(res.status).toBe(500)
      const data = (await res.json()) as { error: string; details: string }
      expect(data.error).toBe('Failed to fetch container')
      expect(data.details).toBe('enrichment failed')
      vi.restoreAllMocks()
    })
  })

  describe('PATCH /api/containers/:id', () => {
    let testLocation: Awaited<ReturnType<typeof createTestLocation>>
    let testUnit: Awaited<ReturnType<typeof createTestUnit>>
    let testSpecimenType: Awaited<ReturnType<typeof createTestSpecimenType>>

    beforeEach(async () => {
      const testStorageType = await createTestStorageType(ctx.db, { name: 'Freezer', description: 'Test' })
      testLocation = await createTestLocation(ctx.db, {
        name: `Patch Loc ${Date.now()}`,
        parentId: null,
        storageTypeId: String(testStorageType.id),
        canContainCollections: true,
      })
      testUnit = await createTestUnit(ctx.db, { symbol: 'uL', name: 'microliter', category: 'volume' })
      testSpecimenType = await createTestSpecimenType(ctx.db, { name: 'Whole Blood' })
    })

    it('updates cryovial_tube barcode', async () => {
      const now = utcNow()
      const [boxRecord] = await ctx.db
        .insert(cryovialBox)
        .values({ name: `BOX-PATCH-${Date.now()}`, locationId: testLocation.id, created: now, lastUpdated: now })
        .returning()
      const testStudy = await createTestStudy(ctx.db, { title: 'P Study', shortCode: 'PST' + Date.now() })
      const subj = await createTestStudySubject(ctx.db, { studyId: testStudy.id, name: 'S1' })
      const [spec] = await ctx.db
        .insert(specimen)
        .values({ studySubjectId: subj.id, specimenTypeId: testSpecimenType.id, created: now, lastUpdated: now })
        .returning()
      const [container] = await ctx.db
        .insert(storageContainer)
        .values({ specimenId: spec.id, unitId: testUnit.id, totalQuantity: 1, remainingQuantity: 1, created: now, lastUpdated: now })
        .returning()
      await ctx.db.insert(cryovialTube).values({ id: container.id, collectionId: boxRecord.id, barcode: 'OLD-CRYO', position: 'A01' })

      const res = await ctx.request(`/api/containers/${container.id}`, {
        method: 'PATCH',
        json: { barcode: 'NEW-CRYO-1' },
      })
      expect(res.status).toBe(200)
      const row = await ctx.db.select().from(cryovialTube).where(eq(cryovialTube.id, container.id)).get()
      expect(row?.barcode).toBe('NEW-CRYO-1')
    })

    it('clears the comment when it is emptied', async () => {
      const now = utcNow()
      const boxRecord = await createTestCryovialBox(ctx.db, { name: `BOX-CMT-${Date.now()}`, locationId: testLocation.id })
      const testStudy = await createTestStudy(ctx.db, { title: 'C Study', shortCode: 'CST' + Date.now() })
      const subj = await createTestStudySubject(ctx.db, { studyId: testStudy.id, name: 'S1' })
      const [spec] = await ctx.db
        .insert(specimen)
        .values({ studySubjectId: subj.id, specimenTypeId: testSpecimenType.id, created: now, lastUpdated: now })
        .returning()
      const [container] = await ctx.db
        .insert(storageContainer)
        .values({ specimenId: spec.id, unitId: testUnit.id, totalQuantity: 1, remainingQuantity: 1, comment: 'hemolyzed', created: now, lastUpdated: now })
        .returning()
      await createTestCryovialTube(ctx.db, { containerId: container.id, collectionId: boxRecord.id, barcode: 'CMT-1', position: 'A01' })

      const res = await ctx.request(`/api/containers/${container.id}`, { method: 'PATCH', json: { comment: '' } })

      expect(res.status).toBe(200)
      const row = await ctx.db.select().from(storageContainer).where(eq(storageContainer.id, container.id)).get()
      expect(row?.comment).toBeNull()
    })

    it.each(['Z99', 'hello world', 'b1'])('never writes a grid position, even %s', async (position) => {
      // Container edit sets no Grid position; a move changes it under the Grid position rule.
      const boxRecord = await createTestCryovialBox(ctx.db, { name: `BOX-POS-${Date.now()}`, locationId: testLocation.id })
      const container = await createTestStorageContainer(ctx.db, { unitId: testUnit.id })
      await createTestCryovialTube(ctx.db, { containerId: container.id, collectionId: boxRecord.id, barcode: 'POS-1', position: 'A01' })

      const res = await ctx.request(`/api/containers/${container.id}`, { method: 'PATCH', json: { comment: 'moved?', position } })

      expect(res.status).toBe(200)
      const row = await ctx.db.select().from(cryovialTube).where(eq(cryovialTube.id, container.id)).get()
      expect(row?.position).toBe('A01')
    })

    it('returns 400 when cryovial_tube barcode is already in use', async () => {
      const now = utcNow()
      const [boxRecord] = await ctx.db
        .insert(cryovialBox)
        .values({ name: `BOX-PATCH2-${Date.now()}`, locationId: testLocation.id, created: now, lastUpdated: now })
        .returning()
      const testStudy = await createTestStudy(ctx.db, { title: 'P2', shortCode: 'PS2' + Date.now() })
      const subj = await createTestStudySubject(ctx.db, { studyId: testStudy.id, name: 'S2' })

      const makeCryo = async (barcode: string, position: string) => {
        const [specimenRow] = await ctx.db
          .insert(specimen)
          .values({ studySubjectId: subj.id, specimenTypeId: testSpecimenType.id, created: now, lastUpdated: now })
          .returning()
        const [c] = await ctx.db
          .insert(storageContainer)
          .values({ specimenId: specimenRow.id, unitId: testUnit.id, totalQuantity: 1, remainingQuantity: 1, created: now, lastUpdated: now })
          .returning()
        await ctx.db.insert(cryovialTube).values({ id: c.id, collectionId: boxRecord.id, barcode, position })
        return c.id
      }

      await makeCryo('TAKEN-BC', 'A01')
      const id2 = await makeCryo('OTHER-BC', 'A02')

      const res = await ctx.request(`/api/containers/${id2}`, {
        method: 'PATCH',
        json: { barcode: 'TAKEN-BC' },
      })
      expect(res.status).toBe(400)
      const j = (await res.json()) as { error: string }
      expect(j.error).toContain('already in use')
    })

    it('returns 400 when setting micronix_tube barcode to null', async () => {
      const now = utcNow()
      const [plate] = await ctx.db
        .insert(micronixPlate)
        .values({ name: `PL-${Date.now()}`, locationId: testLocation.id, created: now, lastUpdated: now, barcode: null })
        .returning()
      const sp = await createTestSpecimen(ctx.db, testSpecimenType.id)
      const [container] = await ctx.db
        .insert(storageContainer)
        .values({ specimenId: sp.id, unitId: testUnit.id, totalQuantity: 1, remainingQuantity: 1, created: now, lastUpdated: now })
        .returning()
      await ctx.db.insert(micronixTube).values({ id: container.id, collectionId: plate.id, barcode: 'MX-1', position: 'A01' })

      const res = await ctx.request(`/api/containers/${container.id}`, {
        method: 'PATCH',
        json: { barcode: null },
      })
      expect(res.status).toBe(400)
      const j = (await res.json()) as { error: string }
      expect(j.error).toMatch(/cleared|Micronix/i)
    })

    it('returns 400 when static_well has barcode in body', async () => {
      const now = utcNow()
      const [plate] = await ctx.db
        .insert(micronixPlate)
        .values({ name: `PL2-${Date.now()}`, locationId: testLocation.id, created: now, lastUpdated: now, barcode: null })
        .returning()
      const sp = await createTestSpecimen(ctx.db, testSpecimenType.id)
      const [container] = await ctx.db
        .insert(storageContainer)
        .values({ specimenId: sp.id, unitId: testUnit.id, totalQuantity: 1, remainingQuantity: 1, created: now, lastUpdated: now })
        .returning()
      await ctx.db.insert(staticWell).values({ id: container.id, collectionId: plate.id, position: 'A01' })

      const res = await ctx.request(`/api/containers/${container.id}`, {
        method: 'PATCH',
        json: { barcode: 'Nope' },
      })
      expect(res.status).toBe(400)
    })

    it('updates paper sublabel', async () => {
      const now = utcNow()
      const [b] = await ctx.db
        .insert(box)
        .values({ name: `BX-${Date.now()}`, locationId: testLocation.id, created: now, lastUpdated: now })
        .returning()
      const [sh] = await ctx.db
        .insert(sheet)
        .values({ name: 'S1', boxId: b.id, bagId: null, created: now, lastUpdated: now })
        .returning()
      const sp = await createTestSpecimen(ctx.db, testSpecimenType.id)
      const [container] = await ctx.db
        .insert(storageContainer)
        .values({ specimenId: sp.id, unitId: testUnit.id, totalQuantity: 1, remainingQuantity: 1, created: now, lastUpdated: now })
        .returning()
      await ctx.db.insert(paper).values({ id: container.id, sheetId: sh.id, sublabel: 'P-OLD' })

      const res = await ctx.request(`/api/containers/${container.id}`, {
        method: 'PATCH',
        json: { sublabel: 'P-NEW' },
      })
      expect(res.status).toBe(200)
      const row = await ctx.db.select().from(paper).where(eq(paper.id, container.id)).get()
      expect(row?.sublabel).toBe('P-NEW')
    })
  })
  describe('PATCH /api/containers/:id saves every change or none', () => {
    let unitId: number
    let specimenId: number
    let locationId: number
    let keepTagId: number
    let otherTagId: number

    beforeEach(async () => {
      const storageType = await createTestStorageType(ctx.db, { name: 'Freezer', description: 'Test' })
      const location = await createTestLocation(ctx.db, {
        name: 'Atomic Loc',
        parentId: null,
        storageTypeId: String(storageType.id),
        canContainCollections: true,
      })
      locationId = location.id
      const unit = await createTestUnit(ctx.db, { symbol: 'uL', name: 'microliter', category: 'volume' })
      unitId = unit.id
      const specimenType = await createTestSpecimenType(ctx.db, { name: 'Whole Blood' })
      specimenId = (await createTestSpecimen(ctx.db, specimenType.id)).id
      keepTagId = (await createTestTag(ctx.db, { name: 'keep' })).id
      otherTagId = (await createTestTag(ctx.db, { name: 'other' })).id
    })

    /** A Container with comment 'original', quantity 1 and the 'keep' Tag. */
    async function seedContainer() {
      const container = await createTestStorageContainer(ctx.db, { specimenId, unitId })
      await ctx.db.update(storageContainer).set({ comment: 'original' }).where(eq(storageContainer.id, container.id))
      await createTestContainerTags(ctx.db, container.id, [keepTagId])
      return container.id
    }

    async function seedMicronix(barcode: string, position: string) {
      const plate = await createTestMicronixPlate(ctx.db, { name: `PL-${barcode}`, locationId })
      const id = await seedContainer()
      await createTestMicronixTube(ctx.db, { containerId: id, collectionId: plate.id, barcode, position })
      return id
    }

    async function seedPaper(sublabel: string) {
      const boxRecord = await createTestBox(ctx.db, { name: `BX-${sublabel}`, locationId })
      const sheetRecord = await createTestSheet(ctx.db, { name: 'S1', boxId: boxRecord.id })
      const id = await seedContainer()
      await createTestPaper(ctx.db, { containerId: id, sheetId: sheetRecord.id, sublabel })
      return id
    }

    async function tagIdsOf(id: number) {
      const rows = await ctx.db
        .select({ tagId: storageContainerTag.tagId })
        .from(storageContainerTag)
        .where(eq(storageContainerTag.storageContainerId, id))
      return rows.map((row) => row.tagId).sort()
    }

    async function expectUnchanged(id: number) {
      const row = await ctx.db.select().from(storageContainer).where(eq(storageContainer.id, id)).get()
      expect(row?.comment).toBe('original')
      expect(row?.remainingQuantity).toBe(1)
      expect(await tagIdsOf(id)).toEqual([keepTagId])
    }

    it('saves one Tag when the same Tag is sent twice', async () => {
      const id = await seedMicronix('MX-DUP', 'A01')

      const res = await ctx.request(`/api/containers/${id}`, { method: 'PATCH', json: { tagIds: [otherTagId, otherTagId] } })

      expect(res.status).toBe(200)
      expect(await tagIdsOf(id)).toEqual([otherTagId])
      const body = (await res.json()) as { container: { tags?: Array<{ id: number }> } }
      expect(body.container.tags?.map((t) => t.id)).toEqual([otherTagId])
    })

    it('returns 400 for an unknown Tag and leaves the Container unchanged', async () => {
      const id = await seedMicronix('MX-UNK', 'A01')

      const res = await ctx.request(`/api/containers/${id}`, {
        method: 'PATCH',
        json: { comment: 'changed', remainingQuantity: 0.5, tagIds: [otherTagId, 9999] },
      })

      expect(res.status).toBe(400)
      const body = (await res.json()) as { error: string; errorCode: string }
      expect(body.error).toBe('Unknown tag id: 9999')
      expect(body.errorCode).toBe('VALIDATION_ERROR')
      await expectUnchanged(id)
    })

    it('returns 400 for a barcode already in use and leaves quantity, comment and Tags unchanged', async () => {
      await seedMicronix('MX-TAKEN', 'A01')
      const id = await seedMicronix('MX-MINE', 'A01')

      const res = await ctx.request(`/api/containers/${id}`, {
        method: 'PATCH',
        json: { comment: 'changed', remainingQuantity: 0.5, tagIds: [otherTagId], barcode: 'MX-TAKEN' },
      })

      expect(res.status).toBe(400)
      expect(((await res.json()) as { error: string }).error).toBe("Barcode 'MX-TAKEN' is already in use")
      await expectUnchanged(id)
      const tube = await ctx.db.select().from(micronixTube).where(eq(micronixTube.id, id)).get()
      expect(tube?.barcode).toBe('MX-MINE')
    })

    it('rolls back every change when the barcode write itself fails', async () => {
      await seedMicronix('MX-RACE', 'A01')
      const id = await seedMicronix('MX-SELF', 'A01')
      // The check misses the conflict (as when another request takes the barcode first), so the
      // UNIQUE constraint fails on the last write of the edit.
      vi.spyOn(identifierResolution, 'resolveContainerByBarcode').mockResolvedValue(null)

      const res = await ctx.request(`/api/containers/${id}`, {
        method: 'PATCH',
        json: { comment: 'changed', remainingQuantity: 0.5, tagIds: [otherTagId], barcode: 'MX-RACE' },
      })

      expect(res.status).toBe(409)
      expect(((await res.json()) as { errorCode: string }).errorCode).toBe('CONFLICT')
      await expectUnchanged(id)
    })

    it('returns 400 for a Paper sublabel already in use and leaves the Container unchanged', async () => {
      await seedPaper('SPOT-TAKEN')
      const id = await seedPaper('SPOT-MINE')

      const res = await ctx.request(`/api/containers/${id}`, {
        method: 'PATCH',
        json: { comment: 'changed', remainingQuantity: 0.5, tagIds: [otherTagId], sublabel: 'SPOT-TAKEN' },
      })

      expect(res.status).toBe(400)
      expect(((await res.json()) as { error: string }).error).toBe("Sublabel 'SPOT-TAKEN' is already in use")
      await expectUnchanged(id)
      const row = await ctx.db.select().from(paper).where(eq(paper.id, id)).get()
      expect(row?.sublabel).toBe('SPOT-MINE')
    })

    it('returns 400 when a Paper Container is sent a barcode and leaves it unchanged', async () => {
      const id = await seedPaper('SPOT-BC')

      const res = await ctx.request(`/api/containers/${id}`, {
        method: 'PATCH',
        json: { comment: 'changed', tagIds: [otherTagId], barcode: 'SPOT-NEW' },
      })

      expect(res.status).toBe(400)
      expect(((await res.json()) as { error: string }).error).toBe(
        'Paper containers use sublabel for spot identifiers, not barcode',
      )
      await expectUnchanged(id)
    })

    it('returns 400 for an invalid body through the standard handler', async () => {
      const id = await seedMicronix('MX-ZOD', 'A01')

      const res = await ctx.request(`/api/containers/${id}`, { method: 'PATCH', json: { tagIds: ['one'] } })

      expect(res.status).toBe(400)
      expect(((await res.json()) as { errorCode: string }).errorCode).toBe('VALIDATION_ERROR')
      await expectUnchanged(id)
    })

    it('returns 404 for a Container that does not exist', async () => {
      const res = await ctx.request('/api/containers/999999', { method: 'PATCH', json: { comment: 'x' } })

      expect(res.status).toBe(404)
      expect(((await res.json()) as { errorCode: string }).errorCode).toBe('NOT_FOUND')
    })

    it('logs a server error to error_logs through the standard handler', async () => {
      const id = await seedMicronix('MX-500', 'A01')
      vi.spyOn(containerEnrichment, 'enrichContainerForApi').mockRejectedValueOnce(new Error('enrichment failed'))
      const logsBefore = await ctx.db.select().from(errorLogs)

      const res = await ctx.request(`/api/containers/${id}`, { method: 'PATCH', json: { comment: 'changed' } })

      expect(res.status).toBe(500)
      const body = (await res.json()) as { error: string; errorCode: string }
      expect(body.error).toBe('enrichment failed')
      // The handler writes the log without awaiting it.
      await new Promise((resolve) => setTimeout(resolve, 50))
      const logsAfter = await ctx.db.select().from(errorLogs)
      expect(logsAfter.length).toBe(logsBefore.length + 1)
      expect(logsAfter.at(-1)?.message).toBe('enrichment failed')
    })
  })
})
