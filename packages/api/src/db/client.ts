import Database, { type Database as SqliteDatabaseType } from 'better-sqlite3'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import * as schema from './schema'
import { join, resolve } from 'path'
import { fileURLToPath } from 'url'
import { dirname } from 'path'
import { existsSync, readFileSync } from 'fs'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

// Find project root by looking for sampledb_database.sqlite or root package.json
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
        const dbFile = join(currentDir, 'sampledb_database.sqlite')
        if (existsSync(dbFile)) {
          return currentDir
        }
        const packageJson = join(currentDir, 'package.json')
        if (existsSync(packageJson)) {
          try {
            const pkg = JSON.parse(readFileSync(packageJson, 'utf-8'))
            if (pkg.name === 'sampledb') {
              return currentDir
            }
          } catch {}
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
        const dbFile = join(currentDir, 'sampledb_database.sqlite')
        if (existsSync(dbFile)) {
          return currentDir
        }
        const packageJson = join(currentDir, 'package.json')
        if (existsSync(packageJson)) {
          try {
            const pkg = JSON.parse(readFileSync(packageJson, 'utf-8'))
            if (pkg.name === 'sampledb') {
              return currentDir
            }
          } catch {}
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
      const dbFile = join(result, 'sampledb_database.sqlite')
      if (existsSync(dbFile)) {
        return result
      }
    }
  }
  
  // Final fallback
  return resolve(__dirname, '../../..')
}

// Determine database path
let dbPath: string

if (process.env.DATABASE_PATH) {
  // If DATABASE_PATH is set, resolve it (absolute or relative to cwd)
  dbPath = process.env.DATABASE_PATH.startsWith('/') 
    ? process.env.DATABASE_PATH 
    : resolve(process.cwd(), process.env.DATABASE_PATH)
} else {
  // Otherwise, find project root and use database there
  const projectRoot = findProjectRoot()
  dbPath = resolve(projectRoot, 'sampledb_database.sqlite')
}

console.log(`📁 Project root: ${findProjectRoot()}`)
console.log(`📁 Connecting to database at: ${dbPath}`)
console.log(`📁 Database exists: ${existsSync(dbPath)}`)
console.log(`📁 Current working directory: ${process.cwd()}`)
console.log(`📁 __dirname: ${__dirname}`)
console.log(`📁 DATABASE_PATH env: ${process.env.DATABASE_PATH || 'not set'}`)

// If database doesn't exist at resolved path, try absolute path from known location
if (!existsSync(dbPath)) {
  const absolutePath = '/Users/mmurphy/Workspace/sampledb3/sampledb_database.sqlite'
  if (existsSync(absolutePath)) {
    console.log(`⚠️  Database not found at resolved path, using absolute path: ${absolutePath}`)
    dbPath = absolutePath
  }
}

const sqlite = new Database(dbPath)
sqlite.pragma('journal_mode = WAL')

// Verify the database has tables
try {
  const tables = sqlite.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='study'").get()
  if (!tables) {
    console.warn(`⚠️  Warning: 'study' table not found in database.`)
    const allTables = sqlite.prepare("SELECT name FROM sqlite_master WHERE type='table'").all() as Array<{ name: string }>
    console.warn(`   Tables found: ${allTables.map(t => t.name).join(', ') || 'none'}`)
  } else {
    console.log(`✅ Database connected successfully`)
  }
} catch (error: any) {
  console.error(`❌ Error checking database: ${error.message}`)
}

export const db = drizzle(sqlite, { schema })
export const sqliteExport: SqliteDatabaseType = sqlite
export { sqliteExport as sqlite }
export type Database = typeof db
