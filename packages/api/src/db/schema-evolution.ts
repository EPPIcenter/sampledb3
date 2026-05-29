import { Database } from 'bun:sqlite'
import { applyInitialSchema } from './apply-initial-schema'

/** Canonical schema level; bump when adding numbered deltas under migrations/. */
export const CURRENT_SCHEMA_VERSION = 1

const SCHEMA_VERSION_TABLE = 'schema_version'

export function hasSchemaVersionTable(sqlite: Database): boolean {
  const row = sqlite
    .prepare(
      `SELECT name FROM sqlite_master WHERE type='table' AND name = ?`,
    )
    .get(SCHEMA_VERSION_TABLE)
  return row != null
}

export function getRecordedSchemaVersion(sqlite: Database): number | null {
  if (!hasSchemaVersionTable(sqlite)) {
    return null
  }
  const row = sqlite
    .prepare(`SELECT version FROM ${SCHEMA_VERSION_TABLE} LIMIT 1`)
    .get() as { version: number } | null
  return row?.version ?? null
}

/** True when there are no application tables (fresh file or after full drop). */
export function isEmptyOperationalDatabase(sqlite: Database): boolean {
  const row = sqlite
    .prepare(
      `SELECT COUNT(*) AS count FROM sqlite_master
       WHERE type='table' AND name NOT LIKE 'sqlite_%'`,
    )
    .get() as { count: number }
  return row.count === 0
}

function applyPendingMigrations(sqlite: Database, fromVersion: number): void {
  if (fromVersion >= CURRENT_SCHEMA_VERSION) {
    return
  }
  // Numbered deltas (002+) run here once slice 5+ land; none at version 1 baseline.
  const afterMigrations = CURRENT_SCHEMA_VERSION
  if (fromVersion < afterMigrations) {
    sqlite.prepare(`UPDATE ${SCHEMA_VERSION_TABLE} SET version = ?`).run(afterMigrations)
  }
}

/**
 * Bring an operational SQLite file to CURRENT_SCHEMA_VERSION.
 * Empty files get the SQL snapshot (includes schema_version = 1).
 * Unversioned non-empty files are unchanged here; legacy patches run from open until 001 lands.
 */
export function evolveOperationalSchema(sqlite: Database): void {
  const recorded = getRecordedSchemaVersion(sqlite)

  if (recorded != null) {
    if (recorded > CURRENT_SCHEMA_VERSION) {
      throw new Error(
        `Database schema version ${recorded} is newer than this application supports (${CURRENT_SCHEMA_VERSION}).`,
      )
    }
    applyPendingMigrations(sqlite, recorded)
    return
  }

  if (isEmptyOperationalDatabase(sqlite)) {
    if (process.env.NODE_ENV !== 'production') {
      console.log(`📝 Database is empty - running initial schema...`)
    }
    applyInitialSchema(sqlite)
    const version = getRecordedSchemaVersion(sqlite)
    if (version !== CURRENT_SCHEMA_VERSION) {
      throw new Error(
        `Initial schema must leave schema_version at ${CURRENT_SCHEMA_VERSION}, got ${version ?? 'missing'}`,
      )
    }
    if (process.env.NODE_ENV !== 'production') {
      console.log(`✅ Initial schema completed successfully`)
    }
    return
  }
}
