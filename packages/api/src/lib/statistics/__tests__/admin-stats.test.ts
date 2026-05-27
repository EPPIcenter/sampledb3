import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import type { Database } from '../../../db/client'
import { setupTestDatabase, cleanupTestDatabase } from '../../../__tests__/helpers/db-setup'
import { getAdminStatistics } from '../admin-stats'

describe('admin-stats', () => {
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
    const data = await getAdminStatistics(testDb)

    expect(data.users).toMatchObject({
      total: expect.any(Number),
      active: expect.any(Number),
      deleted: expect.any(Number),
      byRole: expect.any(Object),
      recentLogins: expect.any(Number),
    })
    expect(data.sessions).toMatchObject({ active: expect.any(Number) })
    expect(data.entities).toMatchObject({
      studies: 0,
      subjects: 0,
      specimens: 0,
      containers: 0,
    })
    expect(data.containers).toMatchObject({
      micronixTubes: 0,
      cryovialTubes: 0,
      papers: 0,
      staticWells: 0,
    })
    expect(data.collections).toMatchObject({
      micronixPlates: 0,
      cryovialBoxes: 0,
      boxes: 0,
      bags: 0,
    })
    expect(data.referenceData).toMatchObject({
      specimenTypes: 0,
      storageTypes: 0,
      tags: 0,
      units: 0,
      strains: 0,
    })
    expect(data.locations).toEqual({ total: 0 })
  })
})
