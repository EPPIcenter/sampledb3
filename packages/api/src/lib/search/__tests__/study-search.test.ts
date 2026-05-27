import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import type { Database } from '../../../db/client'
import { setupTestDatabase, cleanupTestDatabase } from '../../../__tests__/helpers/db-setup'
import { createTestStudy } from '../../../__tests__/helpers/factories'
import { searchStudies } from '../study-search'

describe('study-search', () => {
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

  it('finds studies by short code', async () => {
    await createTestStudy(testDb, { title: 'Alpha Study', shortCode: 'ALPHA' })

    const results = await searchStudies(testDb, 'ALPHA')

    expect(results).toHaveLength(1)
    expect(results[0]).toMatchObject({
      type: 'study',
      title: 'Alpha Study',
      subtitle: 'Code: ALPHA',
      url: expect.stringMatching(/^\/studies\/\d+$/),
    })
  })
})
