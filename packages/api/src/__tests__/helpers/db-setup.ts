import { Database } from 'bun:sqlite'
import { drizzle } from 'drizzle-orm/bun-sqlite'
import * as schema from '../../db/schema'
import { migrate } from 'drizzle-orm/bun-sqlite/migrator'
import type { Database as DrizzleDatabase } from '../../db/client'
import { join } from 'path'
import { fileURLToPath } from 'url'
import { dirname } from 'path'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

/**
 * Creates an in-memory SQLite database for testing
 */
export function createTestDatabase(): { db: DrizzleDatabase; sqlite: Database } {
  const sqlite = new Database(':memory:')
  sqlite.exec('PRAGMA journal_mode = WAL')

  const db = drizzle(sqlite, { schema })

  return { db, sqlite }
}

/**
 * Sets up a test database with full schema using Drizzle migrations
 * This ensures the test database matches the production schema
 */
export async function setupTestDatabase(): Promise<{ db: DrizzleDatabase; sqlite: Database }> {
  const { db, sqlite } = createTestDatabase()

  try {
    // Apply migrations from the drizzle folder
    // The drizzle folder is at the package root: packages/api/drizzle
    // This file is in: packages/api/src/__tests__/helpers/db-setup.ts
    const migrationsFolder = join(__dirname, '../../../drizzle')

    migrate(db, { migrationsFolder })
  } catch (error) {
    console.error('Error setting up test database schema:', error)
    throw error
  }

  return { db, sqlite }
}

/**
 * Cleans up test database
 */
export function cleanupTestDatabase(sqlite: Database) {
  sqlite.close()
}

/**
 * Reset the test database by dropping all tables and recreating schema
 */
export async function resetTestDatabase(sqlite: Database, db: DrizzleDatabase) {
  // Get all table names
  const tables = sqlite.prepare(`
    SELECT name FROM sqlite_master 
    WHERE type='table' AND name NOT LIKE 'sqlite_%'
  `).all() as Array<{ name: string }>

  // Drop all tables
  for (const table of tables) {
    sqlite.exec(`DROP TABLE IF EXISTS ${table.name}`)
  }

  // Re-run migrations
  const migrationsFolder = join(__dirname, '../../../drizzle')
  migrate(db, { migrationsFolder })
}

