import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { setupTestDatabase, cleanupTestDatabase } from './helpers/db-setup'
import type { Database } from '../db/client'
import type { Database as SQLiteDatabase } from 'bun:sqlite'
import { runDemoSeed } from '../lib/demo-seed'
import { users, study, studySubject, micronixTube, micronixPlate, cryovialTube, cryovialBox, paper, containerDerivation, specimen, specimenType, strain, controlDefinition } from '../db/schema'
import { sql, eq } from 'drizzle-orm'

describe('runDemoSeed', () => {
  let testDb: Database
  let sqlite: SQLiteDatabase

  beforeEach(async () => {
    const setup = await setupTestDatabase()
    testDb = setup.db
    sqlite = setup.sqlite
  })

  afterEach(() => {
    cleanupTestDatabase(sqlite)
  })

  it('populates database with demo data demonstrating full application capabilities', async () => {
    const result = await runDemoSeed(testDb, { adminPassword: 'DemoAdmin1!' })

    expect(result.usersCreated).toBeGreaterThanOrEqual(1)
    expect(result.studiesCreated).toBeGreaterThanOrEqual(1)
    expect(result.subjectsCreated).toBeGreaterThanOrEqual(5)
    expect(result.specimensCreated).toBeGreaterThanOrEqual(5)
    expect(result.containersCreated).toBeGreaterThanOrEqual(1)
    expect(result.controlDefinitionsCreated).toBeGreaterThanOrEqual(1)
    expect(result.controlBatchesCreated).toBeGreaterThanOrEqual(1)
    expect(result.controlSpecimensCreated).toBeGreaterThanOrEqual(1)
  })

  it('creates admin user that can log in', async () => {
    await runDemoSeed(testDb, { adminPassword: 'DemoAdmin1!' })

    const admin = await testDb.select().from(users).where(sql`${users.role} = 'admin'`).get()
    expect(admin).toBeDefined()
    expect(admin?.email).toBe('admin@demo')
    expect(admin?.passwordHash).toBeDefined()
    expect(admin?.passwordHash.length).toBeGreaterThan(0)
  })

  it('creates study DEMO01 with subjects', async () => {
    await runDemoSeed(testDb, { adminPassword: 'DemoAdmin1!' })

    const demoStudy = await testDb.select().from(study).where(sql`${study.shortCode} = 'DEMO01'`).get()
    expect(demoStudy).toBeDefined()
    expect(demoStudy?.title).toBe('Demo Study')

    const subjectCount = await testDb.select({ count: sql<number>`count(*)` }).from(studySubject).where(sql`${studySubject.studyId} = ${demoStudy!.id}`).get()
    expect(subjectCount?.count ?? 0).toBeGreaterThanOrEqual(5)
  })

  it('associates control micronix tubes with their plates', async () => {
    await runDemoSeed(testDb, { adminPassword: 'DemoAdmin1!' })

    const plates = await testDb.select({ id: micronixPlate.id, name: micronixPlate.name }).from(micronixPlate).all()
    const ctrlPlates = plates.filter((p) => p.name.startsWith('CTRL-PLATE-'))
    expect(ctrlPlates.length).toBeGreaterThanOrEqual(2)

    const tubes = await testDb.select({ id: micronixTube.id, collectionId: micronixTube.collectionId, barcode: micronixTube.barcode }).from(micronixTube).all()
    const ctrlTubes = tubes.filter((t) => t.barcode?.startsWith('CTRL'))
    expect(ctrlTubes.length).toBeGreaterThanOrEqual(2)

    const plateIds = new Set(plates.map((p) => p.id))
    for (const tube of ctrlTubes) {
      expect(tube.collectionId).toBeDefined()
      expect(tube.collectionId).toBeGreaterThan(0)
      expect(plateIds.has(tube.collectionId!)).toBe(true)
    }
  })

  it('creates blood control batch with cryovial tubes in box', async () => {
    await runDemoSeed(testDb, { adminPassword: 'DemoAdmin1!' })

    const boxes = await testDb.select({ id: cryovialBox.id, name: cryovialBox.name }).from(cryovialBox).all()
    const bloodBox = boxes.find((b) => b.name === 'CTRL-BOX-BLOOD')
    expect(bloodBox).toBeDefined()

    const tubes = await testDb.select({ id: cryovialTube.id, collectionId: cryovialTube.collectionId, barcode: cryovialTube.barcode }).from(cryovialTube).all()
    const bloodTubes = tubes.filter((t) => t.barcode?.startsWith('CTRL8'))
    expect(bloodTubes.length).toBeGreaterThanOrEqual(2)

    for (const tube of bloodTubes) {
      expect(tube.collectionId).toBe(bloodBox!.id)
    }
  })

  it('creates exactly one Whole Blood specimen per batch (type+date+batch uniqueness)', async () => {
    await runDemoSeed(testDb, { adminPassword: 'DemoAdmin1!' })

    const wholeBloodType = await testDb.select().from(specimenType).where(eq(specimenType.name, 'Whole Blood')).get()
    expect(wholeBloodType).toBeDefined()

    const bloodSpecimens = await testDb
      .select()
      .from(specimen)
      .where(sql`${specimen.controlBatchId} IS NOT NULL`)
      .all()
    const wholeBloodInBatch = bloodSpecimens.filter((s) => s.specimenTypeId === wholeBloodType!.id)
    expect(wholeBloodInBatch.length).toBe(1)
  })

  it('creates strains W2 and U659 and blood control with 50/50 at 10k p/uL', async () => {
    await runDemoSeed(testDb, { adminPassword: 'DemoAdmin1!' })

    const strains = await testDb.select().from(strain).all()
    const strainNames = strains.map((s) => s.name)
    expect(strainNames).toContain('W2')
    expect(strainNames).toContain('U659')

    const bloodDef = await testDb
      .select()
      .from(controlDefinition)
      .where(eq(controlDefinition.controlType, 'blood'))
      .get()
    expect(bloodDef).toBeDefined()
    const props = bloodDef!.properties as { strains?: Array<{ name: string; percentage: number }>; targetDensity?: number; targetDensityUnitSymbol?: string }
    expect(props?.strains).toHaveLength(2)
    expect(props?.strains?.map((s) => s.name).sort()).toEqual(['U659', 'W2'])
    expect(props?.strains?.every((s) => s.percentage === 50)).toBe(true)
    expect(props?.targetDensity).toBe(10000)
    expect(props?.targetDensityUnitSymbol).toBe('p/uL')
  })

  it('creates blood control derivations: Whole Blood -> DBS -> DNA (DBS)', async () => {
    await runDemoSeed(testDb, { adminPassword: 'DemoAdmin1!' })

    const derivations = await testDb.select().from(containerDerivation).all()
    expect(derivations.length).toBeGreaterThanOrEqual(4)

    const spotDerivations = derivations.filter((d) => d.derivationType === 'spot')
    const extractionDerivations = derivations.filter((d) => d.derivationType === 'extraction')
    expect(spotDerivations.length).toBeGreaterThanOrEqual(2)
    expect(extractionDerivations.length).toBeGreaterThanOrEqual(2)

    const dbsPapers = await testDb.select({ id: paper.id, sublabel: paper.sublabel }).from(paper).all()
    const ctrlDbs = dbsPapers.filter((p) => p.sublabel?.startsWith('CTRL-DBS'))
    expect(ctrlDbs.length).toBe(2)

    const dnaTubes = await testDb.select({ id: micronixTube.id, barcode: micronixTube.barcode, collectionId: micronixTube.collectionId }).from(micronixTube).all()
    const ctrlDna = dnaTubes.filter((t) => t.barcode?.startsWith('CTRL-DNA'))
    expect(ctrlDna.length).toBe(2)

    const bloodDnaPlate = await testDb.select().from(micronixPlate).where(eq(micronixPlate.name, 'CTRL-PLATE-BLOOD-DNA')).get()
    expect(bloodDnaPlate).toBeDefined()
    for (const tube of ctrlDna) {
      expect(tube.collectionId).toBe(bloodDnaPlate!.id)
    }
  })
})
