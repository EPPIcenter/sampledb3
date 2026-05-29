import { Database } from 'bun:sqlite'
import { applyInitialSchema } from './apply-initial-schema'
import { getRecordedSchemaVersion, hasSchemaVersionTable } from './schema-evolution'
import { runSqlMigration } from './migration-runner'
import { join } from 'path'
import { resolveMigrationsDirectory } from './migration-runner'

/**
 * One-time reconciliation for operational DB files that predate schema_version.
 */
export function applyLegacyBaselineMigration(sqlite: Database): void {
  if (hasSchemaVersionTable(sqlite) && getRecordedSchemaVersion(sqlite) != null) {
    return
  }

  let needsFullSchema = false

  try {
    const studyTable = sqlite
      .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='study'")
      .get()
    const settingsTable = sqlite
      .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='settings'")
      .get()

    if (!studyTable) {
      const allTables = sqlite
        .prepare("SELECT name FROM sqlite_master WHERE type='table'")
        .all() as Array<{ name: string }>
      if (allTables.length === 0) {
        needsFullSchema = true
      } else {
        if (process.env.NODE_ENV !== 'production') {
          console.warn(`⚠️  Warning: 'study' table not found in database.`)
          console.warn(`   Tables found: ${allTables.map((t) => t.name).join(', ') || 'none'}`)
          console.log(`📝 Running initial schema to ensure schema is complete...`)
        }
        needsFullSchema = true
      }
    } else if (!settingsTable) {
      needsFullSchema = true
      if (process.env.NODE_ENV !== 'production') {
        console.log(`📝 Database schema is incomplete (missing 'settings' table) - running initial schema...`)
      }
    }
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : String(error)
    if (errorMessage.includes('no such file') || errorMessage.includes('ENOENT')) {
      needsFullSchema = true
      if (process.env.NODE_ENV !== 'production') {
        console.log(`📝 Database file does not exist - will create and run initial schema...`)
      }
    } else {
      throw new Error(
        `Failed to check database: ${errorMessage}. This may indicate database corruption or permission issues.`,
      )
    }
  }

  if (needsFullSchema) {
    if (process.env.NODE_ENV !== 'production') {
      console.log(`📝 Applying full initial schema for legacy database...`)
    }
    applyInitialSchema(sqlite)
    if (process.env.NODE_ENV !== 'production') {
      console.log(`✅ Initial schema completed successfully`)
    }
    return
  }

  if (process.env.NODE_ENV !== 'production') {
    console.log(`📝 Applying legacy baseline migration (001)...`)
  }

  const migrationPath = join(resolveMigrationsDirectory(), '001_legacy_baseline.sql')
  runSqlMigration(sqlite, 1, migrationPath)

  const usersTable = sqlite
    .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='users'")
    .get()
  if (usersTable) {
    const userTableInfo = sqlite.prepare('PRAGMA table_info(users)').all() as Array<{ name: string }>
    const hasApprovedAt = userTableInfo.some((col) => col.name === 'approved_at')
    if (!hasApprovedAt) {
      if (process.env.NODE_ENV !== 'production') {
        console.log(`📝 Adding 'approved_at' column to users table...`)
      }
      sqlite.exec('ALTER TABLE users ADD COLUMN approved_at TEXT')
      sqlite.exec("UPDATE users SET approved_at = created WHERE approved_at IS NULL")
    }
  }

  if (process.env.NODE_ENV !== 'production') {
    console.log(`✅ Legacy baseline migration completed`)
  }
}
