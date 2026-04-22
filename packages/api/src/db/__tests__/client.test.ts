import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { Database } from 'bun:sqlite'
import { existsSync, unlinkSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import { createDatabase } from '../client'

describe('Database Client', () => {
  let testDbPath: string

  beforeEach(() => {
    // Create a unique test database path
    testDbPath = join(tmpdir(), `test-db-${Date.now()}-${Math.random().toString(36).substring(7)}.sqlite`)
  })

  afterEach(() => {
    // Clean up test database file if it exists
    if (existsSync(testDbPath)) {
      try {
        unlinkSync(testDbPath)
      } catch (error) {
        // Ignore cleanup errors
      }
    }
  })

  it('creates error_logs table when missing even if study and settings exist', () => {
    // Simulate database created before error_logs was added to schema
    const db = new Database(testDbPath)
    db.exec('CREATE TABLE study (id INTEGER PRIMARY KEY)')
    db.exec('CREATE TABLE settings (key TEXT, user_id INTEGER, value TEXT, PRIMARY KEY (key, user_id))')
    // Intentionally do NOT create error_logs
    const before = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='error_logs'").get()
    expect(before).toBeNull()
    db.close()

    const { sqlite } = createDatabase(testDbPath)
    const after = sqlite.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='error_logs'").get()
    expect(after).toBeDefined()
    expect((after as { name: string }).name).toBe('error_logs')
    sqlite.close()
  })
})

