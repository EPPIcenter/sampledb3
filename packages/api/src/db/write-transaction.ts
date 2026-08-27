import type { Database as SQLiteDatabase } from 'bun:sqlite'
import type { Database } from './client'

function sqliteClientOf(database: object): SQLiteDatabase | undefined {
  if (!('$client' in database)) return undefined
  const client = database.$client
  if (
    client &&
    typeof client === 'object' &&
    'exec' in client &&
    typeof client.exec === 'function'
  ) {
    return client as SQLiteDatabase
  }
  return undefined
}

function isAlreadyInTransactionMessage(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error)
  return message.includes('within a transaction')
}

/**
 * Run writes in one SQLite transaction that stays open across `await`.
 *
 * Drizzle's bun-sqlite `db.transaction(async () => ...)` commits when the
 * callback first yields (it does not await the returned Promise). Callers
 * already inside a transaction run `fn` as-is.
 */
export async function withWriteTransaction<T>(
  database: Database,
  fn: (database: Database) => Promise<T>,
): Promise<T> {
  const sqlite = sqliteClientOf(database)
  if (!sqlite) {
    return fn(database)
  }

  try {
    sqlite.exec('BEGIN')
  } catch (error) {
    if (isAlreadyInTransactionMessage(error)) {
      return fn(database)
    }
    throw error
  }

  try {
    const result = await fn(database)
    sqlite.exec('COMMIT')
    return result
  } catch (error) {
    try {
      sqlite.exec('ROLLBACK')
    } catch {
      // Connection may already have left the transaction.
    }
    throw error
  }
}
