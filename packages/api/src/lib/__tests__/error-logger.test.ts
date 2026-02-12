import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { setupTestDatabase, cleanupTestDatabase } from '../../__tests__/helpers/db-setup'
import { logError, logFrontendError, logBackendError, cleanupOldErrorLogs } from '../error-logger'
import { errorLogs } from '../../db/schema'
import { eq } from 'drizzle-orm'
import type { Database } from '../../db/client'

describe('error-logger lib', () => {
  const originalErrorLogEnabled = process.env.ERROR_LOG_ENABLED

  afterEach(() => {
    if (originalErrorLogEnabled !== undefined) {
      process.env.ERROR_LOG_ENABLED = originalErrorLogEnabled
    } else {
      delete process.env.ERROR_LOG_ENABLED
    }
  })

  describe('ERROR_LOG_ENABLED', () => {
    it('does NOT insert when ERROR_LOG_ENABLED=false', async () => {
      process.env.ERROR_LOG_ENABLED = 'false'
      const setup = await setupTestDatabase()
      const { db, sqlite } = setup

      await logError(
        db,
        'backend',
        'error',
        'Should not be logged',
        new Error('Test'),
        {}
      )

      const rows = await db.select().from(errorLogs).where(eq(errorLogs.source, 'backend'))
      expect(rows.length).toBe(0)
      cleanupTestDatabase(sqlite)
    })

    it('inserts when ERROR_LOG_ENABLED=true', async () => {
      process.env.ERROR_LOG_ENABLED = 'true'
      const setup = await setupTestDatabase()
      const { db, sqlite } = setup

      await logError(
        db,
        'backend',
        'error',
        'Should be logged',
        new Error('Test'),
        {}
      )

      const rows = await db.select().from(errorLogs).where(eq(errorLogs.source, 'backend'))
      expect(rows.length).toBeGreaterThanOrEqual(1)
      expect(rows[rows.length - 1].message).toBe('Should be logged')
      cleanupTestDatabase(sqlite)
    })

    it('inserts when ERROR_LOG_ENABLED is unset (default enabled)', async () => {
      delete process.env.ERROR_LOG_ENABLED
      const setup = await setupTestDatabase()
      const { db, sqlite } = setup

      await logError(
        db,
        'backend',
        'error',
        'Default enabled',
        new Error('Test'),
        {}
      )

      const rows = await db.select().from(errorLogs).where(eq(errorLogs.source, 'backend'))
      expect(rows.length).toBeGreaterThanOrEqual(1)
      cleanupTestDatabase(sqlite)
    })
  })

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

  describe('graceful degradation when error_logs table missing', () => {
    it('does not throw when error_logs table does not exist', async () => {
      const setup = await setupTestDatabase()
      const { db, sqlite } = setup
      sqlite.exec('DROP TABLE IF EXISTS error_logs')
      sqlite.exec('DROP INDEX IF EXISTS error_logs_timestamp_idx')
      sqlite.exec('DROP INDEX IF EXISTS error_logs_source_idx')
      sqlite.exec('DROP INDEX IF EXISTS error_logs_level_idx')
      sqlite.exec('DROP INDEX IF EXISTS error_logs_resolved_idx')

      await expect(
        logError(db, 'backend', 'error', 'No table', new Error('test'), {})
      ).resolves.toBeUndefined()

      cleanupTestDatabase(sqlite)
    })
  })
})
