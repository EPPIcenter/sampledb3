import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { Database } from 'bun:sqlite'
import { existsSync, unlinkSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import {
  CURRENT_SCHEMA_VERSION,
  evolveOperationalSchema,
  getRecordedSchemaVersion,
  isEmptyOperationalDatabase,
} from '../schema-evolution'
import { openOperationalDatabase } from '../open'

describe('schema evolution', () => {
  let testDbPath: string

  beforeEach(() => {
    testDbPath = join(tmpdir(), `evolution-test-${Date.now()}-${Math.random().toString(36).slice(2)}.sqlite`)
  })

  afterEach(() => {
    if (existsSync(testDbPath)) {
      try {
        unlinkSync(testDbPath)
      } catch {
        // ignore cleanup errors
      }
    }
  })

  it('reports empty database before bootstrap', () => {
    const sqlite = new Database(testDbPath)
    expect(isEmptyOperationalDatabase(sqlite)).toBe(true)
    expect(getRecordedSchemaVersion(sqlite)).toBeNull()
    sqlite.close()
  })

  it('applies snapshot on empty file and records CURRENT_SCHEMA_VERSION', () => {
    const sqlite = new Database(testDbPath)
    evolveOperationalSchema(sqlite)
    expect(getRecordedSchemaVersion(sqlite)).toBe(CURRENT_SCHEMA_VERSION)
    const study = sqlite
      .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='study'")
      .get()
    expect(study).toBeDefined()
    sqlite.close()
  })

  it('openOperationalDatabase on empty file reaches version 1 without import side effects', () => {
    const { sqlite } = openOperationalDatabase(testDbPath)
    expect(getRecordedSchemaVersion(sqlite)).toBe(CURRENT_SCHEMA_VERSION)
    sqlite.close()
  })
})

describe('database client module', () => {
  it('does not export a module-level database singleton', async () => {
    const clientModule = await import('../client')
    expect(clientModule).not.toHaveProperty('db')
    expect(clientModule).not.toHaveProperty('sqlite')
    expect(typeof clientModule.openOperationalDatabase).toBe('function')
  })
})
