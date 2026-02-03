import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { setupTestDatabase, cleanupTestDatabase } from '../../__tests__/helpers/db-setup'
import { logError, logFrontendError, logBackendError, cleanupOldErrorLogs } from '../error-logger'
import { errorLogs } from '../../db/schema'
import { eq } from 'drizzle-orm'
import type { Database } from '../../db/client'

describe('error-logger lib', () => {
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

  describe('logError', () => {
    it('inserts error log with message and severity', async () => {
      await logError(
        testDb,
        'backend',
        'error',
        'Test error message',
        new Error('Test error'),
        { userId: 1, url: '/test' }
      )
      const rows = await testDb.select().from(errorLogs).where(eq(errorLogs.source, 'backend'))
      expect(rows.length).toBeGreaterThanOrEqual(1)
      const last = rows[rows.length - 1]
      expect(last.message).toBe('Test error message')
      expect(last.level).toBe('error')
      expect(last.source).toBe('backend')
    })

    it('accepts context with additionalContext', async () => {
      await logError(
        testDb,
        'frontend',
        'error',
        'Client error',
        'string error',
        { additionalContext: { component: 'TestComponent' } }
      )
      const rows = await testDb.select().from(errorLogs).where(eq(errorLogs.source, 'frontend'))
      expect(rows.length).toBeGreaterThanOrEqual(1)
      const last = rows[rows.length - 1]
      expect(last.level).toBe('error')
    })
  })

  describe('logFrontendError', () => {
    it('calls logError with frontend source', async () => {
      await logFrontendError(testDb, 'error', 'Frontend error', new Error('FE error'))
      const rows = await testDb.select().from(errorLogs).where(eq(errorLogs.source, 'frontend'))
      expect(rows.length).toBeGreaterThanOrEqual(1)
      expect(rows[rows.length - 1].message).toContain('Frontend error')
    })
  })

  describe('logBackendError', () => {
    it('calls logError with backend source', async () => {
      await logBackendError(testDb, new Error('Backend error'))
      const rows = await testDb.select().from(errorLogs).where(eq(errorLogs.source, 'backend'))
      expect(rows.length).toBeGreaterThanOrEqual(1)
      expect(rows[rows.length - 1].message).toBe('Backend error')
    })
  })

  describe('cleanupOldErrorLogs', () => {
    it('returns deleted count and retentionDays', async () => {
      const result = await cleanupOldErrorLogs(testDb, 90)
      expect(result).toHaveProperty('deleted')
      expect(result).toHaveProperty('retentionDays', 90)
      expect(typeof result.deleted).toBe('number')
    })
  })
})
