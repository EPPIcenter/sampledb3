import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { eq } from 'drizzle-orm'
import { setupTestDatabase, cleanupTestDatabase } from '../../../__tests__/helpers/db-setup'
import {
  createTestLocation,
  createTestMicronixPlate,
  createTestSpecimenType,
  createTestStorageType,
  createTestStudy,
  createTestStudySubject,
  createTestUnit,
} from '../../../__tests__/helpers/factories'
import type { Database } from '../../../db/client'
import {
  containerTypeUnit,
  micronixPlate,
  micronixTube,
  paper,
  sheet,
  specimen,
  specimenTypeContainerType,
  storageContainer,
} from '../../../db/schema'
import { utcNow } from '../../datetime'
import { setContainerDefaults } from '../../settings'
import {
  checkSpecimenRegistration,
  registerSpecimens,
  SpecimenRegistrationError,
  type RegistrationContainer,
  type RegistrationEntry,
} from '..'
import { planRegistration } from '../plan'
import { writeRegistration } from '../write'

const CONTAINER_TYPES = ['micronix_tube', 'cryovial_tube', 'paper', 'static_well'] as const

describe('Specimen registration', () => {
  let db: Database
  let sqlite: Awaited<ReturnType<typeof setupTestDatabase>>['sqlite']
  let subjectId: number
  let specimenTypeId: number
  let locationId: number
  let unitId: number
  let plate: { id: number; name: string }

  beforeEach(async () => {
    const setup = await setupTestDatabase()
    db = setup.db
    sqlite = setup.sqlite

    const study = await createTestStudy(db, { title: 'Study 1', shortCode: 'ST1' })
    subjectId = (await createTestStudySubject(db, { studyId: study.id, name: 'S1' })).id
    specimenTypeId = (await createTestSpecimenType(db, { name: 'DNA' })).id
    const storageType = await createTestStorageType(db, { name: 'Freezer' })
    locationId = (await createTestLocation(db, { name: 'Shelf', storageTypeId: String(storageType.id), canContainCollections: true })).id
    unitId = (await createTestUnit(db, { symbol: 'uL', name: 'microliter', category: 'volume' })).id
    const now = utcNow()
    for (const containerType of CONTAINER_TYPES) {
      await db.insert(specimenTypeContainerType).values({ specimenTypeId, containerType, created: now, lastUpdated: now })
      await db.insert(containerTypeUnit).values({ containerType, unitId })
    }
    await setContainerDefaults(db, {
      micronix_tube: { totalQuantity: 1, remainingQuantity: 1, defaultUnitSymbol: 'uL' },
      cryovial_tube: { totalQuantity: 1, remainingQuantity: 1, defaultUnitSymbol: 'uL' },
      paper: { totalQuantity: 1, remainingQuantity: 1, defaultUnitSymbol: 'uL' },
      static_well: { totalQuantity: 1, remainingQuantity: 1, defaultUnitSymbol: 'uL' },
    })
    plate = await createTestMicronixPlate(db, { name: 'P1', barcode: 'P1-BC', locationId })
  })

  afterEach(() => {
    cleanupTestDatabase(sqlite)
  })

  const tube = (barcode: string, collection: Record<string, unknown>): RegistrationContainer => ({
    containerType: 'micronix_tube',
    barcode,
    collection: { type: 'micronix_plate', ...collection },
  })

  const paperOn = (sheetName: string, sublabel?: string, boxLocation = true): RegistrationContainer => ({
    containerType: 'paper',
    sublabel,
    collection: {
      type: 'sheet',
      name: sheetName,
      parent: { type: 'box', name: 'PaperBox', ...(boxLocation ? { locationId } : {}) },
    },
  })

  const entry = (containers: RegistrationContainer[], collectionDate = '2024-01-15'): RegistrationEntry => ({
    source: { subjectId },
    specimenTypeId,
    collectionDate,
    containers,
  })

  async function rejection(entries: RegistrationEntry[]): Promise<SpecimenRegistrationError> {
    const error = await registerSpecimens(db, entries).then(
      () => null,
      (e: unknown) => e,
    )
    if (!(error instanceof SpecimenRegistrationError)) throw new Error(`expected a registration error, got ${String(error)}`)
    return error
  }

  const count = async (table: typeof specimen | typeof storageContainer | typeof micronixPlate | typeof sheet) =>
    (await db.select().from(table)).length

  it('registers a specimen with a tube, normalizing the grid position', async () => {
    const result = await registerSpecimens(db, [entry([tube('T1', { name: 'P1', position: 'a1' })])])

    expect(result.entries).toHaveLength(1)
    expect(result.entries[0].reused).toBe(false)
    const [row] = await db.select().from(micronixTube).where(eq(micronixTube.id, result.entries[0].containerIds[0]))
    expect(row).toMatchObject({ collectionId: plate.id, barcode: 'T1', position: 'A01' })
  })

  it('reuses the specimen for the same Source, type, and date', async () => {
    await registerSpecimens(db, [entry([])])
    const result = await registerSpecimens(db, [
      entry([tube('T1', { name: 'P1', position: 'A01' })]),
      entry([tube('T2', { name: 'P1', position: 'A02' })], '1/15/2024'),
    ])

    expect(result.entries.map((e) => e.reused)).toEqual([true, true])
    expect(result.entries[0].specimen.id).toBe(result.entries[1].specimen.id)
    expect(await count(specimen)).toBe(1)
    expect(await count(storageContainer)).toBe(2)
  })

  it('merges entries for one collection event into one new specimen', async () => {
    const result = await registerSpecimens(db, [entry([]), entry([])])

    expect(result.entries.map((e) => e.reused)).toEqual([false, true])
    expect(await count(specimen)).toBe(1)
  })

  it('adds containers to an existing specimen named by id', async () => {
    const [first] = (await registerSpecimens(db, [entry([])])).entries
    const result = await registerSpecimens(db, [{ specimenId: first.specimen.id, containers: [tube('T1', { name: 'P1', position: 'A01' })] }])

    expect(result.entries[0]).toMatchObject({ reused: true, specimen: { id: first.specimen.id } })
    expect(result.entries[0].containerIds).toHaveLength(1)
  })

  it('reports every problem in the request and writes nothing', async () => {
    await registerSpecimens(db, [entry([tube('TAKEN', { name: 'P1', position: 'A01' })], '2024-01-01')])
    const before = await count(storageContainer)

    const error = await rejection([
      { source: { subjectId }, specimenTypeId: 9999, containers: [] },
      entry([], 'not-a-date'),
      entry([tube('T2', { name: 'P1', position: 'A01' })]),
      entry([tube('TAKEN', { name: 'P1', position: 'B01' })]),
      { specimenId: 9999, containers: [] },
    ])

    expect(error.status).toBe(400)
    expect(error.errors).toEqual([
      { entryIndex: 0, field: 'specimenTypeId', message: 'Specimen type not found' },
      { entryIndex: 1, field: 'collectionDate', message: expect.stringContaining('Invalid date') },
      { entryIndex: 2, containerIndex: 0, field: 'position', message: expect.stringContaining('Position A01 is already used') },
      { entryIndex: 3, containerIndex: 0, field: 'barcode', message: expect.stringContaining("Barcode 'TAKEN' already exists") },
      { entryIndex: 4, field: 'specimenId', message: 'Specimen not found' },
    ])
    expect(await count(storageContainer)).toBe(before)
  })

  describe('Collection identity', () => {
    it('rejects a barcode that does not match the plate the name finds', async () => {
      const error = await rejection([entry([tube('T1', { name: 'P1', barcode: 'UNKNOWN', position: 'A02' })])])

      expect(error.errors[0]).toMatchObject({ field: 'collection', message: "Micronix plate 'P1' has barcode 'P1-BC', not 'UNKNOWN'." })
      expect(await count(storageContainer)).toBe(0)
    })

    it('rejects a name that does not match the plate the barcode finds', async () => {
      await createTestMicronixPlate(db, { name: 'P2', barcode: 'P2-BC', locationId })

      const error = await rejection([entry([tube('T1', { name: 'P2', barcode: 'P1-BC', position: 'A01' })])])

      expect(error.errors[0].message).toContain("point to different micronix plates: 'P1' and 'P2'")
    })

    it('names the id when the plate it finds has another name', async () => {
      const error = await rejection([entry([tube('T1', { id: plate.id, name: 'OTHER', position: 'A01' })])])

      expect(error.errors[0].message).toBe(`Micronix plate id ${plate.id} is named 'P1', not 'OTHER'.`)
    })

    it('names the barcode when the plate it finds has another name', async () => {
      const error = await rejection([entry([tube('T1', { barcode: 'P1-BC', name: 'OTHER', position: 'A01' })])])

      expect(error.errors[0].message).toBe("Micronix plate with barcode 'P1-BC' is named 'P1', not 'OTHER'.")
    })

    it('treats a plate named by name and by barcode as one plate for position clashes', async () => {
      const error = await rejection([
        entry([tube('T1', { name: 'P1', position: 'A01' })]),
        entry([tube('T2', { barcode: 'P1-BC', position: 'A1' })]),
      ])

      expect(error.errors).toEqual([
        expect.objectContaining({ entryIndex: 1, field: 'position', message: expect.stringContaining('more than once in your file') }),
      ])
    })

    it('creates a missing plate once and lets later rows find it by name', async () => {
      const result = await registerSpecimens(db, [
        entry([tube('T1', { name: 'NEW', barcode: 'NEW-BC', locationId, position: 'A01' })]),
        entry([tube('T2', { name: 'NEW', position: 'A02' })]),
      ])

      expect(result.collectionsCreated).toEqual([{ type: 'micronix_plate', id: expect.any(Number), name: 'NEW' }])
      const [created] = await db.select().from(micronixPlate).where(eq(micronixPlate.name, 'NEW'))
      expect(created).toMatchObject({ barcode: 'NEW-BC', locationId })
    })

    it('refuses to create a plate without a location', async () => {
      const error = await rejection([entry([tube('T1', { name: 'NOPE', position: 'A01' })])])

      expect(error.errors[0].message).toBe('Collection not found and no location provided')
    })

    it('rejects two locations for one new plate', async () => {
      const storageType = await createTestStorageType(db, { name: 'Fridge' })
      const other = await createTestLocation(db, { name: 'Other', storageTypeId: String(storageType.id), canContainCollections: true })

      const error = await rejection([
        entry([tube('T1', { name: 'NEW', locationId, position: 'A01' })]),
        entry([tube('T2', { name: 'NEW', locationId: other.id, position: 'A02' })]),
      ])

      expect(error.errors[0]).toMatchObject({ entryIndex: 1, message: "Micronix plate 'NEW' is given two different locations in this request." })
    })
  })

  describe('Paper on Sheets', () => {
    it('puts several papers on one new sheet', async () => {
      const result = await registerSpecimens(db, [
        entry([paperOn('Sheet-1', 's1')]),
        entry([paperOn('Sheet-1', 's2', false)], '2024-01-16'),
      ])

      expect(result.collectionsCreated.map((c) => c.type)).toEqual(['box', 'sheet'])
      const papers = await db.select().from(paper)
      expect(papers.map((p) => p.sheetId)).toEqual([papers[0].sheetId, papers[0].sheetId])
    })

    it('rejects a sublabel used twice on one sheet', async () => {
      await registerSpecimens(db, [entry([paperOn('Sheet-1', 's1')])])

      const error = await rejection([entry([paperOn('Sheet-1', 's1'), paperOn('Sheet-1', 's2'), paperOn('Sheet-1', 's2')])])

      expect(error.errors.map((e) => [e.containerIndex, e.message])).toEqual([
        [0, "Sublabel 's1' is already used on this sheet."],
        [2, "Sublabel 's2' is used more than once on this sheet in your file."],
      ])
    })
  })

  it('rejects a unit not allowed for the container type', async () => {
    const other = await createTestUnit(db, { symbol: 'mg', name: 'milligram', category: 'mass' })

    const error = await rejection([entry([{ ...tube('T1', { name: 'P1', position: 'A01' }), unitId: other.id }])])

    expect(error.errors[0]).toMatchObject({ field: 'unitId', message: expect.stringContaining("Unit 'mg' is not allowed") })
  })

  describe('checkSpecimenRegistration', () => {
    it('writes nothing and lists the collections the registration would create', async () => {
      const entries = [entry([tube('T1', { name: 'NEW', locationId, position: 'A01' }), paperOn('Sheet-1')])]

      const check = await checkSpecimenRegistration(db, entries)

      expect(check).toEqual({
        errors: [],
        collectionsToCreate: [
          { type: 'micronix_plate', name: 'NEW' },
          { type: 'box', name: 'PaperBox' },
          { type: 'sheet', name: 'Sheet-1' },
        ],
      })
      expect([await count(specimen), await count(micronixPlate), await count(sheet)]).toEqual([0, 1, 0])
      await expect(registerSpecimens(db, entries)).resolves.toBeDefined()
    })

    it('returns the errors registerSpecimens would throw', async () => {
      const check = await checkSpecimenRegistration(db, [entry([tube('T1', { name: 'P1', barcode: 'UNKNOWN', position: 'A01' })])])

      expect(check.errors).toHaveLength(1)
      expect(check.collectionsToCreate).toEqual([])
    })

    it('rolls back to a savepoint inside an open transaction', async () => {
      sqlite.exec('BEGIN')
      await registerSpecimens(db, [entry([])])
      await checkSpecimenRegistration(db, [entry([tube('T1', { name: 'P1', position: 'A01' })], '2024-02-01')])
      sqlite.exec('COMMIT')

      expect([await count(specimen), await count(storageContainer)]).toEqual([1, 0])
    })
  })

  it('reports a constraint hit while writing as a 409', async () => {
    // Plan, then let another write take the well before this one writes: the race a plan cannot see.
    const { plan, errors } = await planRegistration(db, [entry([tube('T1', { name: 'P1', position: 'A01' })])])
    expect(errors).toEqual([])
    await registerSpecimens(db, [entry([tube('T0', { name: 'P1', position: 'A01' })], '2024-01-01')])

    const error = await writeRegistration(db, plan, undefined).then(
      () => null,
      (e: unknown) => e,
    )

    expect(error).toBeInstanceOf(SpecimenRegistrationError)
    expect(error).toMatchObject({ status: 409, errors: [{ entryIndex: 0, containerIndex: 0 }] })
  })

  it('blames a constraint hit on a new collection on the row that asked for it', async () => {
    // Rows 0 and 1 use the existing plate; row 2 creates P2. Another write creates P2 first.
    const entries = [
      entry([tube('T1', { name: 'P1', position: 'A01' })]),
      entry([paperOn('Sheet-1'), tube('T2', { name: 'P2', locationId, position: 'A01' })], '2024-02-01'),
    ]
    const { plan, errors } = await planRegistration(db, entries)
    expect(errors).toEqual([])
    await createTestMicronixPlate(db, { name: 'P2', barcode: 'P2-BC', locationId })
    sqlite.exec('CREATE UNIQUE INDEX test_plate_name ON micronix_plate(name)')

    const error = await writeRegistration(db, plan, undefined).then(
      () => null,
      (e: unknown) => e,
    )

    expect(error).toBeInstanceOf(SpecimenRegistrationError)
    expect(error).toMatchObject({ status: 409 })
    expect((error as SpecimenRegistrationError).errors).toEqual([
      { entryIndex: 1, containerIndex: 1, message: 'A record with this name already exists.' },
    ])
  })
})
