import { Database } from 'bun:sqlite'
import { drizzle } from 'drizzle-orm/bun-sqlite'
import { migrate } from 'drizzle-orm/bun-sqlite/migrator'
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
          } catch { }
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
          } catch { }
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
export function createDatabase(dbPath?: string): { db: ReturnType<typeof drizzle<typeof schema>>; sqlite: Database } {
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

  const sqlite = new Database(resolvedPath)
  sqlite.exec('PRAGMA journal_mode = WAL')

  // Check if database has tables and run migrations if needed
  let needsMigration = false
  try {
    const studyTable = sqlite.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='study'").get()
    const settingsTable = sqlite.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='settings'").get()
    
    if (!studyTable) {
      const allTables = sqlite.prepare("SELECT name FROM sqlite_master WHERE type='table'").all() as Array<{ name: string }>
      const tableCount = allTables.length
      if (tableCount === 0) {
        needsMigration = true
        console.log(`📝 Database is empty - running migrations to initialize schema...`)
      } else {
        console.warn(`⚠️  Warning: 'study' table not found in database.`)
        console.warn(`   Tables found: ${allTables.map(t => t.name).join(', ') || 'none'}`)
        // Still try to run migrations in case schema is incomplete
        needsMigration = true
        console.log(`📝 Running migrations to ensure schema is up to date...`)
      }
    } else if (!settingsTable) {
      // Database has some tables but is missing critical ones like 'settings'
      // This indicates migrations are incomplete
      needsMigration = true
      console.log(`📝 Database schema is incomplete (missing 'settings' table) - running migrations...`)
    } else {
      console.log(`✅ Database connected successfully`)
    }
  } catch (error: any) {
    // Distinguish between expected cases (empty DB, missing tables) and actual errors
    // If the error is about the database file not existing, that's expected for new setups
    // If it's a different error (corruption, permissions, etc.), throw it
    const errorMessage = error?.message || String(error)
    
    if (errorMessage.includes('no such file') || errorMessage.includes('ENOENT')) {
      // Database file doesn't exist - this is expected for new setups
      needsMigration = true
      console.log(`📝 Database file does not exist - will create and run migrations...`)
    } else {
      // This is an unexpected error - throw it instead of silently assuming migrations needed
      console.error(`❌ Error checking database: ${errorMessage}`)
      throw new Error(`Failed to check database: ${errorMessage}. This may indicate database corruption or permission issues.`)
    }
  }

  // Create drizzle instance for migrations
  const db = drizzle(sqlite, { schema })

  // Run migrations if needed
  if (needsMigration) {
    try {
      // Find migrations folder
      // This file is in: packages/api/src/db/client.ts (or dist/db/client.js when compiled)
      // Migrations are in: packages/api/drizzle
      // Find the API package root by looking for package.json with name '@sampledb/api'
      let migrationsFolder: string | null = null
      let currentDir = __dirname
      
      // Search up the directory tree to find the API package root
      for (let i = 0; i < 5; i++) {
        const packageJson = join(currentDir, 'package.json')
        if (existsSync(packageJson)) {
          try {
            const pkg = JSON.parse(readFileSync(packageJson, 'utf-8'))
            if (pkg.name === '@sampledb/api') {
              migrationsFolder = join(currentDir, 'drizzle')
              break
            }
          } catch { }
        }
        const parent = dirname(currentDir)
        if (parent === currentDir) break
        currentDir = parent
      }
      
      // Fallback: try relative path (works when running from source)
      if (!migrationsFolder || !existsSync(migrationsFolder)) {
        migrationsFolder = join(__dirname, '../../drizzle')
      }
      
      if (!migrationsFolder || !existsSync(migrationsFolder)) {
        throw new Error(`Migrations folder not found. Tried: ${migrationsFolder}`)
      }
      
      migrate(db, { migrationsFolder })
      console.log(`✅ Migrations completed successfully`)
    } catch (error: any) {
      console.error(`❌ Error running migrations: ${error.message}`)
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
