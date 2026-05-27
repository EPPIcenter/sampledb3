import { Database as SQLiteDatabase } from 'bun:sqlite'
import { drizzle } from 'drizzle-orm/bun-sqlite'
import * as schema from './schema'
import { isAbsolute, join, resolve } from 'path'
import { fileURLToPath } from 'url'
import { dirname } from 'path'
import { existsSync, readFileSync } from 'fs'
import { applyInitialSchema } from './apply-initial-schema'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

/**
 * Repo root (package name `sampledb`). Used to resolve relative DATABASE_PATH —
 * `bun --filter @sampledb/api dev` runs with cwd `packages/api`, so paths must
 * not be resolved with `process.cwd()` alone.
 */
function getMonorepoRoot(): string {
  // Try multiple strategies to find the project root
  const strategies = [
    // Strategy 1: Go up from current file location (works for both src and dist)
    () => {
      let currentDir = __dirname
      for (let i = 0; i < 5; i++) {
        const packageJson = join(currentDir, 'package.json')
        if (existsSync(packageJson)) {
          try {
            const pkg = JSON.parse(readFileSync(packageJson, 'utf-8'))
            if (pkg.name === 'sampledb') {
              return currentDir
            }
          } catch (error) {
            // Expected: package.json may be unreadable or malformed during project root search
            // Log in development mode for debugging, but don't throw - this is expected behavior
            if (process.env.NODE_ENV === 'development') {
              console.debug(`Could not parse ${packageJson} during project root detection:`, error)
            }
          }
        }
        const parent = dirname(currentDir)
        if (parent === currentDir) break
        currentDir = parent
      }
      return null
    },
    // Strategy 2: Use process.cwd() and go up if needed (when running from packages/api)
    () => {
      let currentDir = process.cwd()
      for (let i = 0; i < 3; i++) {
        const packageJson = join(currentDir, 'package.json')
        if (existsSync(packageJson)) {
          try {
            const pkg = JSON.parse(readFileSync(packageJson, 'utf-8'))
            if (pkg.name === 'sampledb') {
              return currentDir
            }
          } catch (error) {
            // Expected: package.json may be unreadable or malformed during project root search
            // Log in development mode for debugging, but don't throw - this is expected behavior
            if (process.env.NODE_ENV === 'development') {
              console.debug(`Could not parse ${packageJson} during project root detection:`, error)
            }
          }
        }
        const parent = dirname(currentDir)
        if (parent === currentDir) break
        currentDir = parent
      }
      return null
    },
    // Strategy 3: Hardcoded fallback - go up 3 levels from source file
    () => resolve(__dirname, '../../..'),
  ]

  for (const strategy of strategies) {
    const result = strategy()
    if (result) {
      return result
    }
  }

  // Final fallback
  return resolve(__dirname, '../../..')
}

function resolveDatabaseFilePath(relativeOrAbsolute: string): string {
  return isAbsolute(relativeOrAbsolute) ? relativeOrAbsolute : resolve(getMonorepoRoot(), relativeOrAbsolute)
}

/**
 * Create a database connection instance
 * @param dbPath - Optional database path. If not provided, uses DATABASE_PATH env var or default dev database
 * @returns Object with db (drizzle instance) and sqlite (raw Database instance)
 */
export function createDatabase(dbPath?: string): { db: ReturnType<typeof drizzle<typeof schema>>; sqlite: SQLiteDatabase } {
  // Determine database path
  let resolvedPath: string

  if (dbPath) {
    resolvedPath = resolveDatabaseFilePath(dbPath)
  } else if (process.env.DATABASE_PATH) {
    resolvedPath = resolveDatabaseFilePath(process.env.DATABASE_PATH)
  } else {
    // Default: use empty dev database in project root
    // This allows testing setup functionality with a fresh empty database
    resolvedPath = resolve(getMonorepoRoot(), 'sampledb_dev.sqlite')
  }

  if (process.env.NODE_ENV !== 'production') {
    console.log(`📁 Monorepo root: ${getMonorepoRoot()}`)
    console.log(`📁 process.cwd(): ${process.cwd()}`)
    console.log(`📁 Connecting to database at: ${resolvedPath}`)
    console.log(`📁 Database exists: ${existsSync(resolvedPath)}`)
    console.log(`📁 DATABASE_PATH env: ${process.env.DATABASE_PATH || 'not set (using default: sampledb_dev.sqlite)'}`)
  }

  const sqlite = new SQLiteDatabase(resolvedPath)
  sqlite.exec('PRAGMA journal_mode = WAL')

  // Check if database has tables and run initial schema if needed
  let needsSchema = false
  try {
    const studyTable = sqlite.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='study'").get()
    const settingsTable = sqlite.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='settings'").get()
    const errorLogsTable = sqlite.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='error_logs'").get()
    
    if (!studyTable) {
      const allTables = sqlite.prepare("SELECT name FROM sqlite_master WHERE type='table'").all() as Array<{ name: string }>
      const tableCount = allTables.length
      if (tableCount === 0) {
        needsSchema = true
        if (process.env.NODE_ENV !== 'production') {
          console.log(`📝 Database is empty - running initial schema...`)
        }
      } else {
        if (process.env.NODE_ENV !== 'production') {
          console.warn(`⚠️  Warning: 'study' table not found in database.`)
          console.warn(`   Tables found: ${allTables.map(t => t.name).join(', ') || 'none'}`)
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
    } else {
      console.log(`✅ Database connected`)
    }

    // Migration: add approved_at to users if missing (for self-registration approval flow)
    const usersTable = sqlite.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='users'").get()
    if (usersTable) {
      const userTableInfo = sqlite.prepare("PRAGMA table_info(users)").all() as Array<{ name: string }>
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
      throw new Error(`Failed to check database: ${errorMessage}. This may indicate database corruption or permission issues.`)
    }
  }

  const db = drizzle(sqlite, { schema })

  if (needsSchema) {
    try {
      applyInitialSchema(sqlite)
      if (process.env.NODE_ENV !== 'production') {
        console.log(`✅ Initial schema completed successfully`)
      }
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error)
      console.error(`❌ Error running initial schema: ${message}`)
      throw error
    }
  }

  return { db, sqlite }
}

// Create default database instance
// Note: Many utility functions and lib files still use this directly
// Consider migrating to dependency injection in the future
const { db, sqlite } = createDatabase()

export { db, sqlite }
export type Database = typeof db
