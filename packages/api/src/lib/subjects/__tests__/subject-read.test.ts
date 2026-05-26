import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import type { Database } from '../../../db/client'
import type { Database as SQLiteDatabase } from 'bun:sqlite'
import { setupTestDatabase, cleanupTestDatabase } from '../../../__tests__/helpers/db-setup'
import {
  createTestSpecimen,
  createTestSpecimenType,
  createTestStorageContainer,
  createTestStudy,
  createTestStudySubject,
  createTestUnit,
} from '../../../__tests__/helpers/factories'
import { NotFoundError } from '../../error-handler'
import { utcNow } from '../../datetime'
import {
  getSubjectQpcrResults,
  getSubjectSummary,
  getSubjectWithStudy,
} from '../subject-read'
import {
  qpcrExperiment,
  qpcrExperimentWell,
  qpcrRun,
  qpcrWellResult,
  specimen,
  storageContainer,
} from '../../../db/schema'

function ensureQpcrRunTables(sqlite: SQLiteDatabase) {
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS qpcr_run (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      qpcr_experiment_id INTEGER NOT NULL REFERENCES qpcr_experiment(id) ON DELETE CASCADE,
      instrument_type TEXT NOT NULL,
      run_started_at TEXT,
      run_ended_at TEXT,
      experiment_name TEXT,
      file_name TEXT,
      created TEXT NOT NULL DEFAULT (datetime('now')),
      slope REAL,
      y_intercept REAL,
      r_squared REAL,
      efficiency REAL
    )
  `)
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS qpcr_well_result (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      qpcr_run_id INTEGER NOT NULL REFERENCES qpcr_run(id) ON DELETE CASCADE,
      well_position TEXT NOT NULL,
      target_name TEXT,
      sample_barcode TEXT,
      task TEXT,
      cq REAL,
      quantity REAL,
      standard_quantity REAL,
      amp_status TEXT,
      UNIQUE (qpcr_run_id, well_position, target_name)
    )
  `)
}

describe('subject-read', () => {
  let testDb: Database
  let sqlite: SQLiteDatabase

  beforeEach(async () => {
    const setup = await setupTestDatabase()
    testDb = setup.db
    sqlite = setup.sqlite
    ensureQpcrRunTables(sqlite)
  })

  afterEach(() => {
    if (sqlite) {
      cleanupTestDatabase(sqlite)
    }
  })

  describe('getSubjectWithStudy', () => {
    it('returns subject with study join', async () => {
      const study = await createTestStudy(testDb, { title: 'Read Study', shortCode: 'READ1' })
      const subject = await createTestStudySubject(testDb, { studyId: study.id, name: 'Subj A' })

      const result = await getSubjectWithStudy(testDb, subject.id)
      expect(result.name).toBe('Subj A')
      expect(result.study).toMatchObject({
        id: study.id,
        title: 'Read Study',
        shortCode: 'READ1',
      })
    })

    it('throws NotFoundError for missing subject', async () => {
      await expect(getSubjectWithStudy(testDb, 99999)).rejects.toThrow(NotFoundError)
    })
  })

  describe('getSubjectSummary', () => {
    it('returns empty summary when subject has no specimens', async () => {
      const study = await createTestStudy(testDb, { title: 'Empty Study', shortCode: 'EMP1' })
      const subject = await createTestStudySubject(testDb, { studyId: study.id, name: 'Empty Subj' })

      const result = await getSubjectSummary(testDb, subject.id)
      expect(result.subject.id).toBe(subject.id)
      expect(result.specimens).toEqual([])
      expect(result.summary.totalSpecimens).toBe(0)
      expect(result.summary.totalContainers).toBe(0)
    })

    it('returns enriched specimens with container comments', async () => {
      const study = await createTestStudy(testDb, { title: 'Summary Study', shortCode: 'SUM1' })
      const subject = await createTestStudySubject(testDb, { studyId: study.id, name: 'Summary Subj' })
      const specimenType = await createTestSpecimenType(testDb, { name: 'Plasma' })
      const spec = await createTestSpecimen(testDb, specimenType.id, { studySubjectId: subject.id })
      const unit = await createTestUnit(testDb, { symbol: 'mL', name: 'milliliter', category: 'volume' })
      const now = utcNow()
      const [container] = await testDb
        .insert(storageContainer)
        .values({
          specimenId: spec.id,
          unitId: unit.id,
          totalQuantity: 1,
          remainingQuantity: 1,
          comment: 'Handle gently',
          created: now,
          lastUpdated: now,
        })
        .returning()

      const result = await getSubjectSummary(testDb, subject.id)
      expect(result.specimens).toHaveLength(1)
      expect(result.specimens[0].containers[0]).toMatchObject({
        id: container!.id,
        comment: 'Handle gently',
      })
      expect(result.summary.totalSpecimens).toBe(1)
      expect(result.summary.totalContainers).toBe(1)
    })

    it('throws NotFoundError for missing subject', async () => {
      await expect(getSubjectSummary(testDb, 99999)).rejects.toThrow(NotFoundError)
    })
  })

  describe('getSubjectQpcrResults', () => {
    it('throws NotFoundError for missing subject', async () => {
      await expect(getSubjectQpcrResults(testDb, 99999)).rejects.toThrow(NotFoundError)
    })

    it('returns empty results when subject has no specimens', async () => {
      const study = await createTestStudy(testDb, { title: 'Q Study', shortCode: 'Q1' })
      const subject = await createTestStudySubject(testDb, { studyId: study.id, name: 'Q Subj' })

      const result = await getSubjectQpcrResults(testDb, subject.id)
      expect(result.results).toEqual([])
    })

    it('returns linked well results for subject specimens', async () => {
      const now = utcNow()
      const study = await createTestStudy(testDb, { title: 'QPCR Study', shortCode: 'QPCR1' })
      const subject = await createTestStudySubject(testDb, { studyId: study.id, name: 'QPCR Subj' })
      const specimenType = await createTestSpecimenType(testDb, { name: 'Blood' })
      const [spec] = await testDb
        .insert(specimen)
        .values({
          studySubjectId: subject.id,
          specimenTypeId: specimenType.id,
          created: now,
          lastUpdated: now,
        })
        .returning()
      const [exp] = await testDb
        .insert(qpcrExperiment)
        .values({
          name: 'Exp 1',
          templateFormat: 'biorad',
          status: 'draft',
          created: now,
          lastUpdated: now,
        })
        .returning()
      await testDb.insert(qpcrExperimentWell).values({
        qpcrExperimentId: exp!.id,
        wellPosition: 'A01',
        specimenId: spec!.id,
      })
      const [run] = await testDb
        .insert(qpcrRun)
        .values({
          qpcrExperimentId: exp!.id,
          instrumentType: 'Biorad_CFX',
          runStartedAt: '2025-01-01T10:00:00Z',
          fileName: 'run1.csv',
          created: now,
        })
        .returning()
      await testDb.insert(qpcrWellResult).values({
        qpcrRunId: run!.id,
        wellPosition: 'A01',
        targetName: 'varATS',
        cq: 25.5,
        quantity: 100,
      })

      const result = await getSubjectQpcrResults(testDb, subject.id)
      expect(result.results).toHaveLength(1)
      expect(result.results[0]).toMatchObject({
        experimentId: exp!.id,
        experimentName: 'Exp 1',
        runId: run!.id,
        fileName: 'run1.csv',
        wellPosition: 'A01',
        targetName: 'varATS',
        cq: 25.5,
        quantity: 100,
      })
    })
  })
})
