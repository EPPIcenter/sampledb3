import { Database } from 'bun:sqlite'
import { drizzle } from 'drizzle-orm/bun-sqlite'
import * as schema from '../../db/schema'
import type { Database as DrizzleDatabase } from '../../db/client'
import { applyInitialSchema, dropAllUserTables } from '../../db/apply-initial-schema'

/**
 * Creates an in-memory SQLite database for testing.
 * Assigns a unique _id so defaults/settings cache keys are distinct across test DBs.
 */
export function createTestDatabase(): { db: DrizzleDatabase; sqlite: Database } {
  const sqlite = new Database(':memory:')
  sqlite.exec('PRAGMA journal_mode = WAL')

  const db = drizzle(sqlite, { schema }) as DrizzleDatabase & { _id?: string }
  db._id = `test-db-${crypto.randomUUID()}`

  return { db, sqlite }
}

/**
 * Sets up a test database using the same initial_schema.sql snapshot as production.
 */
export async function setupTestDatabase(): Promise<{ db: DrizzleDatabase; sqlite: Database }> {
  const { db, sqlite } = createTestDatabase()
  applyInitialSchema(sqlite)
  return { db, sqlite }
}

/**
 * Cleans up test database
 */
export function cleanupTestDatabase(sqlite: Database) {
  sqlite.close()
}

/**
 * Reset the test database by dropping all tables and reapplying initial_schema.sql
 */
export async function resetTestDatabase(sqlite: Database, _db: DrizzleDatabase) {
  dropAllUserTables(sqlite)
  applyInitialSchema(sqlite)
}
