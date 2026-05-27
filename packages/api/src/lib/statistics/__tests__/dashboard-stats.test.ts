import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import type { Database } from '../../../db/client'
import type { Database as SQLiteDatabase } from 'bun:sqlite'
import { setupTestDatabase, cleanupTestDatabase } from '../../../__tests__/helpers/db-setup'
import { getDashboardStatistics } from '../dashboard-stats'

describe('dashboard-stats', () => {
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

  it('returns expected shape on empty database', async () => {
    const data = await getDashboardStatistics(testDb, sqlite as SQLiteDatabase, {})

    expect(data.specimens).toMatchObject({
      total: 0,
      bySourceType: {},
      bySpecimenType: {},
      byStudy: {},
      collectionTimeline: [],
      creationTimeline: [],
    })
    expect(data.containers).toMatchObject({
      total: 0,
      byType: {},
      byState: {},
      byStatus: {},
      averagePerSpecimen: 0,
    })
    expect(data.storage.byLocation).toEqual([])
    expect(data.storage.byRootLocation).toEqual({})
    expect(data.storage._summary).toBeUndefined()
  })

  it('returns empty results for unknown study short code', async () => {
    const data = await getDashboardStatistics(testDb, sqlite as SQLiteDatabase, {
      study: 'NONEXISTENT',
    })

    expect(data.specimens.total).toBe(0)
    expect(data.containers.total).toBe(0)
    expect(data.storage.byLocation).toEqual([])
    expect(data.storage._summary).toBeUndefined()
  })
})
