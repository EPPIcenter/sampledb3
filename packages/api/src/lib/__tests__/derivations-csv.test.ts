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
} from '../../db/schema'
import { eq } from 'drizzle-orm'
import {
  createTestStudy,
  createTestStudySubject,
  createTestSpecimenType,
  createTestUnit,
  createTestStorageType,
  createTestLocation,
  createTestMicronixPlate,
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
})
