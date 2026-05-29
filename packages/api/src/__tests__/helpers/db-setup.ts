import type { Database as DrizzleDatabase } from '../../db/client'
import { openOperationalDatabase } from '../../db/client'
import { CURRENT_SCHEMA_VERSION, getRecordedSchemaVersion } from '../../db/schema-evolution'
import { dropAllUserTables } from '../../db/apply-initial-schema'
import { evolveOperationalSchema } from '../../db/schema-evolution'
import type { Database } from 'bun:sqlite'

/**
 * Opens an in-memory operational database the same way production does.
 * Assigns a unique _id so defaults/settings cache keys are distinct across test DBs.
 */
export function createTestDatabase(): { db: DrizzleDatabase; sqlite: Database } {
  const { db, sqlite } = openOperationalDatabase(':memory:')
  const typedDb = db as DrizzleDatabase & { _id?: string }
  typedDb._id = `test-db-${crypto.randomUUID()}`
  return { db: typedDb, sqlite }
}

/**
 * Sets up a test database using the production open + schema evolution path.
 */
export async function setupTestDatabase(): Promise<{ db: DrizzleDatabase; sqlite: Database }> {
  return createTestDatabase()
}

/**
 * Cleans up test database
 */
export function cleanupTestDatabase(sqlite: Database) {
  sqlite.close()
}

/**
 * Reset the test database by dropping all tables and re-running schema evolution.
 */
export async function resetTestDatabase(sqlite: Database, _db: DrizzleDatabase) {
  dropAllUserTables(sqlite)
  evolveOperationalSchema(sqlite)
}

export { CURRENT_SCHEMA_VERSION, getRecordedSchemaVersion }
