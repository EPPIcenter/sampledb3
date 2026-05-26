import { describe, it, expect, beforeEach, afterEach } from 'bun:test'
import { setupTestDatabase, cleanupTestDatabase } from '../../__tests__/helpers/db-setup'
import { createTestSpecimenType } from '../../__tests__/helpers/factories'
import { validateControlBatchCsv } from '../controls/batch-csv-validate'
import type { Database } from '../../db/client'

describe('validateControlBatchCsv', () => {
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

  it('rejects CSV without data rows', async () => {
    const result = await validateControlBatchCsv(testDb, 'specimen_type_name\n')
    expect(result.valid).toBe(false)
    expect(result.errors[0]?.error).toContain('header and one data row')
  })

  it('rejects missing specimen_type_name column', async () => {
    const result = await validateControlBatchCsv(testDb, 'position\nA01')
    expect(result.valid).toBe(false)
    expect(result.errors[0]?.error).toContain('Missing required columns')
  })

  it('accepts CSV when specimen types exist', async () => {
    await createTestSpecimenType(testDb, { name: 'gDNA' })
    const result = await validateControlBatchCsv(
      testDb,
      'specimen_type_name,position\n gDNA,A01',
    )
    expect(result.valid).toBe(true)
    expect(result.preview).toHaveLength(1)
  })

  it('flags unknown specimen types', async () => {
    const result = await validateControlBatchCsv(
      testDb,
      'specimen_type_name\nUnknownType',
    )
    expect(result.valid).toBe(false)
    expect(result.errors.some((e) => e.error.includes('Unknown specimen type'))).toBe(true)
  })
})
