import { Database as SQLiteDatabase } from 'bun:sqlite'
import { drizzle } from 'drizzle-orm/bun-sqlite'
import * as schema from './schema'
import { join, resolve } from 'path'
import { fileURLToPath } from 'url'
import { dirname } from 'path'
import { existsSync, readFileSync } from 'fs'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

// Find project root by looking for root package.json
function findProjectRoot(): string {
  // If DATABASE_PATH is set, use its directory as project root
  if (process.env.DATABASE_PATH) {
    // Resolve relative paths from current working directory
    const dbPath = process.env.DATABASE_PATH.startsWith('/')
      ? process.env.DATABASE_PATH
      : resolve(process.cwd(), process.env.DATABASE_PATH)
    return dirname(dbPath)
  }

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

/**
 * Create a database connection instance
 * @param dbPath - Optional database path. If not provided, uses DATABASE_PATH env var or default dev database
 * @returns Object with db (drizzle instance) and sqlite (raw Database instance)
 */
export function createDatabase(dbPath?: string): { db: ReturnType<typeof drizzle<typeof schema>>; sqlite: SQLiteDatabase } {
  // Determine database path
  let resolvedPath: string

  if (dbPath) {
    // If path is provided, resolve it (absolute or relative to cwd)
    resolvedPath = dbPath.startsWith('/')
      ? dbPath
      : resolve(process.cwd(), dbPath)
  } else if (process.env.DATABASE_PATH) {
    // If DATABASE_PATH is set, resolve it (absolute or relative to cwd)
    resolvedPath = process.env.DATABASE_PATH.startsWith('/')
      ? process.env.DATABASE_PATH
      : resolve(process.cwd(), process.env.DATABASE_PATH)
  } else {
    // Default: use empty dev database in project root
    // This allows testing setup functionality with a fresh empty database
    const projectRoot = findProjectRoot()
    resolvedPath = resolve(projectRoot, 'sampledb_dev.sqlite')
  }

  console.log(`📁 Project root: ${findProjectRoot()}`)
  console.log(`📁 Connecting to database at: ${resolvedPath}`)
  console.log(`📁 Database exists: ${existsSync(resolvedPath)}`)
  console.log(`📁 DATABASE_PATH env: ${process.env.DATABASE_PATH || 'not set (using default: sampledb_dev.sqlite)'}`)

  const sqlite = new SQLiteDatabase(resolvedPath)
  sqlite.exec('PRAGMA journal_mode = WAL')

  // Check if database has tables and run initial schema if needed
  let needsSchema = false
  try {
    const studyTable = sqlite.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='study'").get()
    const settingsTable = sqlite.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='settings'").get()
    
    if (!studyTable) {
      const allTables = sqlite.prepare("SELECT name FROM sqlite_master WHERE type='table'").all() as Array<{ name: string }>
      const tableCount = allTables.length
      if (tableCount === 0) {
        needsSchema = true
        console.log(`📝 Database is empty - running initial schema...`)
      } else {
        console.warn(`⚠️  Warning: 'study' table not found in database.`)
        console.warn(`   Tables found: ${allTables.map(t => t.name).join(', ') || 'none'}`)
        needsSchema = true
        console.log(`📝 Running initial schema to ensure schema is complete...`)
      }
    } else if (!settingsTable) {
      needsSchema = true
      console.log(`📝 Database schema is incomplete (missing 'settings' table) - running initial schema...`)
    } else {
      console.log(`✅ Database connected successfully`)
    }
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : String(error)
    if (errorMessage.includes('no such file') || errorMessage.includes('ENOENT')) {
      needsSchema = true
      console.log(`📝 Database file does not exist - will create and run initial schema...`)
    } else {
      console.error(`❌ Error checking database: ${errorMessage}`)
      throw new Error(`Failed to check database: ${errorMessage}. This may indicate database corruption or permission issues.`)
    }
  }

  const db = drizzle(sqlite, { schema })

  if (needsSchema) {
    let schemaPath: string | null = null
    let currentDir = __dirname
    const pathsTried: string[] = []

    for (let i = 0; i < 5; i++) {
      const packageJson = join(currentDir, 'package.json')
      if (existsSync(packageJson)) {
        try {
          const pkg = JSON.parse(readFileSync(packageJson, 'utf-8'))
          if (pkg.name === '@sampledb/api') {
            const candidate = join(currentDir, 'initial_schema.sql')
            pathsTried.push(candidate)
            if (existsSync(candidate)) {
              schemaPath = candidate
              break
            }
          }
        } catch {
          // ignore
        }
      }
      const parent = dirname(currentDir)
      if (parent === currentDir) break
      currentDir = parent
    }

    if (!schemaPath) {
      const fallback = join(__dirname, '../../initial_schema.sql')
      pathsTried.push(fallback)
      if (existsSync(fallback)) schemaPath = fallback
    }

    if (!schemaPath) {
      throw new Error(`initial_schema.sql not found. Tried: ${pathsTried.join(', ')}`)
    }

    try {
      const sql = readFileSync(schemaPath, 'utf-8')
      const statements = sql.split('--> statement-breakpoint').map((s) => s.trim()).filter(Boolean)
      for (const statement of statements) {
        if (statement.length > 0) {
          sqlite.exec(statement)
        }
      }
      console.log(`✅ Initial schema completed successfully`)
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
