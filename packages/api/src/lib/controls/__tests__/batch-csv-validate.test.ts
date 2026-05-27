import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import type { Database } from '../../../db/client'
import { setupTestDatabase, cleanupTestDatabase } from '../../../__tests__/helpers/db-setup'
import { createTestSpecimenType } from '../../../__tests__/helpers/factories'
import { validateControlBatchCsv } from '../batch-csv-validate'

describe('batch-csv-validate', () => {
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
    expect(result.errors[0]?.error).toMatch(/header and one data row/)
  })

  it('rejects CSV missing specimen_type_name column', async () => {
    const result = await validateControlBatchCsv(testDb, 'name,quantity\nBatch,1')
    expect(result.valid).toBe(false)
    expect(result.errors[0]?.error).toMatch(/Missing required columns/)
  })

  it('flags unknown specimen types from the database', async () => {
    await createTestSpecimenType(testDb, { name: 'Known Type' })
    const result = await validateControlBatchCsv(
      testDb,
      'specimen_type_name,notes\nUnknown Type,note1\nKnown Type,note2'
    )
    expect(result.valid).toBe(false)
    expect(result.errors.some((e) => e.error.includes('Unknown specimen type: Unknown Type'))).toBe(true)
    expect(result.preview).toHaveLength(2)
  })

  it('accepts CSV when all specimen types exist', async () => {
    await createTestSpecimenType(testDb, { name: 'Control A' })
    const result = await validateControlBatchCsv(
      testDb,
      'specimen_type_name\nControl A\nControl A'
    )
    expect(result.valid).toBe(true)
    expect(result.errors).toHaveLength(0)
    expect(result.preview[0]?.specimen_type_name).toBe('Control A')
  })
})
