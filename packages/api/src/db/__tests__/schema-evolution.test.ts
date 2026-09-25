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

/** Tables that migrations 004+ alter, so older-version fixtures can migrate to current. */
function createTablesForLaterMigrations(sqlite: Database): void {
  sqlite.exec(`CREATE TABLE IF NOT EXISTS micronix_tube (
    id INTEGER PRIMARY KEY,
    collection_id INTEGER NOT NULL,
    barcode TEXT,
    position TEXT
  )`)
  sqlite.exec(`CREATE TABLE IF NOT EXISTS cryovial_tube (
    id INTEGER PRIMARY KEY,
    collection_id INTEGER NOT NULL,
    barcode TEXT,
    position TEXT
  )`)
  sqlite.exec(`CREATE TABLE IF NOT EXISTS static_well (
    id INTEGER PRIMARY KEY,
    collection_id INTEGER NOT NULL,
    position TEXT
  )`)
  sqlite.exec(`CREATE TABLE IF NOT EXISTS study_subject (
    id INTEGER PRIMARY KEY,
    study_id INTEGER NOT NULL,
    name TEXT NOT NULL
  )`)
  sqlite.exec(`CREATE TABLE IF NOT EXISTS sheet (
    id INTEGER PRIMARY KEY,
    name TEXT NOT NULL,
    box_id INTEGER,
    bag_id INTEGER
  )`)
}

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

  it('openOperationalDatabase enables foreign keys on empty and reconnect', () => {
    const first = openOperationalDatabase(testDbPath)
    const emptyFk = first.sqlite.prepare('PRAGMA foreign_keys').get() as { foreign_keys: number }
    expect(emptyFk.foreign_keys).toBe(1)
    first.sqlite.close()

    const second = openOperationalDatabase(testDbPath)
    const reconnectFk = second.sqlite.prepare('PRAGMA foreign_keys').get() as { foreign_keys: number }
    expect(reconnectFk.foreign_keys).toBe(1)
    second.sqlite.close()
  })

  it('legacy unversioned database gains error_logs and schema_version 1 then upgrades to current', () => {
    const sqlite = new Database(testDbPath)
    sqlite.exec('CREATE TABLE study (id INTEGER PRIMARY KEY)')
    sqlite.exec(
      'CREATE TABLE settings (key TEXT, user_id INTEGER, value TEXT, PRIMARY KEY (key, user_id))',
    )
    sqlite.exec('CREATE TABLE storage_container (id INTEGER PRIMARY KEY)')
    sqlite.exec('CREATE TABLE sheet (id INTEGER PRIMARY KEY, name TEXT, box_id INTEGER, bag_id INTEGER)')
    sqlite.exec(`CREATE TABLE paper (
      id INTEGER PRIMARY KEY REFERENCES storage_container(id),
      sheet_id INTEGER NOT NULL REFERENCES sheet(id),
      barcode TEXT,
      position TEXT
    )`)
    createTablesForLaterMigrations(sqlite)
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
    sqlite.exec('CREATE TABLE sheet (id INTEGER PRIMARY KEY, name TEXT, box_id INTEGER, bag_id INTEGER)')
    sqlite.exec(`CREATE TABLE paper (
      id INTEGER PRIMARY KEY REFERENCES storage_container(id),
      sheet_id INTEGER NOT NULL REFERENCES sheet(id),
      barcode TEXT,
      position TEXT
    )`)
    createTablesForLaterMigrations(sqlite)
    evolveOperationalSchema(sqlite)
    expect(getRecordedSchemaVersion(sqlite)).toBe(CURRENT_SCHEMA_VERSION)
    sqlite.close()
  })

  it('applies migration 003 when database is at version 2', () => {
    const sqlite = new Database(testDbPath)
    sqlite.exec('CREATE TABLE schema_version (version INTEGER NOT NULL)')
    sqlite.exec('INSERT INTO schema_version (version) VALUES (2)')
    sqlite.exec(`CREATE TABLE storage_container (id INTEGER PRIMARY KEY)`)
    sqlite.exec(`CREATE TABLE sheet (id INTEGER PRIMARY KEY, name TEXT, box_id INTEGER, bag_id INTEGER)`)
    sqlite.exec(`CREATE TABLE paper (
      id INTEGER PRIMARY KEY REFERENCES storage_container(id),
      sheet_id INTEGER NOT NULL REFERENCES sheet(id),
      barcode TEXT,
      position TEXT
    )`)
    createTablesForLaterMigrations(sqlite)
    evolveOperationalSchema(sqlite)
    expect(getRecordedSchemaVersion(sqlite)).toBe(CURRENT_SCHEMA_VERSION)
    const columns = sqlite
      .prepare(`PRAGMA table_info(paper)`)
      .all() as Array<{ name: string }>
    expect(columns.map((c) => c.name).sort()).toEqual(['id', 'sheet_id', 'sublabel'])
    sqlite.close()
  })

  it('creates legacy paper stub before migration 003 when paper table is missing', () => {
    const sqlite = new Database(testDbPath)
    sqlite.exec('CREATE TABLE schema_version (version INTEGER NOT NULL)')
    sqlite.exec('INSERT INTO schema_version (version) VALUES (2)')
    createTablesForLaterMigrations(sqlite)
    evolveOperationalSchema(sqlite)
    expect(getRecordedSchemaVersion(sqlite)).toBe(CURRENT_SCHEMA_VERSION)
    const paperTable = sqlite
      .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='paper'")
      .get()
    expect(paperTable).toBeDefined()
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
    sqlite.exec(`CREATE TABLE sheet (id INTEGER PRIMARY KEY, name TEXT, box_id INTEGER, bag_id INTEGER)`)
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

  it('applies migration 004 unique indexes when database is at version 3', () => {
    const sqlite = new Database(testDbPath)
    sqlite.exec('CREATE TABLE schema_version (version INTEGER NOT NULL)')
    sqlite.exec('INSERT INTO schema_version (version) VALUES (3)')
    createTablesForLaterMigrations(sqlite)
    evolveOperationalSchema(sqlite)
    expect(getRecordedSchemaVersion(sqlite)).toBe(CURRENT_SCHEMA_VERSION)
    const names = sqlite
      .prepare(
        `SELECT name FROM sqlite_master WHERE type='index' AND name LIKE '%collection_position%'`,
      )
      .all() as Array<{ name: string }>
    expect(names.map((row) => row.name).sort()).toEqual([
      'cryovial_tube_collection_position_idx',
      'micronix_tube_collection_position_idx',
      'static_well_collection_position_idx',
    ])
    sqlite.close()
  })

  it('migration 004 aborts when duplicate occupied grid positions exist', () => {
    const sqlite = new Database(testDbPath)
    sqlite.exec('CREATE TABLE schema_version (version INTEGER NOT NULL)')
    sqlite.exec('INSERT INTO schema_version (version) VALUES (3)')
    createTablesForLaterMigrations(sqlite)
    sqlite.exec(`INSERT INTO micronix_tube (id, collection_id, barcode, position) VALUES (1, 1, 'A', 'A01')`)
    sqlite.exec(`INSERT INTO micronix_tube (id, collection_id, barcode, position) VALUES (2, 1, 'B', 'A01')`)

    expect(() => evolveOperationalSchema(sqlite)).toThrow(SchemaMigrationError)
    expect(getRecordedSchemaVersion(sqlite)).toBe(3)
    sqlite.close()
  })

  it('migration 005 trims subject names and adds a unique (study_id, name) index', () => {
    const sqlite = new Database(testDbPath)
    sqlite.exec('CREATE TABLE schema_version (version INTEGER NOT NULL)')
    sqlite.exec('INSERT INTO schema_version (version) VALUES (4)')
    createTablesForLaterMigrations(sqlite)
    sqlite.exec(`INSERT INTO study_subject (id, study_id, name) VALUES (1, 1, ' S1 '), (2, 1, 's1'), (3, 2, 'S1')`)

    evolveOperationalSchema(sqlite)

    expect(getRecordedSchemaVersion(sqlite)).toBe(CURRENT_SCHEMA_VERSION)
    const names = sqlite.prepare('SELECT name FROM study_subject ORDER BY id').all() as Array<{ name: string }>
    expect(names.map((r) => r.name)).toEqual(['S1', 's1', 'S1'])
    expect(() => sqlite.exec(`INSERT INTO study_subject (id, study_id, name) VALUES (4, 1, 'S1')`)).toThrow(/UNIQUE/)
    sqlite.close()
  })

  it('migration 005 aborts when two subjects in a study match after trimming', () => {
    const sqlite = new Database(testDbPath)
    sqlite.exec('CREATE TABLE schema_version (version INTEGER NOT NULL)')
    sqlite.exec('INSERT INTO schema_version (version) VALUES (4)')
    createTablesForLaterMigrations(sqlite)
    sqlite.exec(`INSERT INTO study_subject (id, study_id, name) VALUES (1, 1, 'S1'), (2, 1, 'S1 ')`)

    expect(() => evolveOperationalSchema(sqlite)).toThrow(/Merge or rename them first/)
    expect(getRecordedSchemaVersion(sqlite)).toBe(4)
    const names = sqlite.prepare('SELECT name FROM study_subject ORDER BY id').all() as Array<{ name: string }>
    expect(names.map((r) => r.name)).toEqual(['S1', 'S1 '])
    sqlite.close()
  })

  it('migration 006 makes sheet names unique per box but not per bag', () => {
    const sqlite = new Database(testDbPath)
    sqlite.exec('CREATE TABLE schema_version (version INTEGER NOT NULL)')
    sqlite.exec('INSERT INTO schema_version (version) VALUES (5)')
    createTablesForLaterMigrations(sqlite)
    sqlite.exec(`INSERT INTO sheet (id, name, box_id, bag_id) VALUES (1, 'S1', 1, NULL), (2, 'S1', NULL, 7), (3, 'S1', NULL, 7)`)

    evolveOperationalSchema(sqlite)

    expect(getRecordedSchemaVersion(sqlite)).toBe(CURRENT_SCHEMA_VERSION)
    expect(() => sqlite.exec(`INSERT INTO sheet (id, name, box_id) VALUES (4, 'S1', 1)`)).toThrow(/UNIQUE/)
    sqlite.exec(`INSERT INTO sheet (id, name, bag_id) VALUES (5, 'S1', 7)`)
    sqlite.close()
  })

  it('migration 006 aborts when a box has two sheets with the same name', () => {
    const sqlite = new Database(testDbPath)
    sqlite.exec('CREATE TABLE schema_version (version INTEGER NOT NULL)')
    sqlite.exec('INSERT INTO schema_version (version) VALUES (5)')
    createTablesForLaterMigrations(sqlite)
    sqlite.exec(`INSERT INTO sheet (id, name, box_id) VALUES (1, 'S1', 1), (2, 'S1', 1)`)

    expect(() => evolveOperationalSchema(sqlite)).toThrow(/Rename one of them first/)
    expect(getRecordedSchemaVersion(sqlite)).toBe(5)
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
