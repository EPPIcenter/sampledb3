/**
 * Transactions that stay open across `await` on the one shared bun:sqlite connection.
 *
 * A transaction belongs to the async context that opened it. A helper called from inside that
 * context (truly nested) runs in a savepoint of the open transaction. A helper called from any
 * other context, such as another request, waits for the connection's lock and then opens its
 * own transaction, so two requests never share one. See the db README for what the lock does
 * not cover.
 */
import { AsyncLocalStorage } from 'node:async_hooks'
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

/** Serializes transactions on one connection, first come first served. */
class ConnectionLock {
  private tail: Promise<void> = Promise.resolve()

  async acquire(): Promise<() => void> {
    let release!: () => void
    const released = new Promise<void>((resolve) => (release = resolve))
    const previous = this.tail
    this.tail = previous.then(() => released)
    await previous
    return release
  }
}

const locks = new WeakMap<SQLiteDatabase, ConnectionLock>()

function lockFor(sqlite: SQLiteDatabase): ConnectionLock {
  let lock = locks.get(sqlite)
  if (!lock) {
    lock = new ConnectionLock()
    locks.set(sqlite, lock)
  }
  return lock
}

/** The transaction the current async context opened, while it is still open. */
type OpenTransaction = { sqlite: SQLiteDatabase; open: boolean }

const currentTransaction = new AsyncLocalStorage<OpenTransaction>()

function joinedTransaction(sqlite: SQLiteDatabase): OpenTransaction | undefined {
  const current = currentTransaction.getStore()
  return current && current.open && current.sqlite === sqlite ? current : undefined
}

/** Read fresh each time: statements run inside `fn` can end the transaction. */
function inTransaction(sqlite: SQLiteDatabase): boolean {
  return sqlite.inTransaction
}

let savepointCounter = 0

async function inSavepoint<T>(
  sqlite: SQLiteDatabase,
  keep: boolean,
  fn: () => Promise<T>,
): Promise<T> {
  const name = `sp_${++savepointCounter}`
  sqlite.exec(`SAVEPOINT ${name}`)
  let result: T
  try {
    result = await fn()
  } catch (error) {
    sqlite.exec(`ROLLBACK TO ${name}`)
    sqlite.exec(`RELEASE ${name}`)
    throw error
  }
  if (!keep) sqlite.exec(`ROLLBACK TO ${name}`)
  sqlite.exec(`RELEASE ${name}`)
  return result
}

/**
 * Run `fn` in a transaction of its own, then commit (`keep`) or roll back. Nested calls from
 * the same async context use a savepoint; calls from other contexts wait their turn.
 */
async function runTransaction<T>(
  sqlite: SQLiteDatabase,
  keep: boolean,
  fn: () => Promise<T>,
): Promise<T> {
  if (joinedTransaction(sqlite)) return inSavepoint(sqlite, keep, fn)

  const release = await lockFor(sqlite).acquire()
  try {
    if (inTransaction(sqlite)) {
      // Opened outside these helpers (raw BEGIN): it is not ours to commit, so nest in it.
      const transaction: OpenTransaction = { sqlite, open: true }
      try {
        return await currentTransaction.run(transaction, () => inSavepoint(sqlite, keep, fn))
      } finally {
        transaction.open = false
      }
    }

    const transaction: OpenTransaction = { sqlite, open: true }
    sqlite.exec('BEGIN')
    let result: T
    try {
      result = await currentTransaction.run(transaction, fn)
    } catch (error) {
      transaction.open = false
      if (inTransaction(sqlite)) sqlite.exec('ROLLBACK')
      throw error
    }
    transaction.open = false
    sqlite.exec(keep ? 'COMMIT' : 'ROLLBACK')
    return result
  } finally {
    release()
  }
}

/**
 * Run writes in one SQLite transaction that stays open across `await`, and commit them.
 *
 * Drizzle's bun-sqlite `db.transaction(async () => ...)` commits when the callback first
 * yields (it does not await the returned Promise). Called inside another helper's `fn`, this
 * runs in a savepoint: if `fn` throws, only its own writes roll back.
 */
export async function withWriteTransaction<T>(
  database: Database,
  fn: (database: Database) => Promise<T>,
): Promise<T> {
  const sqlite = sqliteClientOf(database)
  if (!sqlite) {
    return fn(database)
  }
  return runTransaction(sqlite, true, () => fn(database))
}

/**
 * Run writes and always roll them back, returning what `fn` returned. Use it to check
 * that a write would succeed by performing it. Inside an open transaction it rolls back
 * to a savepoint, leaving the outer transaction's earlier writes in place.
 */
export async function withRolledBackTransaction<T>(
  database: Database,
  fn: (database: Database) => Promise<T>,
): Promise<T> {
  const sqlite = sqliteClientOf(database)
  if (!sqlite) {
    throw new Error('withRolledBackTransaction needs a bun:sqlite database')
  }
  return runTransaction(sqlite, false, () => fn(database))
}
