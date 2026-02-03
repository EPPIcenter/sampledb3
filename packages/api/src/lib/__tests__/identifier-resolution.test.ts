import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { setupTestDatabase, cleanupTestDatabase } from '../../__tests__/helpers/db-setup'
import {
  resolveStudyByShortCode,
  resolveSubjectByNameAndStudy,
  resolveSpecimenTypeByName,
  resolveContainerByBarcode,
  resolveStudiesByShortCodes,
  resolveSpecimenTypesByNames,
} from '../identifier-resolution'
import { createTestStudy, createTestStudySubject, createTestSpecimenType } from '../../__tests__/helpers/factories'
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
  })

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
})
