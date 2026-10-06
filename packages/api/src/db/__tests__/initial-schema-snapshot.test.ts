import { describe, it, expect, afterAll } from 'vitest'
import { Database } from 'bun:sqlite'
import { is } from 'drizzle-orm'
import { SQLiteTable, getTableConfig } from 'drizzle-orm/sqlite-core'
import * as schema from '../schema'
import { applyInitialSchema } from '../apply-initial-schema'
import { CURRENT_SCHEMA_VERSION, getRecordedSchemaVersion } from '../schema-evolution'

/**
 * New installs get initial_schema.sql and nothing else when its version is current,
 * so the snapshot alone must hold every table and column in schema.ts.
 */
describe('initial_schema.sql snapshot', () => {
  const sqlite = new Database(':memory:')
  applyInitialSchema(sqlite)
  afterAll(() => sqlite.close())

  const drizzleTables = Object.values(schema)
    .filter((value): value is SQLiteTable => is(value, SQLiteTable))
    .map((table) => getTableConfig(table))

  it('records the current schema version', () => {
    expect(getRecordedSchemaVersion(sqlite)).toBe(CURRENT_SCHEMA_VERSION)
  })

  it('creates every table and column defined in schema.ts', () => {
    const missing: string[] = []
    for (const { name, columns } of drizzleTables) {
      const snapshotColumns = new Set(
        sqlite
          .query<{ name: string }, []>(`SELECT name FROM pragma_table_info('${name}')`)
          .all()
          .map((row) => row.name),
      )
      if (snapshotColumns.size === 0) {
        missing.push(`table ${name}`)
        continue
      }
      for (const column of columns) {
        if (!snapshotColumns.has(column.name)) missing.push(`column ${name}.${column.name}`)
      }
    }
    // Fix by refreshing initial_schema.sql (step 6 in src/db/README.md).
    expect(missing).toEqual([])
  })

  it('finds the schema.ts tables', () => {
    expect(drizzleTables.length).toBeGreaterThan(20)
  })
})
