import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import type { Database } from '../../db/client'
import type { Database as SQLiteDatabase } from 'bun:sqlite'
import { setupTestDatabase, cleanupTestDatabase } from '../../__tests__/helpers/db-setup'
import { setupPaginationSettings } from '../../__tests__/helpers/auth-helpers'
import { setPaginationSettings } from '../settings'
import { validateLimit } from '../constants'

describe('validateLimit', () => {
  let db: Database
  let sqlite: SQLiteDatabase

  beforeEach(async () => {
    const setup = await setupTestDatabase()
    db = setup.db
    sqlite = setup.sqlite
  })

  afterEach(() => {
    cleanupTestDatabase(sqlite)
  })

  it('uses a changed page size without a restart', async () => {
    await setupPaginationSettings(db, { defaultPageSize: 25, maxPageSize: 100 })
    expect(await validateLimit(db, undefined)).toBe(25)
    expect(await validateLimit(db, 80)).toBe(80)

    await setPaginationSettings(db, { defaultPageSize: 10, maxPageSize: 50 })

    expect(await validateLimit(db, undefined)).toBe(10)
    expect(await validateLimit(db, 80)).toBe(50)
  })

  it('reads each database’s own settings', async () => {
    await setupPaginationSettings(db, { defaultPageSize: 25, maxPageSize: 100 })
    expect(await validateLimit(db, undefined)).toBe(25)

    const other = await setupTestDatabase()
    try {
      await expect(validateLimit(other.db, undefined)).rejects.toThrow('Pagination settings are not configured')
      await setupPaginationSettings(other.db, { defaultPageSize: 7, maxPageSize: 20 })
      expect(await validateLimit(other.db, undefined)).toBe(7)
    } finally {
      cleanupTestDatabase(other.sqlite)
    }
  })
})
