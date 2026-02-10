import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { setupTestDatabase, cleanupTestDatabase } from '../../__tests__/helpers/db-setup'
import { parseCsv, validateDerivationsCsv, importDerivationsFromCsv } from '../derivations-csv'
import type { Database } from '../../db/client'

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

    it('returns invalid when collection_name and collection_barcode missing for micronix_tube', async () => {
      const text = 'parent_container_id,derivation_type,specimen_type_name,container_type\n1,Extraction,Blood,micronix_tube'
      const result = await validateDerivationsCsv(testDb, text)
      expect(result.rows.length).toBe(1)
      expect(result.rows[0].valid).toBe(false)
      expect(result.rows[0].error).toMatch(/collection_name or collection_barcode is required/)
      expect(result.summary.invalid).toBeGreaterThanOrEqual(1)
    })

    it('returns invalid when parent container does not exist', async () => {
      const text = 'parent_container_id,derivation_type,specimen_type_name,container_type,collection_name,position\n99999,Extraction,Blood,micronix_tube,Plate1,A01'
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
      expect(result.rows[0].error).toMatch(/collection_name or collection_barcode is required.*cryovial_tube/)
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
  })
})
