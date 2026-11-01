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
 * Write a consistent copy of the database next to its file before migrations run, so a
 * migration that goes wrong can be undone without falling back to the last restic snapshot.
 * `VACUUM INTO` reads through the connection, so the copy includes pages still in the WAL.
 *
 * Returns the copy's path, or null for an in-memory database (there is no file to protect).
 * Throws MigrationBackupError when the copy can't be written; the caller must not migrate.
 */
export function backupDatabaseBeforeMigrating(sqlite: Database, targetVersion: number): string | null {
  const databasePath = sqlite.filename
  if (databasePath === '' || databasePath === ':memory:') {
    return null
  }
  const backupPath = `${databasePath}.pre-v${targetVersion}-${backupTimestamp(new Date())}.bak`
  try {
    sqlite.prepare('VACUUM INTO ?').run(backupPath)
  } catch (error: unknown) {
    throw new MigrationBackupError(databasePath, backupPath, error)
  }
  console.log(`💾 Backed up database before schema migration: ${backupPath}`)
  return backupPath
}
