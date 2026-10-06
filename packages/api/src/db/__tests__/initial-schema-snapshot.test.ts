import { describe, it, expect, afterAll } from 'vitest'
import { Database } from 'bun:sqlite'
import { readFileSync } from 'fs'
import { dirname, join } from 'path'
import { fileURLToPath } from 'url'
import { is } from 'drizzle-orm'
import { SQLiteTable, getTableConfig } from 'drizzle-orm/sqlite-core'
import * as schema from '../schema'
import { applyInitialSchema } from '../apply-initial-schema'
import { splitSqlStatements } from '../migration-runner'
import { CURRENT_SCHEMA_VERSION, evolveOperationalSchema, getRecordedSchemaVersion } from '../schema-evolution'

/** initial_schema.sql as of schema version 1, the first versioned snapshot. Never edit it. */
const VERSION_1_SNAPSHOT = join(dirname(fileURLToPath(import.meta.url)), 'fixtures', 'initial_schema_v1.sql')

/** A version 1 install brought to the current version by the numbered migrations. */
function openMigratedDatabase(): Database {
  const sqlite = new Database(':memory:')
  for (const statement of splitSqlStatements(readFileSync(VERSION_1_SNAPSHOT, 'utf-8'))) {
    sqlite.exec(statement)
  }
  evolveOperationalSchema(sqlite)
  return sqlite
}

const normaliseSql = (sql: string | null) => sql?.replace(/\s+/g, ' ').replace(/ IF NOT EXISTS/i, '').trim() ?? null

/**
 * Table shape from PRAGMA output, normalised so that two databases with the same schema compare
 * equal however they were built: columns and keys are sorted (ALTER TABLE ADD COLUMN appends),
 * and SQLite's generated index names give way to their columns.
 */
function describeSchema(sqlite: Database) {
  const tables = sqlite
    .query<{ name: string }, []>(
      `SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name`,
    )
    .all()
    .map(({ name }) => name)

  return Object.fromEntries(
    tables.map((table) => {
      const columns = sqlite
        .query<{ name: string; type: string; notnull: number; dflt_value: string | null; pk: number }, []>(
          `SELECT name, type, "notnull", dflt_value, pk FROM pragma_table_info('${table}')`,
        )
        .all()
        .map((column) => ({ ...column, type: column.type.toUpperCase() }))
        .sort((a, b) => a.name.localeCompare(b.name))

      const indexes = sqlite
        .query<{ name: string; unique: number; origin: string; partial: number }, []>(
          `SELECT name, "unique", origin, partial FROM pragma_index_list('${table}')`,
        )
        .all()
        .map((index) => {
          const indexColumns = sqlite
            .query<{ name: string | null }, []>(`SELECT name FROM pragma_index_info('${index.name}') ORDER BY seqno`)
            .all()
            .map((column) => column.name)
          const generated = index.name.startsWith('sqlite_autoindex_')
          const sql = sqlite
            .query<{ sql: string | null }, [string]>(`SELECT sql FROM sqlite_master WHERE type = 'index' AND name = ?`)
            .get(index.name)?.sql
          return {
            name: generated ? `(${index.origin} on ${indexColumns.join(', ')})` : index.name,
            unique: index.unique,
            origin: index.origin,
            partial: index.partial,
            columns: indexColumns,
            sql: normaliseSql(sql ?? null),
          }
        })
        .sort((a, b) => a.name.localeCompare(b.name))

      const foreignKeys = sqlite
        .query<
          { table: string; from: string; to: string | null; on_update: string; on_delete: string; match: string },
          []
        >(`SELECT "table", "from", "to", on_update, on_delete, "match" FROM pragma_foreign_key_list('${table}')`)
        .all()
        .sort((a, b) => `${a.from}>${a.table}`.localeCompare(`${b.from}>${b.table}`))

      return [table, { columns, indexes, foreignKeys }]
    }),
  )
}

/**
 * New installs get initial_schema.sql and nothing else when its version is current,
 * so the snapshot alone must hold every table and column in schema.ts, and must match
 * what the numbered migrations build on top of an older install.
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

  it('matches a version 1 install after the migrations: columns, types, NOT NULL, indexes, foreign keys', () => {
    const migrated = openMigratedDatabase()
    try {
      expect(getRecordedSchemaVersion(migrated)).toBe(CURRENT_SCHEMA_VERSION)
      // A difference means a migration and initial_schema.sql disagree (step 6 in src/db/README.md).
      expect(describeSchema(sqlite)).toEqual(describeSchema(migrated))
    } finally {
      migrated.close()
    }
  })

  it('notices a snapshot that drifts from the migrations', () => {
    const drifted = new Database(':memory:')
    try {
      applyInitialSchema(drifted)
      drifted.exec('DROP INDEX sheet_box_name_idx')
      drifted.exec('CREATE INDEX sheet_box_name_idx ON sheet(box_id, name) WHERE box_id IS NOT NULL')
      drifted.exec('ALTER TABLE paper ADD COLUMN extra TEXT NOT NULL DEFAULT \'\'')
      const migrated = openMigratedDatabase()
      try {
        const expected = describeSchema(migrated)
        const actual = describeSchema(drifted)
        expect(actual.sheet.indexes).not.toEqual(expected.sheet.indexes)
        expect(actual.paper.columns).not.toEqual(expected.paper.columns)
      } finally {
        migrated.close()
      }
    } finally {
      drifted.close()
    }
  })
})
