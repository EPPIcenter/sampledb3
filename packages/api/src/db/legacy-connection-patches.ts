import { Database } from 'bun:sqlite'
import { applyInitialSchema } from './apply-initial-schema'
import { hasSchemaVersionTable } from './schema-evolution'

/**
 * Connection-time patches for databases that predate schema_version.
 * Replaced by 001_legacy_baseline in slice 2; kept until then.
 */
export function applyLegacyConnectionPatches(sqlite: Database): void {
  if (hasSchemaVersionTable(sqlite)) {
    if (process.env.NODE_ENV !== 'production') {
      console.log(`✅ Database connected`)
    }
    return
  }

  let needsSchema = false
  try {
    const studyTable = sqlite
      .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='study'")
      .get()
    const settingsTable = sqlite
      .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='settings'")
      .get()
    const errorLogsTable = sqlite
      .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='error_logs'")
      .get()

    if (!studyTable) {
      const allTables = sqlite
        .prepare("SELECT name FROM sqlite_master WHERE type='table'")
        .all() as Array<{ name: string }>
      const tableCount = allTables.length
      if (tableCount === 0) {
        needsSchema = true
      } else {
        if (process.env.NODE_ENV !== 'production') {
          console.warn(`⚠️  Warning: 'study' table not found in database.`)
          console.warn(`   Tables found: ${allTables.map((t) => t.name).join(', ') || 'none'}`)
          console.log(`📝 Running initial schema to ensure schema is complete...`)
        }
        needsSchema = true
      }
    } else if (!settingsTable) {
      needsSchema = true
      if (process.env.NODE_ENV !== 'production') {
        console.log(`📝 Database schema is incomplete (missing 'settings' table) - running initial schema...`)
      }
    } else if (!errorLogsTable) {
      if (process.env.NODE_ENV !== 'production') {
        console.log(`📝 Database missing 'error_logs' table - creating it...`)
      }
      sqlite.exec(`
        CREATE TABLE IF NOT EXISTS error_logs (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          timestamp TEXT NOT NULL DEFAULT (datetime('now')),
          source TEXT NOT NULL,
          level TEXT NOT NULL,
          message TEXT NOT NULL,
          error_code TEXT,
          stack TEXT,
          context TEXT,
          user_id INTEGER,
          url TEXT,
          user_agent TEXT,
          resolved INTEGER NOT NULL DEFAULT 0,
          resolved_at TEXT,
          resolved_by INTEGER
        )
      `)
      sqlite.exec('CREATE INDEX IF NOT EXISTS error_logs_timestamp_idx ON error_logs(timestamp)')
      sqlite.exec('CREATE INDEX IF NOT EXISTS error_logs_source_idx ON error_logs(source)')
      sqlite.exec('CREATE INDEX IF NOT EXISTS error_logs_level_idx ON error_logs(level)')
      sqlite.exec('CREATE INDEX IF NOT EXISTS error_logs_resolved_idx ON error_logs(resolved)')
    } else if (process.env.NODE_ENV !== 'production') {
      console.log(`✅ Database connected`)
    }

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
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : String(error)
    if (errorMessage.includes('no such file') || errorMessage.includes('ENOENT')) {
      needsSchema = true
      if (process.env.NODE_ENV !== 'production') {
        console.log(`📝 Database file does not exist - will create and run initial schema...`)
      }
    } else {
      console.error(`❌ Error checking database: ${errorMessage}`)
      throw new Error(
        `Failed to check database: ${errorMessage}. This may indicate database corruption or permission issues.`,
      )
    }
  }

  if (needsSchema) {
    applyInitialSchema(sqlite)
    if (process.env.NODE_ENV !== 'production') {
      console.log(`✅ Initial schema completed successfully`)
    }
  }
}
