import { Database } from 'bun:sqlite'
import { applyInitialSchema } from './apply-initial-schema'
import { applyLegacyBaselineMigration } from './legacy-baseline'
import { backupDatabaseBeforeMigrating } from './migration-backup'
import { ensureLegacyPaperTableForMigration003 } from './migration-preflight'
import { listNumberedMigrations, runSqlMigration } from './migration-runner'

const PAPER_SUBLABEL_MIGRATION_VERSION = 3

/** Canonical schema level; bump when adding numbered deltas under migrations/. */
export const CURRENT_SCHEMA_VERSION = 13

const SCHEMA_VERSION_TABLE = 'schema_version'
const LEGACY_BASELINE_VERSION = 1

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

function listPendingMigrations(fromVersion: number): Array<{ version: number; path: string; basename: string }> {
  if (fromVersion >= CURRENT_SCHEMA_VERSION) {
    return []
  }
  return listNumberedMigrations().filter(
    (migration) =>
      migration.version > fromVersion &&
      migration.version <= CURRENT_SCHEMA_VERSION &&
      // 001 runs only via applyLegacyBaselineMigration for unversioned databases.
      migration.version !== LEGACY_BASELINE_VERSION,
  )
}

function applyPendingMigrations(
  sqlite: Database,
  pending: Array<{ version: number; path: string; basename: string }>,
): void {
  for (const migration of pending) {
    if (migration.version === PAPER_SUBLABEL_MIGRATION_VERSION) {
      ensureLegacyPaperTableForMigration003(sqlite)
    }
    if (process.env.NODE_ENV !== 'production') {
      console.log(`📝 Applying schema migration ${migration.version} (${migration.basename})...`)
    }
    runSqlMigration(sqlite, migration.version, migration.path)
  }
}

export interface EvolveOperationalSchemaOptions {
  /**
   * Copy the database file next to itself (`VACUUM INTO`) before the first migration changes
   * an existing database. Skipped when nothing is pending, for an empty database, and for an
   * in-memory one. If the copy fails, nothing is migrated.
   */
  backupBeforeMigrating?: boolean
}

/**
 * Bring an operational SQLite file to CURRENT_SCHEMA_VERSION.
 */
export function evolveOperationalSchema(sqlite: Database, options: EvolveOperationalSchemaOptions = {}): void {
  const backupIfRequested = (): void => {
    if (options.backupBeforeMigrating) {
      backupDatabaseBeforeMigrating(sqlite, CURRENT_SCHEMA_VERSION)
    }
  }
  const recorded = getRecordedSchemaVersion(sqlite)

  if (recorded != null) {
    if (recorded > CURRENT_SCHEMA_VERSION) {
      throw new Error(
        `Database schema version ${recorded} is newer than this application supports (${CURRENT_SCHEMA_VERSION}).`,
      )
    }
    const pending = listPendingMigrations(recorded)
    if (pending.length > 0) {
      backupIfRequested()
    }
    applyPendingMigrations(sqlite, pending)
    return
  }

  if (isEmptyOperationalDatabase(sqlite)) {
    if (process.env.NODE_ENV !== 'production') {
      console.log(`📝 Database is empty - running initial schema...`)
    }
    applyInitialSchema(sqlite)
    const version = getRecordedSchemaVersion(sqlite)
    if (version == null || version < CURRENT_SCHEMA_VERSION) {
      // A database that was empty a moment ago has nothing to back up.
      applyPendingMigrations(sqlite, listPendingMigrations(version ?? 0))
    }
    const after = getRecordedSchemaVersion(sqlite)
    if (after !== CURRENT_SCHEMA_VERSION) {
      throw new Error(
        `Initial schema must reach schema version ${CURRENT_SCHEMA_VERSION}, got ${after ?? 'missing'}`,
      )
    }
    if (process.env.NODE_ENV !== 'production') {
      console.log(`✅ Initial schema completed successfully`)
    }
    return
  }

  backupIfRequested()
  applyLegacyBaselineMigration(sqlite)
  const afterLegacy = getRecordedSchemaVersion(sqlite)
  if (afterLegacy == null) {
    throw new Error('Legacy baseline migration did not set schema_version')
  }
  applyPendingMigrations(sqlite, listPendingMigrations(afterLegacy))
}
