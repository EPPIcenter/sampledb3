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
import { SchemaMigrationError, runSqlMigrationStatements } from '../migration-runner'

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

  it('openOperationalDatabase on empty file reaches current version', () => {
    const { sqlite } = openOperationalDatabase(testDbPath)
    expect(getRecordedSchemaVersion(sqlite)).toBe(CURRENT_SCHEMA_VERSION)
    sqlite.close()
  })

  it('legacy unversioned database gains error_logs and schema_version 1 then upgrades to current', () => {
    const sqlite = new Database(testDbPath)
    sqlite.exec('CREATE TABLE study (id INTEGER PRIMARY KEY)')
    sqlite.exec(
      'CREATE TABLE settings (key TEXT, user_id INTEGER, value TEXT, PRIMARY KEY (key, user_id))',
    )
    sqlite.exec('CREATE TABLE storage_container (id INTEGER PRIMARY KEY)')
    sqlite.exec('CREATE TABLE sheet (id INTEGER PRIMARY KEY, name TEXT)')
    sqlite.exec(`CREATE TABLE paper (
      id INTEGER PRIMARY KEY REFERENCES storage_container(id),
      sheet_id INTEGER NOT NULL REFERENCES sheet(id),
      barcode TEXT,
      position TEXT
    )`)
    sqlite.close()

    const { sqlite: opened } = openOperationalDatabase(testDbPath)
    expect(getRecordedSchemaVersion(opened)).toBe(CURRENT_SCHEMA_VERSION)
    const errorLogs = opened
      .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='error_logs'")
      .get()
    expect(errorLogs).toBeDefined()
    opened.close()
  })

  it('applies pending migrations when database is at version 1 with legacy paper table', () => {
    const sqlite = new Database(testDbPath)
    sqlite.exec('CREATE TABLE schema_version (version INTEGER NOT NULL)')
    sqlite.exec('INSERT INTO schema_version (version) VALUES (1)')
    sqlite.exec('CREATE TABLE study (id INTEGER PRIMARY KEY)')
    sqlite.exec('CREATE TABLE storage_container (id INTEGER PRIMARY KEY)')
    sqlite.exec('CREATE TABLE sheet (id INTEGER PRIMARY KEY, name TEXT)')
    sqlite.exec(`CREATE TABLE paper (
      id INTEGER PRIMARY KEY REFERENCES storage_container(id),
      sheet_id INTEGER NOT NULL REFERENCES sheet(id),
      barcode TEXT,
      position TEXT
    )`)
    evolveOperationalSchema(sqlite)
    expect(getRecordedSchemaVersion(sqlite)).toBe(CURRENT_SCHEMA_VERSION)
    sqlite.close()
  })

  it('applies migration 003 when database is at version 2', () => {
    const sqlite = new Database(testDbPath)
    sqlite.exec('CREATE TABLE schema_version (version INTEGER NOT NULL)')
    sqlite.exec('INSERT INTO schema_version (version) VALUES (2)')
    sqlite.exec(`CREATE TABLE storage_container (id INTEGER PRIMARY KEY)`)
    sqlite.exec(`CREATE TABLE sheet (id INTEGER PRIMARY KEY, name TEXT)`)
    sqlite.exec(`CREATE TABLE paper (
      id INTEGER PRIMARY KEY REFERENCES storage_container(id),
      sheet_id INTEGER NOT NULL REFERENCES sheet(id),
      barcode TEXT,
      position TEXT
    )`)
    evolveOperationalSchema(sqlite)
    expect(getRecordedSchemaVersion(sqlite)).toBe(CURRENT_SCHEMA_VERSION)
    const columns = sqlite
      .prepare(`PRAGMA table_info(paper)`)
      .all() as Array<{ name: string }>
    expect(columns.map((c) => c.name).sort()).toEqual(['id', 'sheet_id', 'sublabel'])
    sqlite.close()
  })

  it('migration 003 aborts when paper.position has non-empty values', () => {
    const sqlite = new Database(testDbPath)
    sqlite.exec('CREATE TABLE schema_version (version INTEGER NOT NULL)')
    sqlite.exec('INSERT INTO schema_version (version) VALUES (2)')
    sqlite.exec(`CREATE TABLE storage_container (id INTEGER PRIMARY KEY)`)
    sqlite.exec(`CREATE TABLE sheet (id INTEGER PRIMARY KEY, name TEXT)`)
    sqlite.exec(`CREATE TABLE paper (
      id INTEGER PRIMARY KEY REFERENCES storage_container(id),
      sheet_id INTEGER NOT NULL REFERENCES sheet(id),
      barcode TEXT,
      position TEXT
    )`)
    sqlite.exec(`INSERT INTO storage_container (id) VALUES (1)`)
    sqlite.exec(`INSERT INTO sheet (id, name) VALUES (1, 'S1')`)
    sqlite.exec(`INSERT INTO paper (id, sheet_id, barcode, position) VALUES (1, 1, 'P1', 'A01')`)

    expect(() => evolveOperationalSchema(sqlite)).toThrow(SchemaMigrationError)
    expect(getRecordedSchemaVersion(sqlite)).toBe(2)
    sqlite.close()
  })

  it('fail-hard: invalid migration leaves schema_version unchanged', () => {
    const sqlite = new Database(testDbPath)
    sqlite.exec('CREATE TABLE schema_version (version INTEGER NOT NULL)')
    sqlite.exec('INSERT INTO schema_version (version) VALUES (1)')

    expect(() =>
      runSqlMigrationStatements(sqlite, 99, 'NOT VALID SQL SYNTAX HERE;'),
    ).toThrow(SchemaMigrationError)

    expect(getRecordedSchemaVersion(sqlite)).toBe(1)
    sqlite.close()
  })

  it('SchemaMigrationError includes migration version', () => {
    const sqlite = new Database(testDbPath)
    sqlite.exec('CREATE TABLE schema_version (version INTEGER NOT NULL)')
    sqlite.exec('INSERT INTO schema_version (version) VALUES (1)')

    try {
      runSqlMigrationStatements(sqlite, 42, 'BOGUS;')
    } catch (error) {
      expect(error).toBeInstanceOf(SchemaMigrationError)
      expect((error as SchemaMigrationError).migrationVersion).toBe(42)
      expect((error as Error).message).toContain('42')
    }
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
