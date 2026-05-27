import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import type { Database } from '../../../db/client'
import { setupTestDatabase, cleanupTestDatabase } from '../../../__tests__/helpers/db-setup'
import { createTestStudy } from '../../../__tests__/helpers/factories'
import { searchUnified } from '../unified-search'
import { resolveSearchTypes } from '../types'

describe('search types', () => {
  it('maps collection entity types to collection search bucket', () => {
    expect(resolveSearchTypes('micronix_plate')).toEqual(['collection'])
    expect(resolveSearchTypes(undefined)).toEqual(['specimen', 'container', 'study', 'subject'])
  })
})

describe('unified-search', () => {
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

  it('returns empty results for blank queries via caller', async () => {
    const result = await searchUnified(testDb, '', undefined)
    expect(result).toEqual({ results: [], query: '', count: 0 })
  })

  it('respects type filter and only searches matching entities', async () => {
    await createTestStudy(testDb, { title: 'Alpha Study', shortCode: 'ALPHA' })

    const studyOnly = await searchUnified(testDb, 'ALPHA', 'study')
    const containerOnly = await searchUnified(testDb, 'ALPHA', 'container')

    expect(studyOnly.count).toBe(1)
    expect(studyOnly.results.every((r) => r.type === 'study')).toBe(true)
    expect(containerOnly.count).toBe(0)
  })
})
