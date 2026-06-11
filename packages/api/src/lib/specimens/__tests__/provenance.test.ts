import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import type { Database } from '../../../db/client'
import type { Database as SQLiteDatabase } from 'bun:sqlite'
import { setupTestDatabase, cleanupTestDatabase } from '../../../__tests__/helpers/db-setup'
import {
  createTestSpecimen,
  createTestSpecimenType,
  createTestStudy,
  createTestStudySubject,
  createTestStrain,
  createTestControlDefinition,
  createTestControlBatch,
} from '../../../__tests__/helpers/factories'
import { resolveSpecimenSource, resolveSpecimenSources } from '../provenance'

describe('specimen provenance', () => {
  let testDb: Database
  let sqlite: SQLiteDatabase

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

  describe('resolveSpecimenSource', () => {
    it('resolves a subject source with the full study chain', async () => {
      const study = await createTestStudy(testDb, {
        title: 'Malaria Cohort',
        shortCode: 'MAL01',
        leadPerson: 'Dr. Grant',
      })
      const subject = await createTestStudySubject(testDb, { studyId: study.id, name: 'P-001' })
      const specimenType = await createTestSpecimenType(testDb, { name: 'Whole Blood' })
      const spec = await createTestSpecimen(testDb, specimenType.id, { studySubjectId: subject.id })

      const source = await resolveSpecimenSource(testDb, spec.id)

      expect(source).toEqual({
        type: 'subject',
        id: subject.id,
        name: 'P-001',
        study: {
          id: study.id,
          title: 'Malaria Cohort',
          code: 'MAL01',
          leadPerson: 'Dr. Grant',
        },
      })
    })

    it('resolves a control source with definition, density, unit, and strain composition', async () => {
      const strain = await createTestStrain(testDb, { name: '3D7' })
      const definition = await createTestControlDefinition(testDb, {
        name: 'Blood mix 3D7',
        controlType: 'blood',
        properties: {
          strains: [{ id: strain.id, name: '3D7', percentage: 100 }],
          targetDensity: 10000,
          targetDensityUnitSymbol: 'p/uL',
        },
      })
      const batch = await createTestControlBatch(testDb, definition.id, {
        name: 'Batch-June',
        productionDate: '2026-06-01',
      })
      const specimenType = await createTestSpecimenType(testDb, { name: 'Control Blood' })
      const spec = await createTestSpecimen(testDb, specimenType.id, { controlBatchId: batch.id })

      const source = await resolveSpecimenSource(testDb, spec.id)

      expect(source).toMatchObject({
        type: 'control',
        id: batch.id,
        name: 'Batch-June',
        productionDate: '2026-06-01',
        controlType: 'blood',
        definitionName: 'Blood mix 3D7',
        definition: { id: definition.id, name: 'Blood mix 3D7' },
        targetDensity: 10000,
        targetDensityUnit: 'p/uL',
      })
      expect((source as { strainComposition: string }).strainComposition).toContain('3D7')
      expect((source as { strainComposition: string }).strainComposition).toContain('100%')
    })

    it('returns null for a nonexistent specimen', async () => {
      expect(await resolveSpecimenSource(testDb, 999999)).toBeNull()
    })
  })

  describe('resolveSpecimenSources (batch)', () => {
    it('resolves mixed subject and control specimens in one map', async () => {
      const study = await createTestStudy(testDb, { title: 'S', shortCode: 'SS01' })
      const subject = await createTestStudySubject(testDb, { studyId: study.id, name: 'Subj' })
      const definition = await createTestControlDefinition(testDb, { name: 'Def', controlType: 'plasma_positive' })
      const batch = await createTestControlBatch(testDb, definition.id, { name: 'CtrlBatch' })
      const specimenType = await createTestSpecimenType(testDb, { name: 'Serum' })
      const subjectSpec = await createTestSpecimen(testDb, specimenType.id, { studySubjectId: subject.id })
      const controlSpec = await createTestSpecimen(testDb, specimenType.id, { controlBatchId: batch.id })

      const map = await resolveSpecimenSources(testDb, [subjectSpec.id, controlSpec.id, 424242])

      expect(map.get(subjectSpec.id)).toMatchObject({ type: 'subject', name: 'Subj' })
      expect(map.get(controlSpec.id)).toMatchObject({ type: 'control', name: 'CtrlBatch', controlType: 'plasma_positive' })
      expect(map.get(424242) ?? null).toBeNull()
    })

    it('returns an empty map for an empty input', async () => {
      const map = await resolveSpecimenSources(testDb, [])
      expect(map.size).toBe(0)
    })
  })
})
