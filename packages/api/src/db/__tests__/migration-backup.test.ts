import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { Database } from 'bun:sqlite'
import { chmodSync, mkdtempSync, readdirSync, rmSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import { CURRENT_SCHEMA_VERSION, evolveOperationalSchema, getRecordedSchemaVersion } from '../schema-evolution'
import { openOperationalDatabase } from '../open'
import { MigrationBackupError } from '../migration-backup'

const PREVIOUS_VERSION = CURRENT_SCHEMA_VERSION - 1

/** A database one version behind current, holding three studies. */
function createDatabaseOneVersionBehind(path: string): void {
  const sqlite = new Database(path)
  evolveOperationalSchema(sqlite)
  for (const code of ['A', 'B', 'C']) {
    sqlite
      .prepare(
        `INSERT INTO study (title, short_code, is_longitudinal, lead_person, created, last_updated)
         VALUES (?, ?, 0, 'Lead', '2026-01-01', '2026-01-01')`,
      )
      .run(`Study ${code}`, code)
  }
  sqlite.prepare('UPDATE schema_version SET version = ?').run(PREVIOUS_VERSION)
  sqlite.close()
}

function backupFiles(dir: string): string[] {
  return readdirSync(dir).filter((name) => name.endsWith('.bak'))
}

describe('backup before startup migrations', () => {
  let dir: string
  let dbPath: string

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'migration-backup-'))
    dbPath = join(dir, 'sampledb.sqlite')
  })

  afterEach(() => {
    chmodSync(dir, 0o755)
    rmSync(dir, { recursive: true, force: true })
  })

  it('writes a copy with the pre-migration version and rows before migrating', () => {
    createDatabaseOneVersionBehind(dbPath)

    const { sqlite } = openOperationalDatabase(dbPath, { backupBeforeMigrating: true })
    expect(getRecordedSchemaVersion(sqlite)).toBe(CURRENT_SCHEMA_VERSION)
    sqlite.close()

    const backups = backupFiles(dir)
    expect(backups).toHaveLength(1)
    expect(backups[0]).toMatch(
      new RegExp(`^sampledb\\.sqlite\\.pre-v${CURRENT_SCHEMA_VERSION}-\\d{8}T\\d{6}\\d{3}Z\\.bak$`),
    )

    // Read-only: inspecting the copy must not migrate it.
    const copy = new Database(join(dir, backups[0]), { readonly: true })
    expect(getRecordedSchemaVersion(copy)).toBe(PREVIOUS_VERSION)
    expect(copy.prepare('SELECT COUNT(*) AS n FROM study').get()).toEqual({ n: 3 })
    copy.close()
  })

  it('includes rows another connection left in the WAL', () => {
    createDatabaseOneVersionBehind(dbPath)
    const writer = new Database(dbPath)
    writer.exec('PRAGMA journal_mode = WAL')
    writer.exec('PRAGMA wal_autocheckpoint = 0')
    writer
      .prepare(
        `INSERT INTO study (title, short_code, is_longitudinal, lead_person, created, last_updated)
         VALUES ('Study D', 'D', 0, 'Lead', '2026-01-01', '2026-01-01')`,
      )
      .run()

    const { sqlite } = openOperationalDatabase(dbPath, { backupBeforeMigrating: true })
    sqlite.close()
    writer.close()

    const [backup] = backupFiles(dir)
    const copy = new Database(join(dir, backup), { readonly: true })
    expect(copy.prepare('SELECT COUNT(*) AS n FROM study').get()).toEqual({ n: 4 })
    copy.close()
  })

  it('backs up an unversioned legacy database before its baseline migration', () => {
    const legacy = new Database(dbPath)
    legacy.exec('CREATE TABLE study (id INTEGER PRIMARY KEY, title TEXT, short_code TEXT)')
    legacy.exec("INSERT INTO study (title, short_code) VALUES ('Legacy', 'L')")
    legacy.close()

    // Only the copy matters here; the bare legacy file can't finish migrating.
    try {
      openOperationalDatabase(dbPath, { backupBeforeMigrating: true }).sqlite.close()
    } catch {
      // ignore
    }

    const [backup] = backupFiles(dir)
    const copy = new Database(join(dir, backup), { readonly: true })
    expect(getRecordedSchemaVersion(copy)).toBeNull()
    expect(copy.prepare('SELECT COUNT(*) AS n FROM study').get()).toEqual({ n: 1 })
    copy.close()
  })

  it('writes no copy when no migration is pending', () => {
    openOperationalDatabase(dbPath, { backupBeforeMigrating: true }).sqlite.close()
    openOperationalDatabase(dbPath, { backupBeforeMigrating: true }).sqlite.close()

    expect(backupFiles(dir)).toEqual([])
  })

  it('writes no copy of a test database by default', () => {
    expect(process.env.NODE_ENV).toBe('test')
    createDatabaseOneVersionBehind(dbPath)

    const { sqlite } = openOperationalDatabase(dbPath)
    expect(getRecordedSchemaVersion(sqlite)).toBe(CURRENT_SCHEMA_VERSION)
    sqlite.close()

    expect(backupFiles(dir)).toEqual([])
  })

  it('migrates an in-memory database without a copy', () => {
    // A copy of ':memory:' would land relative to the working directory, so run from `dir`.
    const previousCwd = process.cwd()
    process.chdir(dir)
    try {
      const { sqlite } = openOperationalDatabase(':memory:', { backupBeforeMigrating: true })
      sqlite.prepare('UPDATE schema_version SET version = ?').run(PREVIOUS_VERSION)

      evolveOperationalSchema(sqlite, { backupBeforeMigrating: true })

      expect(getRecordedSchemaVersion(sqlite)).toBe(CURRENT_SCHEMA_VERSION)
      sqlite.close()
    } finally {
      process.chdir(previousCwd)
    }
    expect(backupFiles(dir)).toEqual([])
  })

  it('stops without migrating when the copy cannot be written', () => {
    createDatabaseOneVersionBehind(dbPath)
    const sqlite = new Database(dbPath)
    sqlite.exec('PRAGMA journal_mode = WAL')
    expect(getRecordedSchemaVersion(sqlite)).toBe(PREVIOUS_VERSION)
    chmodSync(dir, 0o555)

    let thrown: unknown
    try {
      evolveOperationalSchema(sqlite, { backupBeforeMigrating: true })
    } catch (error: unknown) {
      thrown = error
    }

    expect(thrown).toBeInstanceOf(MigrationBackupError)
    expect((thrown as Error).message).toContain(`Could not back up ${dbPath}`)
    expect((thrown as Error).message).toContain('No migrations were run')
    expect(getRecordedSchemaVersion(sqlite)).toBe(PREVIOUS_VERSION)
    sqlite.close()
    chmodSync(dir, 0o755)
    expect(backupFiles(dir)).toEqual([])
  })
})
