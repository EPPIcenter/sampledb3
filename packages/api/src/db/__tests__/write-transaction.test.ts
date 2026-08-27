import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { setupTestDatabase, cleanupTestDatabase } from '../../__tests__/helpers/db-setup'
import { createTestStudy } from '../../__tests__/helpers/factories'
import { study } from '../schema'
import { withWriteTransaction } from '../write-transaction'
import type { Database } from '../client'

describe('withWriteTransaction', () => {
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

  it('rolls back awaited writes when fn throws', async () => {
    await expect(
      withWriteTransaction(testDb, async (db) => {
        await createTestStudy(db, { title: 'Rollback Study', shortCode: 'RB1' })
        throw new Error('boom')
      }),
    ).rejects.toThrow('boom')

    const rows = await testDb.select().from(study)
    expect(rows.find((row) => row.shortCode === 'RB1')).toBeUndefined()
  })

  it('commits awaited writes when fn returns', async () => {
    await withWriteTransaction(testDb, async (db) => {
      await createTestStudy(db, { title: 'Commit Study', shortCode: 'CM1' })
    })

    const rows = await testDb.select().from(study)
    expect(rows.find((row) => row.shortCode === 'CM1')).toBeDefined()
  })

  it('does not nest when already in a transaction', async () => {
    await expect(
      withWriteTransaction(testDb, async (outer) => {
        await withWriteTransaction(outer, async (inner) => {
          await createTestStudy(inner, { title: 'Nested Study', shortCode: 'N1' })
        })
        throw new Error('outer fail')
      }),
    ).rejects.toThrow('outer fail')

    const rows = await testDb.select().from(study)
    expect(rows.find((row) => row.shortCode === 'N1')).toBeUndefined()
  })
})
