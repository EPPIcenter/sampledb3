import { Database as SQLiteDatabase } from 'bun:sqlite'
import { drizzle } from 'drizzle-orm/bun-sqlite'
import { existsSync, readFileSync } from 'fs'
import { dirname, isAbsolute, join, resolve } from 'path'
import { fileURLToPath } from 'url'
import * as schema from './schema'
import { evolveOperationalSchema } from './schema-evolution'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

/**
 * Repo root (package name `sampledb`). Used to resolve relative DATABASE_PATH —
 * `bun --filter @sampledb/api dev` runs with cwd `packages/api`, so paths must
 * not be resolved with `process.cwd()` alone.
 */
export function getMonorepoRoot(): string {
  const strategies = [
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
    () => resolve(__dirname, '../../..'),
  ]

  for (const strategy of strategies) {
    const result = strategy()
    if (result) {
      return result
    }
  }

  return resolve(__dirname, '../../..')
}

function resolveDatabaseFilePath(relativeOrAbsolute: string): string {
  if (relativeOrAbsolute === ':memory:') {
    return ':memory:'
  }
  return isAbsolute(relativeOrAbsolute) ? relativeOrAbsolute : resolve(getMonorepoRoot(), relativeOrAbsolute)
}

export type OperationalDatabase = ReturnType<typeof drizzle<typeof schema>>

/**
 * Open the operational SQLite database, evolve schema, return Drizzle + raw handles.
 */
export function openOperationalDatabase(dbPath?: string): {
  db: OperationalDatabase
  sqlite: SQLiteDatabase
} {
  let resolvedPath: string

  if (dbPath) {
    resolvedPath = resolveDatabaseFilePath(dbPath)
  } else if (process.env.DATABASE_PATH) {
    resolvedPath = resolveDatabaseFilePath(process.env.DATABASE_PATH)
  } else {
    resolvedPath = resolve(getMonorepoRoot(), 'sampledb_dev.sqlite')
  }

  if (process.env.NODE_ENV !== 'production') {
    console.log(`📁 Monorepo root: ${getMonorepoRoot()}`)
    console.log(`📁 process.cwd(): ${process.cwd()}`)
    console.log(`📁 Connecting to database at: ${resolvedPath}`)
    console.log(`📁 Database exists: ${resolvedPath === ':memory:' ? true : existsSync(resolvedPath)}`)
    console.log(`📁 DATABASE_PATH env: ${process.env.DATABASE_PATH || 'not set (using default: sampledb_dev.sqlite)'}`)
  }

  const sqlite = new SQLiteDatabase(resolvedPath)
  sqlite.exec('PRAGMA journal_mode = WAL')

  try {
    evolveOperationalSchema(sqlite)
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error)
    console.error(`❌ Error preparing database: ${message}`)
    throw error
  }

  const db = drizzle(sqlite, { schema })
  return { db, sqlite }
}

export type Database = OperationalDatabase
