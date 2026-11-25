import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { setupTestDatabase, cleanupTestDatabase } from '../../__tests__/helpers/db-setup'
import { createTestStudy } from '../../__tests__/helpers/factories'
import { study } from '../schema'
import { withRolledBackTransaction, withWriteTransaction } from '../write-transaction'
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

  it('keeps a write from another request that lands while a validate is open', async () => {
    let validateOpen!: () => void
    const opened = new Promise<void>((resolve) => (validateOpen = resolve))
    let finishValidate!: () => void
    const finish = new Promise<void>((resolve) => (finishValidate = resolve))

    const validate = withRolledBackTransaction(testDb, async (db) => {
      await createTestStudy(db, { title: 'Checked Study', shortCode: 'CHK' })
      validateOpen()
      await finish
    })
    await opened
    // Another request, from its own async context, writes while the validate is still open.
    const write = withWriteTransaction(testDb, async (db) => {
      await createTestStudy(db, { title: 'Saved Study', shortCode: 'SAVED' })
    })
    finishValidate()
    await Promise.all([validate, write])

    const codes = (await testDb.select().from(study)).map((row) => row.shortCode)
    expect(codes).toContain('SAVED')
    expect(codes).not.toContain('CHK')
  })

  it('runs overlapping writers in separate transactions', async () => {
    let firstOpen!: () => void
    const opened = new Promise<void>((resolve) => (firstOpen = resolve))
    let failFirst!: () => void
    const fail = new Promise<void>((resolve) => (failFirst = resolve))

    const first = withWriteTransaction(testDb, async (db) => {
      await createTestStudy(db, { title: 'Failed Study', shortCode: 'FAIL' })
      firstOpen()
      await fail
      throw new Error('first fails')
    })
    await opened
    const second = withWriteTransaction(testDb, async (db) => {
      await createTestStudy(db, { title: 'Second Study', shortCode: 'SECOND' })
    })
    failFirst()
    await expect(first).rejects.toThrow('first fails')
    await second

    const codes = (await testDb.select().from(study)).map((row) => row.shortCode)
    expect(codes).toEqual(['SECOND'])
  })
})
