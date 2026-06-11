import type { ExtractTablesWithRelations } from 'drizzle-orm'
import type { SQLiteTransaction } from 'drizzle-orm/sqlite-core'
import type { Database } from '../db/client'
import type * as schema from '../db/schema'

/**
 * A handle that accepts either the top-level database or an open transaction,
 * so resolution/persistence helpers can run inside or outside a transaction.
 */
export type DatabaseOrTransaction =
  | Database
  | SQLiteTransaction<'sync', void, typeof schema, ExtractTablesWithRelations<typeof schema>>
