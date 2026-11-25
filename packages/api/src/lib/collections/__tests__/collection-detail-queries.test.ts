import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { setupTestDatabase, cleanupTestDatabase } from '../../../__tests__/helpers/db-setup'
import {
  createTestBag,
  createTestBox,
  createTestCryovialBox,
  createTestCryovialTube,
  createTestLocation,
  createTestMicronixPlate,
  createTestMicronixTube,
  createTestPaper,
  createTestSheet,
  createTestSpecimen,
  createTestSpecimenType,
  createTestStaticWell,
  createTestStorageContainer,
  createTestStorageType,
  createTestUnit,
} from '../../../__tests__/helpers/factories'
import type { Database } from '../../../db/client'
import { findContainersByBarcode } from '../../identifier-resolution'
import {
  getBagDetail,
  getCryovialBoxDetail,
  getGenericBoxDetail,
  getMicronixPlateDetail,
  getSheetDetail,
} from '../collection-detail'

type Sqlite = Awaited<ReturnType<typeof setupTestDatabase>>['sqlite']

describe('collection detail queries', () => {
  let testDb: Database
  let sqlite: Sqlite
  let locationId: number
  let containerOptions: { specimenId: number; unitId: number }

  beforeEach(async () => {
    const setup = await setupTestDatabase()
    testDb = setup.db
    sqlite = setup.sqlite
    const storageType = await createTestStorageType(testDb, { name: 'Freezer' })
    const loc = await createTestLocation(testDb, {
      name: 'Freezer',
      storageTypeId: String(storageType.id),
      canContainCollections: true,
    })
    locationId = loc.id
    const unit = await createTestUnit(testDb, { symbol: 'uL', name: 'microliter', category: 'volume' })
    const specimenType = await createTestSpecimenType(testDb, { name: 'DBS' })
    const specimen = await createTestSpecimen(testDb, specimenType.id)
    containerOptions = { specimenId: specimen.id, unitId: unit.id }
  })

  afterEach(() => {
    vi.restoreAllMocks()
    cleanupTestDatabase(sqlite)
  })

  /** Run `fn` and return the SQL of every statement it prepared. */
  async function capturePreparedSql(fn: () => Promise<unknown>): Promise<string[]> {
    const statements: string[] = []
    const prepare = sqlite.prepare.bind(sqlite)
    vi.spyOn(sqlite, 'prepare').mockImplementation(((query: string) => {
      statements.push(query)
      return prepare(query)
    }) as typeof sqlite.prepare)
    try {
      await fn()
    } finally {
      vi.restoreAllMocks()
    }
    return statements
  }

  /** EXPLAIN QUERY PLAN details for one statement, binding 1 to every parameter. */
  function queryPlan(statement: string): string[] {
    const parameters = (statement.match(/\?/g) ?? []).map(() => 1)
    return sqlite
      .query<{ detail: string }, number[]>(`EXPLAIN QUERY PLAN ${statement}`)
      .all(...parameters)
      .map((row) => row.detail)
  }

  /** Plans of the captured statements that read `table`, one per statement. */
  function plansReading(statements: string[], table: string): string[][] {
    const reading = statements.filter((statement) => new RegExp(`\\bfrom "${table}"`, 'i').test(statement))
    expect(reading.length).toBeGreaterThan(0)
    return reading.map(queryPlan)
  }

  async function addPapers(sheetId: number, sublabels: Array<string | null>) {
    const ids: number[] = []
    for (const sublabel of sublabels) {
      const container = await createTestStorageContainer(testDb, containerOptions)
      await createTestPaper(testDb, { containerId: container.id, sheetId, sublabel })
      ids.push(container.id)
    }
    return ids
  }

  /** A bag or box with `sheetCount` Sheets of two papers each. */
  async function addSheets(parent: { bagId: number } | { boxId: number }, sheetCount: number) {
    for (let i = 1; i <= sheetCount; i++) {
      const sheet = await createTestSheet(testDb, { name: `S${i}`, ...parent })
      await addPapers(sheet.id, [`S${i}-a`, `S${i}-b`])
    }
  }

  it('runs the same number of queries for a bag with one Sheet as with eight', async () => {
    const small = await createTestBag(testDb, { name: 'BAG-1', locationId })
    const large = await createTestBag(testDb, { name: 'BAG-8', locationId })
    await addSheets({ bagId: small.id }, 1)
    await addSheets({ bagId: large.id }, 8)

    const smallQueries = await capturePreparedSql(() => getBagDetail(testDb, small.id))
    const largeQueries = await capturePreparedSql(() => getBagDetail(testDb, large.id))

    expect(largeQueries.length).toBe(smallQueries.length)
  })

  it('runs the same number of queries for a box with one Sheet as with eight', async () => {
    const small = await createTestBox(testDb, { name: 'BOX-1', locationId })
    const large = await createTestBox(testDb, { name: 'BOX-8', locationId })
    await addSheets({ boxId: small.id }, 1)
    await addSheets({ boxId: large.id }, 8)

    const smallQueries = await capturePreparedSql(() => getGenericBoxDetail(testDb, small.id))
    const largeQueries = await capturePreparedSql(() => getGenericBoxDetail(testDb, large.id))

    expect(largeQueries.length).toBe(smallQueries.length)
  })

  it('lists each paper under its own Sheet, keeps empty Sheets, and leaves out other bags', async () => {
    const bag = await createTestBag(testDb, { name: 'BAG-A', locationId })
    const other = await createTestBag(testDb, { name: 'BAG-B', locationId })
    const first = await createTestSheet(testDb, { name: 'S1', bagId: bag.id })
    const empty = await createTestSheet(testDb, { name: 'S2', bagId: bag.id })
    const third = await createTestSheet(testDb, { name: 'S3', bagId: bag.id })
    const elsewhere = await createTestSheet(testDb, { name: 'S1', bagId: other.id })
    const [a, b] = await addPapers(first.id, ['a', 'b'])
    const [c] = await addPapers(third.id, ['c'])
    await addPapers(elsewhere.id, ['x'])
    const [d] = await addPapers(first.id, [null])

    const detail = await getBagDetail(testDb, bag.id)

    expect(
      detail!.contents.sheets.map((sheet) => ({
        id: sheet.id,
        papers: sheet.papers.map((p) => [p.id, p.sublabel, p.container?.id]),
      })),
    ).toEqual([
      { id: first.id, papers: [[a, 'a', a], [b, 'b', b], [d, null, d]] },
      { id: empty.id, papers: [] },
      { id: third.id, papers: [[c, 'c', c]] },
    ])
  })

  it('lists a Sheet\'s papers in id order, not sublabel order', async () => {
    const bag = await createTestBag(testDb, { name: 'BAG-O', locationId })
    const sheet = await createTestSheet(testDb, { name: 'S1', bagId: bag.id })
    const ids = await addPapers(sheet.id, ['b', 'a', null])

    const sheetDetail = await getSheetDetail(testDb, sheet.id)
    const bagDetail = await getBagDetail(testDb, bag.id)

    expect(sheetDetail!.papers.map((p) => p.id)).toEqual(ids)
    expect(bagDetail!.contents.sheets[0].papers.map((p) => p.id)).toEqual(ids)
  })

  it('lists each paper under its own Sheet in a box', async () => {
    const boxRecord = await createTestBox(testDb, { name: 'BOX-A', locationId })
    const first = await createTestSheet(testDb, { name: 'S1', boxId: boxRecord.id })
    const second = await createTestSheet(testDb, { name: 'S2', boxId: boxRecord.id })
    const [a] = await addPapers(second.id, ['a'])
    const [b] = await addPapers(first.id, ['b'])

    const detail = await getGenericBoxDetail(testDb, boxRecord.id)

    expect(detail!.contents.sheets.map((sheet) => [sheet.id, sheet.papers.map((p) => p.id)])).toEqual([
      [first.id, [b]],
      [second.id, [a]],
    ])
  })

  describe('use an index', () => {
    it('to find papers by Sheet in bag, box and Sheet detail', async () => {
      const bag = await createTestBag(testDb, { name: 'BAG-P', locationId })
      const boxRecord = await createTestBox(testDb, { name: 'BOX-P', locationId })
      const sheet = await createTestSheet(testDb, { name: 'S1', bagId: bag.id })
      await createTestSheet(testDb, { name: 'S1', boxId: boxRecord.id })
      await addPapers(sheet.id, ['a'])

      const statements = [
        ...(await capturePreparedSql(() => getBagDetail(testDb, bag.id))),
        ...(await capturePreparedSql(() => getGenericBoxDetail(testDb, boxRecord.id))),
        ...(await capturePreparedSql(() => getSheetDetail(testDb, sheet.id))),
      ]
      // Papers by Sheet or by the Sheet's parent. The Container read view also reads paper, by id.
      const bySheet = statements.filter(
        (statement) =>
          /\bfrom "paper"/i.test(statement) && /"(paper"\."sheet_id|sheet"\."bag_id|sheet"\."box_id)" = \?/.test(statement),
      )
      expect(bySheet).toHaveLength(3)
      const plans = bySheet.map(queryPlan)
      for (const plan of plans) {
        expect(plan.join('\n')).toMatch(/SEARCH p(aper)? USING (COVERING )?INDEX paper_sheet_id_sublabel_idx \(sheet_id=\?\)/)
        expect(plan.join('\n')).not.toMatch(/SCAN (paper|sheet)\b/)
      }
    })

    it('to find tubes and static wells by Collection', async () => {
      const plate = await createTestMicronixPlate(testDb, { name: 'P1', locationId })
      const cryovialBox = await createTestCryovialBox(testDb, { name: 'C1', locationId })
      const tube = await createTestStorageContainer(testDb, containerOptions)
      await createTestMicronixTube(testDb, { containerId: tube.id, collectionId: plate.id, barcode: 'MX1', position: 'A01' })
      const well = await createTestStorageContainer(testDb, containerOptions)
      await createTestStaticWell(testDb, { containerId: well.id, collectionId: plate.id, position: 'A02' })
      const vial = await createTestStorageContainer(testDb, containerOptions)
      await createTestCryovialTube(testDb, { containerId: vial.id, collectionId: cryovialBox.id, barcode: 'CV1', position: 'A01' })

      const statements = [
        ...(await capturePreparedSql(() => getMicronixPlateDetail(testDb, plate.id))),
        ...(await capturePreparedSql(() => getCryovialBoxDetail(testDb, cryovialBox.id))),
      ]
      const collectionLookups = (table: string) =>
        plansReading(statements, table).filter((plan) => plan.some((line) => line.includes('collection_id=?')))
      expect(collectionLookups('micronix_tube')).toEqual([
        ['SEARCH micronix_tube USING INDEX micronix_tube_collection_id_idx (collection_id=?)'],
      ])
      expect(collectionLookups('static_well')).toEqual([
        ['SEARCH static_well USING INDEX static_well_collection_id_idx (collection_id=?)'],
      ])
      expect(collectionLookups('cryovial_tube')).toEqual([
        ['SEARCH cryovial_tube USING INDEX cryovial_tube_collection_id_idx (collection_id=?)'],
      ])
    })

    it('to find tubes by barcode, exactly and ignoring case and surrounding whitespace', async () => {
      const exact = await capturePreparedSql(() => findContainersByBarcode(testDb, 'MX1'))
      const folded = await capturePreparedSql(() =>
        findContainersByBarcode(testDb, ' mx1 ', { ignoreCase: true, tubesOnly: true }),
      )

      const lookup = (plans: string[][]) => plans.map((plan) => plan.find((line) => /^(SEARCH|SCAN) (micronix_tube|cryovial_tube|paper)\b/.test(line)))
      expect(lookup(plansReading(exact, 'micronix_tube'))).toEqual([
        'SEARCH micronix_tube USING INDEX sqlite_autoindex_micronix_tube_1 (barcode=?)',
      ])
      expect(lookup(plansReading(exact, 'cryovial_tube'))).toEqual([
        'SEARCH cryovial_tube USING INDEX cryovial_tube_barcode_idx (barcode=?)',
      ])
      expect(lookup(plansReading(exact, 'paper'))).toEqual(['SEARCH paper USING INDEX paper_sublabel_idx (sublabel=?)'])
      expect(lookup(plansReading(folded, 'micronix_tube'))).toEqual([
        'SEARCH micronix_tube USING INDEX micronix_tube_barcode_folded_idx (<expr>=?)',
      ])
      expect(lookup(plansReading(folded, 'cryovial_tube'))).toEqual([
        'SEARCH cryovial_tube USING INDEX cryovial_tube_barcode_folded_idx (<expr>=?)',
      ])
    })
  })
})
