import { Database } from 'bun:sqlite'

export class MigrationBackupError extends Error {
  readonly databasePath: string
  readonly backupPath: string

  constructor(databasePath: string, backupPath: string, cause: unknown) {
    const detail = cause instanceof Error ? cause.message : String(cause)
    super(
      `Could not back up ${databasePath} to ${backupPath} before running schema migrations: ${detail}. ` +
        'No migrations were run and the database is unchanged. Make the directory writable ' +
        '(and check free space), then start again.',
    )
    this.name = 'MigrationBackupError'
    this.databasePath = databasePath
    this.backupPath = backupPath
    if (cause instanceof Error) {
      this.cause = cause
    }
  }
}

/** `20261101T143005123Z`: UTC, sortable, and safe in a file name. */
function backupTimestamp(now: Date): string {
  return now.toISOString().replace(/[-:.]/g, '')
}

/**
 * Where to copy an on-disk database before changing it: next to its file, named
 * `<database file>.<label>-<UTC timestamp>.bak`. Null for an in-memory database (there is no
 * file to protect).
 */
export function databaseCopyPath(sqlite: Database, label: string, now: Date = new Date()): string | null {
  const databasePath = sqlite.filename
  if (databasePath === '' || databasePath === ':memory:') {
    return null
  }
  return `${databasePath}.${label}-${backupTimestamp(now)}.bak`
}

/**
 * Write a consistent copy of the database to `copyPath`. `VACUUM INTO` reads through the
 * connection, so the copy includes pages still in the WAL. Throws the SQLite error on failure.
 */
export function writeDatabaseCopy(sqlite: Database, copyPath: string): void {
  sqlite.prepare('VACUUM INTO ?').run(copyPath)
}

/**
 * Write a copy of the database before migrations run, so a migration that goes wrong can be
 * undone without falling back to the last restic snapshot.
 *
 * Returns the copy's path, or null for an in-memory database.
 * Throws MigrationBackupError when the copy can't be written; the caller must not migrate.
 */
export function backupDatabaseBeforeMigrating(sqlite: Database, targetVersion: number): string | null {
  const backupPath = databaseCopyPath(sqlite, `pre-v${targetVersion}`)
  if (backupPath == null) {
    return null
  }
  try {
    writeDatabaseCopy(sqlite, backupPath)
  } catch (error: unknown) {
    throw new MigrationBackupError(sqlite.filename, backupPath, error)
  }
  console.log(`💾 Backed up database before schema migration: ${backupPath}`)
  return backupPath
}
