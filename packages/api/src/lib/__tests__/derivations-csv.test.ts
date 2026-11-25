import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { setupTestDatabase, cleanupTestDatabase } from '../../__tests__/helpers/db-setup'
import { parseCsv, validateDerivationsCsv, importDerivationsFromCsv } from '../derivations-csv'
import type { Database } from '../../db/client'
import {
  containerDerivation,
  storageContainer,
  specimenTypeContainerType,
  containerTypeUnit,
  specimen,
  studySubject,
  micronixTube,
  micronixPlate,
} from '../../db/schema'
import { eq, or } from 'drizzle-orm'
import { newCollectionName } from '@sampledb/contract'
import { runBulkCombinedImport } from '../bulk-combined-import'
import {
  createTestStudy,
  createTestStudySubject,
  createTestSpecimenType,
  createTestUnit,
  createTestStorageType,
  createTestLocation,
  createTestMicronixPlate,
  createTestMicronixTube,
  createTestCryovialBox,
  createTestCryovialTube,
  createTestBag,
  createTestSpecimen,
  createTestStorageContainer,
} from '../../__tests__/helpers/factories'
import { setContainerDefaults } from '../settings'
import { utcNow } from '../datetime'

describe('derivations-csv', () => {
  describe('parseCsv', () => {
    it('returns empty array for empty text', () => {
      const rows = parseCsv('')
      expect(rows).toEqual([])
    })

    it('returns empty array for whitespace-only lines', () => {
      const rows = parseCsv('   \n\n  ')
      expect(rows).toEqual([])
    })

    it('parses header and one row', () => {
      const text = 'parent_container_id,derivation_type,specimen_type_name\n1,Extraction,Blood'
      const rows = parseCsv(text)
      expect(rows.length).toBe(1)
      expect(rows[0]).toMatchObject({
        parent_container_id: '1',
        derivation_type: 'Extraction',
        specimen_type_name: 'Blood',
      })
    })

    it('parses multiple rows', () => {
      const text = `col_a,col_b\n1,2\n3,4`
      const rows = parseCsv(text)
      expect(rows.length).toBe(2)
      expect(rows[0]).toMatchObject({ col_a: '1', col_b: '2' })
      expect(rows[1]).toMatchObject({ col_a: '3', col_b: '4' })
    })

    it('handles quoted fields', () => {
      const text = 'parent_container_id,derivation_type\n1,Extraction'
      const rows = parseCsv(text)
      expect(rows.length).toBe(1)
      expect(rows[0].parent_container_id).toBe('1')
      expect(rows[0].derivation_type).toBe('Extraction')
    })

    it('handles escaped quotes in quoted field', () => {
      const text = 'notes\n""double""'
      const rows = parseCsv(text)
      expect(rows.length).toBe(1)
      // Parser collapses "" to single " inside quoted field
      expect(rows[0].notes).toBe('double')
    })

    it('strips a UTF-8 BOM so the first header is usable', () => {
      const text = '\uFEFFparent_container_id,derivation_type\n1,Extraction'
      const rows = parseCsv(text)
      expect(rows.length).toBe(1)
      expect(rows[0].parent_container_id).toBe('1')
    })

    it('matches headers case-insensitively and drops rows with no values', () => {
      const rows = parseCsv('Parent_Container_ID,Plate_Name\n1,P1\n,\n,,\n')
      expect(rows).toEqual([{ parent_container_id: '1', plate_name: 'P1' }])
    })

    it('handles newlines inside quoted fields', () => {
      const text = 'parent_container_id,notes\n1,"line one\nline two"'
      const rows = parseCsv(text)
      expect(rows.length).toBe(1)
      expect(rows[0].parent_container_id).toBe('1')
      expect(rows[0].notes).toBe('line one\nline two')
    })
  })

  describe('validateDerivationsCsv', () => {
    let testDb: Database
    let sqlite: Awaited<ReturnType<typeof setupTestDatabase>>['sqlite']

    beforeEach(async () => {
      const setup = await setupTestDatabase()
      testDb = setup.db
      sqlite = setup.sqlite
    })

    afterEach(() => {
      if (sqlite) cleanupTestDatabase(sqlite)
    })

    it('returns invalid when plate_name and collection_barcode missing for micronix_tube', async () => {
      const text = 'parent_container_id,derivation_type,specimen_type_name,container_type\n1,Extraction,Blood,micronix_tube'
      const result = await validateDerivationsCsv(testDb, text)
      expect(result.rows.length).toBe(1)
      expect(result.rows[0].valid).toBe(false)
      expect(result.rows[0].error).toMatch(/plate_name or collection_barcode is required/)
      expect(result.summary.invalid).toBeGreaterThanOrEqual(1)
    })

    it('returns invalid when parent container does not exist', async () => {
      const text = 'parent_container_id,derivation_type,specimen_type_name,container_type,plate_name,position\n99999,Extraction,Blood,micronix_tube,PLATE-001,A01'
      const result = await validateDerivationsCsv(testDb, text)
      expect(result.rows.length).toBe(1)
      expect(result.rows[0].valid).toBe(false)
      expect(result.rows[0].error).toMatch(/not found/)
    })

    it('returns invalid when derivation_type in CSV conflicts with settings', async () => {
      const text = 'parent_container_id,derivation_type,specimen_type_name\n1,Extraction,Blood'
      const result = await validateDerivationsCsv(testDb, text, {
        derivationType: 'DNA Extraction',
        specimenTypeName: 'Blood',
        containerType: '',
        protocol: '',
        derivationDate: '',
      })
      expect(result.rows.length).toBe(1)
      expect(result.rows[0].error).toMatch(/conflicts with shared settings/)
    })

    it('returns empty rows and zero counts for empty CSV', async () => {
      const result = await validateDerivationsCsv(testDb, '')
      expect(result.rows).toHaveLength(0)
      expect(result.summary.total).toBe(0)
      expect(result.summary.valid).toBe(0)
      expect(result.summary.invalid).toBe(0)
    })

    it('returns invalid when collection missing for cryovial_tube', async () => {
      const text = 'parent_container_id,derivation_type,specimen_type_name,container_type\n1,Extraction,Blood,cryovial_tube'
      const result = await validateDerivationsCsv(testDb, text)
      expect(result.rows.length).toBe(1)
      expect(result.rows[0].valid).toBe(false)
      expect(result.rows[0].error).toMatch(/box_name or collection_barcode is required.*cryovial_tube/)
    })

    it('rejects legacy collection_name column for micronix_tube rows', async () => {
      const text = 'parent_container_id,derivation_type,specimen_type_name,container_type,collection_name,position\n1,Extraction,Blood,micronix_tube,PLATE-001,A01'
      const result = await validateDerivationsCsv(testDb, text)
      expect(result.rows.length).toBe(1)
      expect(result.rows[0].valid).toBe(false)
      expect(result.rows[0].error).toMatch(/plate_name or collection_barcode is required/)
    })

    it('returns invalid when protocol in CSV conflicts with settings', async () => {
      const text = 'parent_container_id,derivation_type,specimen_type_name,protocol\n1,Extraction,Blood,Other'
      const result = await validateDerivationsCsv(testDb, text, {
        derivationType: 'Extraction',
        specimenTypeName: 'Blood',
        containerType: '',
        protocol: 'Standard',
        derivationDate: '',
      })
      expect(result.rows.length).toBe(1)
      expect(result.rows[0].error).toMatch(/protocol.*conflicts with shared settings/)
    })
  })

  describe('importDerivationsFromCsv', () => {
    let testDb: Database
    let sqlite: Awaited<ReturnType<typeof setupTestDatabase>>['sqlite']

    beforeEach(async () => {
      const setup = await setupTestDatabase()
      testDb = setup.db
      sqlite = setup.sqlite
    })

    afterEach(() => {
      if (sqlite) cleanupTestDatabase(sqlite)
    })

    it('returns empty rows for empty CSV with dryRun', async () => {
      const result = await importDerivationsFromCsv(testDb, '', { dryRun: true })
      expect(result.rows).toHaveLength(0)
    })

    it('throws when settings conflict with derivation_type in CSV', async () => {
      const text = 'parent_container_id,derivation_type,specimen_type_name\n1,DNA Extraction,Blood'
      await expect(
        importDerivationsFromCsv(testDb, text, {
          dryRun: true,
          settings: {
            derivationType: 'RNA Extraction',
            specimenTypeName: 'Blood',
            containerType: '',
            protocol: '',
            derivationDate: '',
          },
        })
      ).rejects.toThrow(/derivation_type in CSV conflicts with shared settings/)
    })

    it('does not persist derivations when transaction mode import fails', async () => {
      const before = await testDb.select().from(containerDerivation)
      const text = 'parent_container_id,derivation_type,specimen_type_name,container_type,plate_name,position\n999999,Extraction,Blood,micronix_tube,PLATE-001,A01'

      const result = await importDerivationsFromCsv(testDb, text, { dryRun: false })

      expect(result.rows).toHaveLength(1)
      expect(result.rows[0].success).toBe(false)
      const after = await testDb.select().from(containerDerivation)
      expect(after.length).toBe(before.length)
    })

    it('uses default unit for child container when CSV has no unit_symbol column', async () => {
      const now = utcNow()
      const unit = await createTestUnit(testDb, { symbol: 'uL', name: 'microliter', category: 'volume' })
      await setContainerDefaults(testDb, {
        micronix_tube: { totalQuantity: 1, remainingQuantity: 1, defaultUnitSymbol: 'uL' },
      })
      await testDb.insert(containerTypeUnit).values({ containerType: 'micronix_tube', unitId: unit.id })

      const study = await createTestStudy(testDb, { title: 'Deriv Study', shortCode: 'DERIV' })
      const subject = await createTestStudySubject(testDb, { studyId: study.id, name: 'Subj1' })
      const bloodType = await createTestSpecimenType(testDb, { name: 'Blood' })
      const dnaType = await createTestSpecimenType(testDb, { name: 'DNA' })
      await testDb.insert(specimenTypeContainerType).values([
        { specimenTypeId: bloodType.id, containerType: 'micronix_tube', created: now },
        { specimenTypeId: dnaType.id, containerType: 'micronix_tube', created: now },
      ])

      const [parentSpecimen] = await testDb.insert(specimen).values({
        studySubjectId: subject.id,
        specimenTypeId: bloodType.id,
        collectionDate: '2025-01-01',
        created: now,
        lastUpdated: now,
      }).returning()
      const [parentSc] = await testDb.insert(storageContainer).values({
        specimenId: parentSpecimen.id,
        unitId: unit.id,
        totalQuantity: 1,
        remainingQuantity: 1,
        created: now,
        lastUpdated: now,
      }).returning()
      const storageType = await createTestStorageType(testDb, { name: 'Freezer' })
      const loc = await createTestLocation(testDb, { name: 'Loc', storageTypeId: String(storageType.id), canContainCollections: true })
      const plate = await createTestMicronixPlate(testDb, { name: 'PlateDef', locationId: loc.id })
      await testDb.insert(micronixTube).values({
        id: parentSc.id,
        collectionId: plate.id,
        position: 'A01',
        barcode: 'MT-PARENT',
      })

      const csv = 'parent_container_id,derivation_type,specimen_type_name,container_type,plate_name,position,container_barcode\n' +
        `${parentSc.id},Extraction,DNA,micronix_tube,PlateDef,A02,MT-CHILD`
      const result = await importDerivationsFromCsv(testDb, csv, {
        dryRun: false,
        settings: {
          derivationType: 'Extraction',
          specimenTypeName: 'DNA',
          containerType: 'micronix_tube',
          protocol: 'Standard',
          derivationDate: '2025-01-15',
          // unitSymbol deliberately omitted - backend should use default
        },
      })

      expect(result.rows).toHaveLength(1)
      if (!result.rows[0].success) {
        throw new Error(result.rows[0].error ?? 'Import row failed')
      }
      const childContainerId = result.rows[0].childContainerId
      expect(childContainerId).toBeDefined()
      const child = await testDb.select().from(storageContainer).where(eq(storageContainer.id, childContainerId!)).get()
      expect(child).toBeDefined()
      expect(child!.unitId).toBe(unit.id)
    })
  })

  describe('row values and positions', () => {
    let testDb: Database
    let sqlite: Awaited<ReturnType<typeof setupTestDatabase>>['sqlite']

    beforeEach(async () => {
      const setup = await setupTestDatabase()
      testDb = setup.db
      sqlite = setup.sqlite
    })

    afterEach(() => {
      if (sqlite) cleanupTestDatabase(sqlite)
    })

    const settings = {
      derivationType: 'Extraction',
      specimenTypeName: 'DNA',
      containerType: 'micronix_tube' as const,
      protocol: 'Standard',
      derivationDate: '2025-01-15',
    }
    const header = 'parent_container_id,plate_name,position,container_barcode'

    /** Parent tube at PlateDef/A01 holding 10 uL, plus a tube already at A02. */
    async function seedParent() {
      const now = utcNow()
      const unit = await createTestUnit(testDb, { symbol: 'uL', name: 'microliter', category: 'volume' })
      await setContainerDefaults(testDb, { micronix_tube: { totalQuantity: 1, remainingQuantity: 1, defaultUnitSymbol: 'uL' } })
      await testDb.insert(containerTypeUnit).values({ containerType: 'micronix_tube', unitId: unit.id })
      const study = await createTestStudy(testDb, { title: 'Deriv Study', shortCode: 'DERIV' })
      const subject = await createTestStudySubject(testDb, { studyId: study.id, name: 'Subj1' })
      const bloodType = await createTestSpecimenType(testDb, { name: 'Blood' })
      const dnaType = await createTestSpecimenType(testDb, { name: 'DNA' })
      await testDb.insert(specimenTypeContainerType).values([
        { specimenTypeId: bloodType.id, containerType: 'micronix_tube', created: now },
        { specimenTypeId: dnaType.id, containerType: 'micronix_tube', created: now },
      ])
      const [parentSpecimen] = await testDb
        .insert(specimen)
        .values({ studySubjectId: subject.id, specimenTypeId: bloodType.id, collectionDate: '2025-01-01', created: now, lastUpdated: now })
        .returning()
      const storageType = await createTestStorageType(testDb, { name: 'Freezer' })
      const loc = await createTestLocation(testDb, { name: 'Loc', storageTypeId: String(storageType.id), canContainCollections: true })
      const plate = await createTestMicronixPlate(testDb, { name: 'PlateDef', locationId: loc.id })
      const addTube = async (barcode: string, position: string, quantity: number) => {
        const [sc] = await testDb
          .insert(storageContainer)
          .values({ specimenId: parentSpecimen.id, unitId: unit.id, totalQuantity: quantity, remainingQuantity: quantity, created: now, lastUpdated: now })
          .returning()
        await createTestMicronixTube(testDb, { containerId: sc.id, collectionId: plate.id, position, barcode })
        return sc
      }
      const parent = await addTube('MT-PARENT', 'A01', 10)
      await addTube('MT-TAKEN', 'A02', 1)
      return { parent, loc, plate, unit, dnaType }
    }

    async function allowPaperForDna(dnaTypeId: number, unitId: number) {
      await setContainerDefaults(testDb, {
        micronix_tube: { totalQuantity: 1, remainingQuantity: 1, defaultUnitSymbol: 'uL' },
        paper: { totalQuantity: 1, remainingQuantity: 1, defaultUnitSymbol: 'uL' },
      })
      await testDb.insert(containerTypeUnit).values({ containerType: 'paper', unitId })
      await testDb.insert(specimenTypeContainerType).values({
        specimenTypeId: dnaTypeId,
        containerType: 'paper',
        created: utcNow(),
      })
    }

    it('checks non-padded positions against stored ones and against each other', async () => {
      const { parent } = await seedParent()
      const csv = [header, `${parent.id},PlateDef,A2,C1`, `${parent.id},PlateDef,A3,C2`, `${parent.id},PlateDef,A03,C3`].join('\n')

      const result = await validateDerivationsCsv(testDb, csv, settings)

      expect(result.rows.map((r) => r.valid)).toEqual([false, true, false])
      expect(result.rows[0].error).toMatch(/already used in that plate/)
      expect(result.rows[2].error).toMatch(/more than once in your file/)
    })

    it('rejects an out-of-range or garbage position in validation', async () => {
      const { parent } = await seedParent()
      const csv = [header, `${parent.id},PlateDef,b1,C1`, `${parent.id},PlateDef,Z99,C2`, `${parent.id},PlateDef,hello world,C3`].join('\n')

      const result = await validateDerivationsCsv(testDb, csv, settings)

      expect(result.rows.map((r) => r.valid)).toEqual([true, false, false])
      expect(result.rows[1].error).toBe('Position "Z99" is outside a micronix plate (A01–H12)')
      expect(result.rows[2].error).toContain('Position "hello world" is not a grid position')
    })

    it('imports a1 as A01 and refuses an out-of-range position', async () => {
      const { parent } = await seedParent()

      const bad = await importDerivationsFromCsv(testDb, [header, `${parent.id},PlateDef,I01,C1`].join('\n'), { settings })
      expect(bad.rows[0]?.success).toBe(false)
      expect(bad.rows[0]?.error).toContain('Position "I01" is outside a micronix plate')

      const good = await importDerivationsFromCsv(testDb, [header, `${parent.id},PlateDef,b1,C1`].join('\n'), { settings })
      expect(good.rows[0]?.success).toBe(true)
      const child = await testDb.select().from(micronixTube).where(eq(micronixTube.barcode, 'C1')).get()
      expect(child?.position).toBe('B01')
    })

    it('rejects a derivation_date that is not a date, in validation and on import', async () => {
      const { parent } = await seedParent()
      const perRow = { ...settings, derivationDate: '' }
      const csv = [`${header},derivation_date`, `${parent.id},PlateDef,B01,C1,not a date`, `${parent.id},PlateDef,B02,C2,2025-01-16`].join('\n')

      const result = await validateDerivationsCsv(testDb, csv, perRow)
      expect(result.rows.map((r) => r.valid)).toEqual([false, true])
      expect(result.rows[0].error).toBe("derivation_date 'not a date' is not a date (use YYYY-MM-DD)")

      const imported = await importDerivationsFromCsv(testDb, csv, { settings: perRow })
      expect(imported.rows[0]?.success).toBe(false)
      expect(imported.rows[0]?.error).toContain("derivation_date 'not a date' is not a date")
      expect(await testDb.select().from(containerDerivation)).toHaveLength(0)
    })

    it('refuses a shared derivation date that is not a date and saves nothing', async () => {
      const { parent } = await seedParent()
      const csv = [header, `${parent.id},PlateDef,B01,C1`].join('\n')

      const imported = await importDerivationsFromCsv(testDb, csv, { settings: { ...settings, derivationDate: '2025-02-30' } })

      expect(imported.rows[0]?.success).toBe(false)
      expect(imported.rows[0]?.error).toContain("'2025-02-30' is not a date")
      expect(await testDb.select().from(containerDerivation)).toHaveLength(0)
    })

    /** A cryovial tube with `barcode`, on the parent's Specimen. */
    async function addCryovial(seed: Awaited<ReturnType<typeof seedParent>>, barcode: string) {
      const cryoBox = await createTestCryovialBox(testDb, { name: 'BoxDef', locationId: seed.loc.id })
      const [sc] = await testDb
        .insert(storageContainer)
        .values({ specimenId: seed.parent.specimenId, unitId: seed.unit.id, totalQuantity: 5, remainingQuantity: 5 })
        .returning()
      await createTestCryovialTube(testDb, { containerId: sc.id, collectionId: cryoBox.id, barcode, position: 'A01' })
      return sc
    }

    it('rejects a row whose parent barcode is on several Containers instead of drawing from one', async () => {
      const seed = await seedParent()
      const cryovial = await addCryovial(seed, 'MT-PARENT')
      const csv = ['parent_container_barcode,plate_name,position,container_barcode', 'MT-PARENT,PlateDef,B01,C1'].join('\n')

      const result = await validateDerivationsCsv(testDb, csv, settings)

      expect(result.rows[0].valid).toBe(false)
      expect(result.rows[0].error).toBe(
        `Ambiguous barcode 'MT-PARENT': it matches 2 containers (container ${seed.parent.id} (micronix_tube in PlateDef A01), ` +
          `container ${cryovial.id} (cryovial_tube in BoxDef A01)). Identify the container by its id or position instead.`,
      )
    })

    it('rejects a child barcode another tube type already has, ignoring case', async () => {
      const seed = await seedParent()
      await addCryovial(seed, 'cv-777')
      const csv = [header, `${seed.parent.id},PlateDef,B01,CV-777`].join('\n')

      const result = await validateDerivationsCsv(testDb, csv, settings)

      expect(result.rows[0].valid).toBe(false)
      expect(result.rows[0].error).toMatch(/already used for another container/)
    })

    it('warns about a mismatched source type even when the first row has no parent', async () => {
      const { parent, plate, unit } = await seedParent()
      const plasmaType = await createTestSpecimenType(testDb, { name: 'Plasma' })
      const plasma = await createTestSpecimen(testDb, plasmaType.id)
      const plasmaTube = await createTestStorageContainer(testDb, { specimenId: plasma.id, unitId: unit.id })
      await createTestMicronixTube(testDb, { containerId: plasmaTube.id, collectionId: plate.id, barcode: 'MT-PLASMA', position: 'H12' })
      const csv = [header, '99999,PlateDef,B01,C0', `${parent.id},PlateDef,B02,C1`, `${plasmaTube.id},PlateDef,B03,C2`].join('\n')

      const result = await validateDerivationsCsv(testDb, csv, { ...settings, validateSourceSpecimenType: true })

      expect(result.rows[0].valid).toBe(false)
      expect(result.rows[1].warnings).toBeUndefined()
      expect(result.rows[2].warnings).toContain('Source specimen type does not match other rows')
    })

    it('reports a quantity that is not a number instead of dropping it', async () => {
      const { parent } = await seedParent()
      const csv = [`${header},quantity_used`, `${parent.id},PlateDef,B01,C1,3x`].join('\n')

      const result = await validateDerivationsCsv(testDb, csv, settings)

      expect(result.rows[0].valid).toBe(false)
      expect(result.rows[0].error).toBe("quantity_used '3x' is not a number")
    })

    it('rejects Infinity as a quantity when validating', async () => {
      const { parent } = await seedParent()
      const csv = [
        `${header},quantity,quantity_used`,
        `${parent.id},PlateDef,B01,C1,Infinity,1`,
        `${parent.id},PlateDef,B02,C2,1,-Infinity`,
      ].join('\n')

      const result = await validateDerivationsCsv(testDb, csv, settings)

      expect(result.rows.map((row) => row.error)).toEqual([
        "quantity 'Infinity' is not a number",
        "quantity_used '-Infinity' is not a number",
      ])
    })

    it('rejects Infinity as a quantity when importing, and creates nothing', async () => {
      const { parent } = await seedParent()
      const csv = [`${header},quantity`, `${parent.id},PlateDef,B01,C1,Infinity`].join('\n')

      const result = await importDerivationsFromCsv(testDb, csv, { settings })

      expect(result.rows[0].success).toBe(false)
      expect(result.rows[0].error).toContain("quantity 'Infinity' is not a number")
      expect(await testDb.select().from(containerDerivation)).toHaveLength(0)
    })

    it('reports a bad quantity in a dry run, as the import does', async () => {
      const { parent } = await seedParent()
      const csv = [`${header},quantity_used`, `${parent.id},PlateDef,B01,C1,3x`, `${parent.id},PlateDef,B02,C2,3`].join('\n')

      const result = await importDerivationsFromCsv(testDb, csv, { dryRun: true, settings })

      expect(result.rows[0]).toMatchObject({ success: false, error: "quantity_used '3x' is not a number" })
      expect(result.rows[1].success).toBe(true)
    })

    it('reports a paper row whose box or bag does not exist in a dry run', async () => {
      const { parent, loc, unit, dnaType } = await seedParent()
      await allowPaperForDna(dnaType.id, unit.id)
      await createTestBag(testDb, { name: 'Bag-1', locationId: loc.id })
      const csv = [
        'parent_container_id,container_type,box_name,bag_name,sheet_name,sublabel',
        `${parent.id},paper,No Such Box,,Sheet-1,S1`,
        `${parent.id},paper,,No Such Bag,Sheet-1,S2`,
        `${parent.id},paper,,Bag-1,Sheet-1,S3`,
      ].join('\n')

      const result = await importDerivationsFromCsv(testDb, csv, { dryRun: true, settings: { ...settings, containerType: '' } })

      expect(result.rows[0]).toMatchObject({
        success: false,
        error: "Box 'No Such Box' not found. Create it before importing paper derivations.",
      })
      expect(result.rows[1]).toMatchObject({
        success: false,
        error: "Bag 'No Such Bag' not found. Create it before importing paper derivations.",
      })
      expect(result.rows[2]).toMatchObject({ success: true, collectionStatus: 'existing' })
    })

    it('uses the shared reduce-parent setting when the cell is blank', async () => {
      const { parent } = await seedParent()
      const csv = [`${header},quantity_used,reduce_parent_quantity`, `${parent.id},PlateDef,B01,C1,3,`].join('\n')

      const result = await importDerivationsFromCsv(testDb, csv, {
        settings: { ...settings, reduceParentQuantity: false },
      })

      expect(result.rows[0].success).toBe(true)
      const after = await testDb.select().from(storageContainer).where(eq(storageContainer.id, parent.id)).get()
      expect(after?.remainingQuantity).toBe(10)
    })

    it('rejects a quantity used of 0 or less, with the row', async () => {
      const { parent } = await seedParent()
      const csv = [`${header},quantity_used`, `${parent.id},PlateDef,B01,C1,0`, `${parent.id},PlateDef,B02,C2,-100`].join('\n')

      const validation = await validateDerivationsCsv(testDb, csv, settings)

      expect(validation.rows.map((r) => r.error)).toEqual([
        'Quantity used must be greater than 0 (got 0).',
        'Quantity used must be greater than 0 (got -100).',
      ])

      const result = await importDerivationsFromCsv(testDb, csv, { settings })

      expect(result.rows.find((r) => !r.success && r.index === 0)?.error).toBe(
        'Row 1: Quantity used must be greater than 0 (got 0). No derivations were created; please fix the error and try again.',
      )
      const after = await testDb.select().from(storageContainer).where(eq(storageContainer.id, parent.id)).get()
      expect(after?.remainingQuantity).toBe(10)
    })

    it('rejects a shared quantity used of 0 or less', async () => {
      const { parent } = await seedParent()
      const csv = [header, `${parent.id},PlateDef,B01,C1`].join('\n')

      const result = await validateDerivationsCsv(testDb, csv, { ...settings, quantityUsed: -1 })

      expect(result.rows[0].error).toBe('Quantity used must be greater than 0 (got -1).')
    })

    it('rejects a negative Child container quantity', async () => {
      const { parent } = await seedParent()
      const csv = [`${header},quantity`, `${parent.id},PlateDef,B01,C1,-2`].join('\n')

      const result = await validateDerivationsCsv(testDb, csv, settings)

      expect(result.rows[0].error).toBe('Child container: Total quantity must be 0 or more (got -2).')
    })

    it('rejects rows that together draw more than the Parent container holds', async () => {
      const { parent } = await seedParent()
      const csv = [
        `${header},quantity_used`,
        `${parent.id},PlateDef,B01,C1,6`,
        `${parent.id},PlateDef,B02,C2,4`,
        `${parent.id},PlateDef,B03,C3,1`,
      ].join('\n')

      const validation = await validateDerivationsCsv(testDb, csv, settings)

      expect(validation.rows.map((r) => r.valid)).toEqual([true, true, false])
      expect(validation.rows[2].error).toBe(
        "Quantity used (1) exceeds the Parent container's remaining quantity (0). Earlier rows in this file draw from the same Parent container.",
      )

      const result = await importDerivationsFromCsv(testDb, csv, { settings })

      expect(result.rows.find((r) => r.index === 2)?.error).toBe(
        "Row 3: Quantity used (1) exceeds the Parent container's remaining quantity (0). No derivations were created; please fix the error and try again.",
      )
      const after = await testDb.select().from(storageContainer).where(eq(storageContainer.id, parent.id)).get()
      expect(after?.remainingQuantity).toBe(10)
    })

    it('rejects a single row drawing more than the Parent container holds', async () => {
      const { parent } = await seedParent()
      const csv = [`${header},quantity_used`, `${parent.id},PlateDef,B01,C1,11`].join('\n')

      const result = await validateDerivationsCsv(testDb, csv, settings)

      expect(result.rows[0].error).toBe("Quantity used (11) exceeds the Parent container's remaining quantity (10).")
    })

    it('rejects paper rows whose box does not exist', async () => {
      const { parent } = await seedParent()
      const csv = ['parent_container_id,container_type,box_name,sheet_name,sublabel', `${parent.id},paper,No Such Box,Sheet-1,S1`].join('\n')

      const result = await validateDerivationsCsv(testDb, csv, { ...settings, containerType: '' })

      expect(result.rows[0].valid).toBe(false)
      expect(result.rows[0].error).toMatch(/Box 'No Such Box' not found/)
    })

    it('finds the bag named by bag_name for paper rows', async () => {
      const { parent, loc, unit, dnaType } = await seedParent()
      await allowPaperForDna(dnaType.id, unit.id)
      await createTestBag(testDb, { name: 'Shared Name', locationId: loc.id })
      const csv = ['parent_container_id,container_type,bag_name,sheet_name,sublabel', `${parent.id},paper,Shared Name,Sheet-1,S1`].join('\n')

      const result = await validateDerivationsCsv(testDb, csv, { ...settings, containerType: '' })

      expect(result.rows[0]).toMatchObject({ valid: true, collectionStatus: 'existing' })
    })

    it('reports a paper row with neither box_name nor bag_name as a missing field', async () => {
      const { parent } = await seedParent()
      const csv = ['parent_container_id,container_type,box_name,sheet_name,sublabel', `${parent.id},paper,,Sheet-1,S1`].join('\n')

      const result = await validateDerivationsCsv(testDb, csv, { ...settings, containerType: '' })

      expect(result.rows[0].error).toBe('box_name or bag_name is required for paper')
    })

    describe('dry-run and validate agree with real import', () => {
      it.each([
        {
          name: 'a plate that does not exist and has no Location',
          csv: (parentId: number) => [header, `${parentId},NoSuchPlate,B01,C-NEW-1`].join('\n'),
          overrideSettings: undefined,
          expectedPattern: /not found|location/i,
        },
        {
          name: 'an occupied position',
          csv: (parentId: number) => [header, `${parentId},PlateDef,A02,C-NEW-2`].join('\n'),
          overrideSettings: undefined,
          expectedPattern: /A02.*already used/i,
        },
        {
          name: 'a tube barcode in use',
          csv: (parentId: number) => [header, `${parentId},PlateDef,B01,MT-TAKEN`].join('\n'),
          overrideSettings: undefined,
          expectedPattern: /MT-TAKEN.*already exists/i,
        },
        {
          name: 'a blank position',
          csv: (parentId: number) => [header, `${parentId},PlateDef,,C-NEW-4`].join('\n'),
          overrideSettings: undefined,
          expectedPattern: /position.*required/i,
        },
        {
          name: 'an unknown specimen type',
          csv: (parentId: number) => [`${header},specimen_type_name`, `${parentId},PlateDef,B01,C-NEW-5,NoSuchType`].join('\n'),
          overrideSettings: { specimenTypeName: '' },
          expectedPattern: /Specimen type 'NoSuchType' not found/i,
        },
        {
          name: 'an unknown unit',
          csv: (parentId: number) => [`${header},unit_symbol`, `${parentId},PlateDef,B01,C-NEW-6,NO_UNIT`].join('\n'),
          overrideSettings: undefined,
          expectedPattern: /Unit with symbol 'NO_UNIT' not found/i,
        },
        {
          name: 'a blank container type',
          csv: (parentId: number) => [`${header},container_type`, `${parentId},PlateDef,B01,C-NEW-7,`].join('\n'),
          overrideSettings: { containerType: '' as const },
          expectedPattern: /container_type is required/i,
        },
      ])('rejects $name in both dryRun: true and dryRun: false', async ({ csv, overrideSettings, expectedPattern }) => {
        const { parent } = await seedParent()
        const runSettings = overrideSettings ? { ...settings, ...overrideSettings } : settings
        const csvText = csv(parent.id)

        const dryResult = await importDerivationsFromCsv(testDb, csvText, { dryRun: true, settings: runSettings })
        expect(dryResult.rows).toHaveLength(1)
        expect(dryResult.rows[0].success).toBe(false)
        expect(dryResult.rows[0].error).toMatch(expectedPattern)

        const realResult = await importDerivationsFromCsv(testDb, csvText, { dryRun: false, settings: runSettings })
        expect(realResult.rows).toHaveLength(1)
        expect(realResult.rows[0].success).toBe(false)
        expect(realResult.rows[0].error).toMatch(expectedPattern)

        expect(await testDb.select().from(containerDerivation)).toHaveLength(0)
      })

      it('rolls back all writes on a succeeding dryRun: true while preserving collectionStatus', async () => {
        const { parent, loc } = await seedParent()
        const csv = [
          `${header},quantity_used,collection_location_id`,
          `${parent.id},DRY-NEW-PLATE,A01,C-DRY-1,3,${loc.id}`,
          `${parent.id},DRY-NEW-PLATE,A02,C-DRY-2,2,${loc.id}`,
        ].join('\n')

        const dryResult = await importDerivationsFromCsv(testDb, csv, { dryRun: true, settings })
        expect(dryResult.rows).toEqual([
          expect.objectContaining({ index: 0, success: true, collectionStatus: 'will_be_created' }),
          expect.objectContaining({ index: 1, success: true, collectionStatus: 'will_be_created' }),
        ])
        expect(await testDb.select().from(containerDerivation)).toHaveLength(0)
        expect(await testDb.select().from(micronixPlate).where(eq(micronixPlate.name, 'DRY-NEW-PLATE'))).toHaveLength(0)
        const parentAfterDry = await testDb.select().from(storageContainer).where(eq(storageContainer.id, parent.id)).get()
        expect(parentAfterDry?.remainingQuantity).toBe(10)
      })

      it('rejects unknown specimen type, unknown unit, and blank container_type in validateDerivationsCsv too', async () => {
        const { parent } = await seedParent()

        const badType = await validateDerivationsCsv(
          testDb,
          [`${header},specimen_type_name`, `${parent.id},PlateDef,B01,C-V1,NoSuchType`].join('\n'),
          { ...settings, specimenTypeName: '' },
        )
        expect(badType.rows[0].valid).toBe(false)
        expect(badType.rows[0].error).toMatch(/Specimen type 'NoSuchType' not found/)

        const badUnit = await validateDerivationsCsv(
          testDb,
          [`${header},unit_symbol`, `${parent.id},PlateDef,B01,C-V2,NO_UNIT`].join('\n'),
          settings,
        )
        expect(badUnit.rows[0].valid).toBe(false)
        expect(badUnit.rows[0].error).toMatch(/Unit with symbol 'NO_UNIT' not found/)

        const blankType = await validateDerivationsCsv(
          testDb,
          [`${header},container_type`, `${parent.id},PlateDef,B01,C-V3,`].join('\n'),
          { ...settings, containerType: '' },
        )
        expect(blankType.rows[0].valid).toBe(false)
        expect(blankType.rows[0].error).toMatch(/container_type is required/)

        // A missing plate with no location_id is still reported as will_be_created for the Collections step,
        // without persisting anything to the database.
        const missingPlate = await validateDerivationsCsv(
          testDb,
          [header, `${parent.id},WizardNewPlate,A01,C-V4`].join('\n'),
          settings,
        )
        expect(missingPlate.rows[0]).toMatchObject({ valid: true, collectionStatus: 'will_be_created' })
        expect(missingPlate.collections).toEqual([
          expect.objectContaining({ name: 'WizardNewPlate', status: 'will_be_created', containerType: 'micronix_tube' }),
        ])
        expect(await testDb.select().from(containerDerivation)).toHaveLength(0)
        expect(await testDb.select().from(micronixPlate).where(eq(micronixPlate.name, 'WizardNewPlate'))).toHaveLength(0)
      })
    })
  })

  describe('Collections named by barcode across imports', () => {
    let testDb: Database
    let sqlite: Awaited<ReturnType<typeof setupTestDatabase>>['sqlite']

    beforeEach(async () => {
      const setup = await setupTestDatabase()
      testDb = setup.db
      sqlite = setup.sqlite
    })

    afterEach(() => {
      if (sqlite) cleanupTestDatabase(sqlite)
    })

    const settings = {
      derivationType: 'Extraction',
      specimenTypeName: 'DNA',
      containerType: 'micronix_tube' as const,
      protocol: 'Standard',
      derivationDate: '2025-01-15',
    }

    /** A parent tube to derive from, and a study and location bulk import can register into. */
    async function seed() {
      const now = utcNow()
      const unit = await createTestUnit(testDb, { symbol: 'uL', name: 'microliter', category: 'volume' })
      await setContainerDefaults(testDb, { micronix_tube: { totalQuantity: 1, remainingQuantity: 1, defaultUnitSymbol: 'uL' } })
      await testDb.insert(containerTypeUnit).values({ containerType: 'micronix_tube', unitId: unit.id })
      const study = await createTestStudy(testDb, { title: 'Deriv Study', shortCode: 'DERIV' })
      const subject = await createTestStudySubject(testDb, { studyId: study.id, name: 'Subj1' })
      const dnaType = await createTestSpecimenType(testDb, { name: 'DNA' })
      await testDb.insert(specimenTypeContainerType).values({ specimenTypeId: dnaType.id, containerType: 'micronix_tube', created: now })
      const [parentSpecimen] = await testDb
        .insert(specimen)
        .values({ studySubjectId: subject.id, specimenTypeId: dnaType.id, collectionDate: '2025-01-01', created: now, lastUpdated: now })
        .returning()
      const storageType = await createTestStorageType(testDb, { name: 'Freezer' })
      const loc = await createTestLocation(testDb, { name: 'Loc', storageTypeId: String(storageType.id), canContainCollections: true })
      const parentPlate = await createTestMicronixPlate(testDb, { name: 'ParentPlate', locationId: loc.id })
      const [parent] = await testDb
        .insert(storageContainer)
        .values({ specimenId: parentSpecimen.id, unitId: unit.id, totalQuantity: 10, remainingQuantity: 10, created: now, lastUpdated: now })
        .returning()
      await createTestMicronixTube(testDb, { containerId: parent.id, collectionId: parentPlate.id, position: 'A01', barcode: 'MT-PARENT' })
      return { parent, locationId: loc.id }
    }

    /** Register one DNA tube on a plate through bulk import. */
    async function bulkImportTube(barcode: string, collection: { name?: string; barcode?: string; locationId: number; position: string }) {
      return runBulkCombinedImport(
        testDb,
        {
          studyShortCode: 'DERIV',
          atomicMode: 'full_file',
          subjects: [
            {
              subjectName: 'Subj1',
              specimens: [
                {
                  specimenTypeName: 'DNA',
                  collectionDate: '2025-02-01',
                  container: { containerType: 'micronix_tube', barcode, collection: { type: 'micronix_plate', ...collection } },
                },
              ],
            },
          ],
        },
        undefined,
      )
    }

    const platesCalled = (identifier: string) =>
      testDb
        .select({ id: micronixPlate.id, name: micronixPlate.name, barcode: micronixPlate.barcode })
        .from(micronixPlate)
        .where(or(eq(micronixPlate.name, identifier), eq(micronixPlate.barcode, identifier)))
        .all()

    it('finds the plate bulk import created from a barcode alone, by its name or its barcode', async () => {
      const { parent, locationId } = await seed()
      await bulkImportTube('MT-BULK', { barcode: 'PB-1', locationId, position: 'A01' })
      expect(platesCalled('PB-1')).toEqual([expect.objectContaining({ name: 'PB-1', barcode: 'PB-1' })])

      const byName = await validateDerivationsCsv(testDb, ['parent_container_id,plate_name,position,container_barcode', `${parent.id},PB-1,B01,C1`].join('\n'), settings)
      const byBarcode = await validateDerivationsCsv(testDb, ['parent_container_id,collection_barcode,position,container_barcode', `${parent.id},PB-1,B01,C1`].join('\n'), settings)

      expect(byName.collections).toEqual([expect.objectContaining({ name: 'PB-1', status: 'existing' })])
      expect(byBarcode.collections).toEqual([expect.objectContaining({ barcode: 'PB-1', status: 'existing' })])
    })

    it('lets bulk import find the plate the Derivations import creates from a barcode alone', async () => {
      const { parent, locationId } = await seed()
      const barcodeOnlyCsv = ['parent_container_id,collection_barcode,position,container_barcode', `${parent.id},PB-2,A01,C1`].join('\n')
      const validation = await validateDerivationsCsv(testDb, barcodeOnlyCsv, settings)
      const [missing] = validation.collections
      expect(missing).toMatchObject({ barcode: 'PB-2', status: 'will_be_created' })
      // The Derivations import wizard creates each missing Collection under this name.
      await createTestMicronixPlate(testDb, { name: newCollectionName(missing)!, barcode: missing.barcode, locationId })
      const derived = await importDerivationsFromCsv(testDb, barcodeOnlyCsv, { settings })
      expect(derived.rows).toEqual([expect.objectContaining({ success: true })])

      const byName = await bulkImportTube('MT-BULK-1', { name: 'PB-2', locationId, position: 'A02' })
      const byBarcode = await bulkImportTube('MT-BULK-2', { barcode: 'PB-2', locationId, position: 'A03' })

      expect(byName.errors ?? []).toEqual([])
      expect(byBarcode.errors ?? []).toEqual([])
      expect(platesCalled('PB-2')).toEqual([expect.objectContaining({ name: 'PB-2', barcode: 'PB-2' })])
      const tubes = await testDb.select({ position: micronixTube.position }).from(micronixTube).where(eq(micronixTube.collectionId, platesCalled('PB-2')[0].id)).all()
      expect(tubes.map((t) => t.position).sort()).toEqual(['A01', 'A02', 'A03'])
    })

    it('creates a missing plate atomically when rows carry collection_location_id, and rolls it back if a later row fails', async () => {
      const { parent, locationId } = await seed()
      const failingCsv = [
        'parent_container_id,plate_name,position,container_barcode,collection_location_id',
        `${parent.id},ATOMIC-P1,A01,C-ATOM-1,${locationId}`,
        `${parent.id},ATOMIC-P1,A01,C-ATOM-2,${locationId}`,
      ].join('\n')

      const failed = await importDerivationsFromCsv(testDb, failingCsv, { settings })
      expect(failed.rows.every((r) => !r.success)).toBe(true)
      expect(platesCalled('ATOMIC-P1')).toHaveLength(0)

      const goodCsv = [
        'parent_container_id,collection_barcode,position,container_barcode,collection_location_id',
        `${parent.id},ATOMIC-BC,A01,C-ATOM-1,${locationId}`,
        `${parent.id},ATOMIC-BC,A02,C-ATOM-2,${locationId}`,
      ].join('\n')

      const imported = await importDerivationsFromCsv(testDb, goodCsv, { settings })
      expect(imported.rows).toEqual([
        expect.objectContaining({ index: 0, success: true }),
        expect.objectContaining({ index: 1, success: true }),
      ])
      expect(platesCalled('ATOMIC-BC')).toEqual([
        expect.objectContaining({ name: 'ATOMIC-BC', barcode: 'ATOMIC-BC' }),
      ])
    })
  })

  describe('unexpected internal errors', () => {
    let testDb: Database
    let sqlite: Awaited<ReturnType<typeof setupTestDatabase>>['sqlite']

    beforeEach(async () => {
      const setup = await setupTestDatabase()
      testDb = setup.db
      sqlite = setup.sqlite
    })

    afterEach(() => {
      if (sqlite) cleanupTestDatabase(sqlite)
    })

    it('rethrows unexpected database errors instead of turning them into per-row messages', async () => {
      const csv = 'parent_container_id,derivation_type,specimen_type_name,container_type,plate_name,position,container_barcode\n1,Extraction,Blood,micronix_tube,P1,A01,BC1'
      sqlite.exec('DROP TABLE storage_container')

      await expect(validateDerivationsCsv(testDb, csv)).rejects.toThrow(/storage_container/)
      await expect(importDerivationsFromCsv(testDb, csv)).rejects.toThrow(/storage_container/)
      await expect(importDerivationsFromCsv(testDb, csv, { dryRun: true })).rejects.toThrow(/storage_container/)
    })
  })
})
