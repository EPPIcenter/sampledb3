import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { setupTestDatabase, cleanupTestDatabase } from '../../__tests__/helpers/db-setup'
import {
  resolveStudyByShortCode,
  resolveSubjectByNameAndStudy,
  resolveSpecimenTypeByName,
  resolveContainerByBarcode,
  findContainersByBarcode,
  findTubesUsingBarcode,
  AmbiguousBarcodeError,
  resolveStudiesByShortCodes,
  resolveSpecimenTypesByNames,
  resolveSubjectNamesByStudy,
} from '../identifier-resolution'
import { SQL_IN_CHUNK_SIZE } from '../sql-helpers'
import {
  createTestStudy,
  createTestStudySubject,
  createTestSpecimenType,
  createTestStorageContainer,
  createTestStorageType,
  createTestLocation,
  createTestCryovialBox,
  createTestCryovialTube,
  createTestMicronixPlate,
  createTestMicronixTube,
} from '../../__tests__/helpers/factories'
import { box, sheet, paper } from '../../db/schema'
import { utcNow } from '../datetime'
import type { Database } from '../../db/client'

describe('identifier-resolution lib', () => {
  let testDb: Database
  let sqlite: Awaited<ReturnType<typeof setupTestDatabase>>['sqlite']

  beforeEach(async () => {
    const setup = await setupTestDatabase()
    testDb = setup.db
    sqlite = setup.sqlite
  })

  afterEach(() => {
    if (sqlite) {
      cleanupTestDatabase(sqlite)
    }
  })

  describe('resolveStudyByShortCode', () => {
    it('returns null for missing short code', async () => {
      const id = await resolveStudyByShortCode(testDb, 'MISSING')
      expect(id).toBeNull()
    })

    it('returns study id when short code exists', async () => {
      const study = await createTestStudy(testDb, {
        title: 'Test Study',
        shortCode: 'ST1',
      })
      const id = await resolveStudyByShortCode(testDb, 'ST1')
      expect(id).toBe(study.id)
    })
  })

  describe('resolveSubjectByNameAndStudy', () => {
    it('returns null when subject does not exist', async () => {
      const study = await createTestStudy(testDb, { title: 'S', shortCode: 'S1' })
      const id = await resolveSubjectByNameAndStudy(testDb, 'NoSubject', study.id)
      expect(id).toBeNull()
    })

    it('returns subject id when name and study match', async () => {
      const study = await createTestStudy(testDb, { title: 'S', shortCode: 'S1' })
      const subject = await createTestStudySubject(testDb, { studyId: study.id, name: 'SUBJ-001' })
      const id = await resolveSubjectByNameAndStudy(testDb, 'SUBJ-001', study.id)
      expect(id).toBe(subject.id)
    })
  })

  describe('resolveSpecimenTypeByName', () => {
    it('returns null for missing name', async () => {
      const id = await resolveSpecimenTypeByName(testDb, 'Nonexistent Type')
      expect(id).toBeNull()
    })

    it('returns specimen type id when name exists', async () => {
      const st = await createTestSpecimenType(testDb, { name: 'Whole Blood' })
      const id = await resolveSpecimenTypeByName(testDb, 'Whole Blood')
      expect(id).toBe(st.id)
    })
  })

  describe('resolveContainerByBarcode', () => {
    it('returns null for non-existent barcode', async () => {
      const id = await resolveContainerByBarcode(testDb, 'NOBARCODE')
      expect(id).toBeNull()
    })

    it('returns paper container id when sublabel matches', async () => {
      const now = utcNow()
      const storageType = await createTestStorageType(testDb, { name: 'Room' })
      const loc = await createTestLocation(testDb, {
        name: 'Paper Loc',
        storageTypeId: String(storageType.id),
        path: 'Room',
      })
      const [parentBox] = await testDb
        .insert(box)
        .values({ name: 'Box-A', locationId: loc.id, created: now, lastUpdated: now })
        .returning()
      const [parentSheet] = await testDb
        .insert(sheet)
        .values({ name: 'Sheet-A', boxId: parentBox!.id, created: now, lastUpdated: now })
        .returning()
      const container = await createTestStorageContainer(testDb, {})
      await testDb.insert(paper).values({
        id: container.id,
        sheetId: parentSheet!.id,
        sublabel: 'SPOT-42',
      })

      const match = await resolveContainerByBarcode(testDb, 'SPOT-42')
      expect(match?.containerId).toBe(container.id)
    })

    it('throws AmbiguousBarcodeError listing every Container when the barcode is on several', async () => {
      const { first, second } = await seedSharedCryovialBarcode('NA')

      const error = await resolveContainerByBarcode(testDb, 'NA').catch((e: unknown) => e)

      expect(error).toBeInstanceOf(AmbiguousBarcodeError)
      expect((error as AmbiguousBarcodeError).candidates.map((c) => c.containerId)).toEqual([first, second])
      expect((error as AmbiguousBarcodeError).message).toBe(
        `Ambiguous barcode 'NA': it matches 2 containers (container ${first} (cryovial_tube in BOX-1 A01), ` +
          `container ${second} (cryovial_tube in BOX-1 A02)). Identify the container by its id or position instead.`,
      )
    })
  })

  describe('findContainersByBarcode', () => {
    it('returns every Container carrying the barcode, ordered by id', async () => {
      const { first, second } = await seedSharedCryovialBarcode('NA')
      const matches = await findContainersByBarcode(testDb, 'NA')
      expect(matches.map((m) => [m.containerId, m.containerType, m.barcode])).toEqual([
        [first, 'cryovial_tube', 'NA'],
        [second, 'cryovial_tube', 'NA'],
      ])
    })

    it('matches exactly unless asked to ignore case', async () => {
      await seedSharedCryovialBarcode('CK3-3FR4')
      expect(await findContainersByBarcode(testDb, 'Ck3-3Fr4')).toEqual([])
      expect(await findContainersByBarcode(testDb, ' Ck3-3Fr4 ', { ignoreCase: true })).toHaveLength(2)
    })
  })

  describe('findTubesUsingBarcode', () => {
    it('finds tubes of every type ignoring case, except the given Container', async () => {
      const { location, sibling } = await seedSharedCryovialBarcode('OTHER')
      const plate = await createTestMicronixPlate(testDb, { name: 'PLATE-1', locationId: location.id })
      const micronix = await createTestStorageContainer(testDb, sibling)
      await createTestMicronixTube(testDb, { containerId: micronix.id, collectionId: plate.id, barcode: 'MX-1' })
      const box2 = await createTestCryovialBox(testDb, { name: 'BOX-2', locationId: location.id })
      const cryovial = await createTestStorageContainer(testDb, sibling)
      await createTestCryovialTube(testDb, { containerId: cryovial.id, collectionId: box2.id, barcode: 'mx-1 ' })

      expect((await findTubesUsingBarcode(testDb, 'Mx-1')).map((m) => m.containerId)).toEqual([micronix.id, cryovial.id])
      expect((await findTubesUsingBarcode(testDb, 'MX-1', micronix.id)).map((m) => m.containerId)).toEqual([cryovial.id])
    })
  })

  /** Two cryovial tubes in BOX-1 (A01 and A02) whose barcodes are `barcode` and a lower-case copy when it has letters. */
  async function seedSharedCryovialBarcode(barcode: string) {
    const storageType = await createTestStorageType(testDb, { name: 'Freezer' })
    const location = await createTestLocation(testDb, { name: 'Freezer 1', storageTypeId: String(storageType.id), path: 'Freezer 1' })
    const cryoBox = await createTestCryovialBox(testDb, { name: 'BOX-1', locationId: location.id })
    const a = await createTestStorageContainer(testDb, {})
    const b = await createTestStorageContainer(testDb, { unitId: a.unitId, specimenId: a.specimenId })
    const second = barcode === 'CK3-3FR4' ? barcode.toLowerCase() : barcode
    await createTestCryovialTube(testDb, { containerId: a.id, collectionId: cryoBox.id, barcode, position: 'A01' })
    await createTestCryovialTube(testDb, { containerId: b.id, collectionId: cryoBox.id, barcode: second, position: 'A02' })
    return { first: a.id, second: b.id, location, sibling: { unitId: a.unitId, specimenId: a.specimenId } }
  }

  describe('resolveStudiesByShortCodes', () => {
    it('returns empty map for empty array', async () => {
      const map = await resolveStudiesByShortCodes(testDb, [])
      expect(map.size).toBe(0)
    })

    it('returns map of code to id for existing studies', async () => {
      const study = await createTestStudy(testDb, { title: 'S', shortCode: 'ST2' })
      const map = await resolveStudiesByShortCodes(testDb, ['ST2'])
      expect(map.get('ST2')).toBe(study.id)
    })
  })

  describe('resolveSpecimenTypesByNames', () => {
    it('returns empty map for empty array', async () => {
      const map = await resolveSpecimenTypesByNames(testDb, [])
      expect(map.size).toBe(0)
    })

    it('returns map of name to id for existing specimen types', async () => {
      const st = await createTestSpecimenType(testDb, { name: 'Serum' })
      const map = await resolveSpecimenTypesByNames(testDb, ['Serum'])
      expect(map.get('Serum')).toBe(st.id)
    })
  })

  describe('resolveSubjectNamesByStudy', () => {
    it("resolves the Study's Subjects by name, and not another Study's", async () => {
      const study = await createTestStudy(testDb, { title: 'S', shortCode: 'S1' })
      const other = await createTestStudy(testDb, { title: 'O', shortCode: 'O1' })
      const subject = await createTestStudySubject(testDb, { studyId: study.id, name: 'P1' })
      await createTestStudySubject(testDb, { studyId: other.id, name: 'P2' })

      const map = await resolveSubjectNamesByStudy(testDb, ['P1', 'P2', 'P1'], study.id)

      expect(map).toEqual(new Map([['P1', subject.id]]))
    })

    it('resolves every listed name when the list has more names than SQLite allows as bound parameters', async () => {
      const study = await createTestStudy(testDb, { title: 'S', shortCode: 'S1' })
      const first = await createTestStudySubject(testDb, { studyId: study.id, name: 'FIRST' })
      const last = await createTestStudySubject(testDb, { studyId: study.id, name: 'LAST' })
      const unknown = Array.from({ length: SQL_IN_CHUNK_SIZE * 140 }, (_, i) => `UNKNOWN${i}`)

      const map = await resolveSubjectNamesByStudy(testDb, ['FIRST', ...unknown, 'LAST'], study.id)

      expect(map).toEqual(new Map([['FIRST', first.id], ['LAST', last.id]]))
    })
  })
})
