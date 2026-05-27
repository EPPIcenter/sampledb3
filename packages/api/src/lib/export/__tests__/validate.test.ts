import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { setupTestDatabase, cleanupTestDatabase } from '../../../__tests__/helpers/db-setup'
import {
  createTestStudy,
  createTestStudySubject,
  createTestSpecimenType,
  createTestSpecimen,
  createTestStorageContainer,
} from '../../../__tests__/helpers/factories'
import type { Database } from '../../../db/client'
import { buildExportSummary, validateStudyCodes } from '../validate'
import type { ContainerExportData } from '../types'

describe('validateStudyCodes', () => {
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

  it('returns valid study ids and empty invalid for existing short codes', async () => {
    const study = await createTestStudy(testDb, {
      title: 'Test Study',
      shortCode: 'ST1',
      leadPerson: 'Lead',
    })
    const result = await validateStudyCodes(testDb, ['ST1'])
    expect(result.valid.get('ST1')).toBe(study.id)
    expect(result.invalid).toHaveLength(0)
    expect(result.studies.get(study.id)).toBeDefined()
  })

  it('returns invalid list for non-existent short codes', async () => {
    const result = await validateStudyCodes(testDb, ['NONE', 'ALSO_NONE'])
    expect(result.valid.size).toBe(0)
    expect(result.invalid).toContain('NONE')
    expect(result.invalid).toContain('ALSO_NONE')
  })

  it('deduplicates study codes', async () => {
    const study = await createTestStudy(testDb, {
      title: 'Test',
      shortCode: 'DEDUP',
      leadPerson: 'X',
    })
    const result = await validateStudyCodes(testDb, ['DEDUP', 'DEDUP'])
    expect(result.valid.get('DEDUP')).toBe(study.id)
    expect(result.invalid).toHaveLength(0)
  })
})

describe('buildExportSummary', () => {
  it('counts containers per subject and lists subjects with results', async () => {
    const enrichedData: ContainerExportData[] = [
      {
        container_id: 1,
        container_type: 'micronix_tube',
        specimen_id: 10,
        subject_id: 100,
        subject_name: 'Subj1',
        study_id: 1,
        study_code: 'ST1',
        study_title: 'Study',
        specimen_type: 'Blood',
        state: 'available',
        status: 'available',
        created: '2024-01-01',
        last_updated: '2024-01-01',
      },
      {
        container_id: 2,
        container_type: 'micronix_tube',
        specimen_id: 11,
        subject_id: 100,
        subject_name: 'Subj1',
        study_id: 1,
        study_code: 'ST1',
        study_title: 'Study',
        specimen_type: 'Blood',
        state: 'available',
        status: 'available',
        created: '2024-01-01',
        last_updated: '2024-01-01',
      },
    ]
    const subjectNameToId = new Map([['Subj1', 100]])
    const subjectIdToName = new Map([[100, 'Subj1']])
    const summary = await buildExportSummary(
      enrichedData,
      ['Subj1'],
      subjectNameToId,
      subjectIdToName,
    )
    expect(summary.total_containers).toBe(2)
    expect(summary.subjects_with_results).toHaveLength(1)
    expect(summary.subjects_with_results[0]).toEqual({ name: 'Subj1', count: 2 })
    expect(summary.subjects_not_found).toHaveLength(0)
    expect(summary.subjects_no_results).toHaveLength(0)
  })

  it('reports subjects not found and subjects with no results', async () => {
    const enrichedData: ContainerExportData[] = []
    const subjectNameToId = new Map([['Found', 1]])
    const subjectIdToName = new Map([[1, 'Found']])
    const summary = await buildExportSummary(
      enrichedData,
      ['Found', 'NotFound'],
      subjectNameToId,
      subjectIdToName,
    )
    expect(summary.subjects_not_found).toContain('NotFound')
    expect(summary.subjects_no_results).toContain('Found')
  })
})

