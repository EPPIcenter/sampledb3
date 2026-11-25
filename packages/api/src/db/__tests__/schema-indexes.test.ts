import { describe, it, expect } from 'vitest'
import { Database } from 'bun:sqlite'
import { readFileSync } from 'fs'
import { dirname, join } from 'path'
import { fileURLToPath } from 'url'
import { SQL, is } from 'drizzle-orm'
import { SQLiteSyncDialect, SQLiteTable, getTableConfig } from 'drizzle-orm/sqlite-core'
import * as schema from '../schema'
import { applyInitialSchema } from '../apply-initial-schema'
import { splitSqlStatements } from '../migration-runner'
import { CURRENT_SCHEMA_VERSION, evolveOperationalSchema, getRecordedSchemaVersion } from '../schema-evolution'

/**
 * Index definitions compared by name: table, uniqueness, key columns or expressions in order,
 * and the partial-index WHERE. Text is normalised so that Drizzle's rendering
 * (`lower(trim("micronix_tube"."barcode"))`) and SQLite's stored DDL
 * (`lower(trim(barcode))`) compare equal.
 */
type IndexDefinition = { table: string; unique: boolean; keys: string[]; where: string | null }

const dialect = new SQLiteSyncDialect()

function normalise(text: string, table: string): string {
  return text
    .replace(/["`[\]]/g, '')
    .replace(new RegExp(`\\b${table}\\.`, 'gi'), '')
    .replace(/\s+/g, ' ')
    .replace(/\s*([(),])\s*/g, '$1')
    .trim()
    .toLowerCase()
}

/** Every index schema.ts declares, by name. Unique column constraints are not indexes here. */
function declaredIndexes(): Map<string, IndexDefinition> {
  const declared = new Map<string, IndexDefinition>()
  for (const value of Object.values(schema)) {
    if (!is(value, SQLiteTable)) continue
    const { name: table, indexes } = getTableConfig(value)
    for (const { config } of indexes) {
      if (declared.has(config.name)) throw new Error(`index ${config.name} declared twice`)
      declared.set(config.name, {
        table,
        unique: config.unique,
        keys: config.columns.map((key) => normalise(is(key, SQL) ? dialect.sqlToQuery(key).sql : key.name, table)),
        where: config.where ? normalise(dialect.sqlToQuery(config.where).sql, table) : null,
      })
    }
  }
  return declared
}

/** Split `a, f(b, c), d` on top-level commas. */
function splitTopLevel(list: string): string[] {
  const parts: string[] = []
  let depth = 0
  let start = 0
  for (let i = 0; i < list.length; i++) {
    if (list[i] === '(') depth++
    else if (list[i] === ')') depth--
    else if (list[i] === ',' && depth === 0) {
      parts.push(list.slice(start, i))
      start = i + 1
    }
  }
  parts.push(list.slice(start))
  return parts
}

/**
 * Every index a CREATE INDEX statement made, by name. Indexes SQLite creates for UNIQUE and
 * PRIMARY KEY constraints have no SQL and are left out, as they are of declaredIndexes.
 */
function databaseIndexes(sqlite: Database): Map<string, IndexDefinition> {
  const rows = sqlite
    .query<{ name: string; table: string; sql: string }, []>(
      `SELECT name, tbl_name AS "table", sql FROM sqlite_master WHERE type = 'index' AND sql IS NOT NULL`,
    )
    .all()
  const found = new Map<string, IndexDefinition>()
  for (const { name, table, sql } of rows) {
    const open = sql.indexOf('(', sql.search(/\bON\b/i))
    let depth = 0
    let close = open
    for (; close < sql.length; close++) {
      if (sql[close] === '(') depth++
      else if (sql[close] === ')' && --depth === 0) break
    }
    const where = sql.slice(close + 1).match(/^\s*WHERE\s+([\s\S]*?)\s*;?\s*$/i)?.[1] ?? null
    const unique = sqlite
      .query<{ unique: number }, []>(`SELECT "unique" FROM pragma_index_list('${table}') WHERE name = '${name}'`)
      .get()!.unique
    found.set(name, {
      table,
      unique: unique === 1,
      keys: splitTopLevel(sql.slice(open + 1, close)).map((key) => normalise(key, table)),
      where: where == null ? null : normalise(where, table),
    })
  }
  return found
}

/** The differences between two index maps, one line per index, empty when they agree. */
function indexDifferences(expected: Map<string, IndexDefinition>, actual: Map<string, IndexDefinition>): string[] {
  const differences: string[] = []
  for (const [name, definition] of expected) {
    const found = actual.get(name)
    if (!found) differences.push(`missing ${name}`)
    else if (JSON.stringify(found) !== JSON.stringify(definition)) {
      differences.push(`${name}: expected ${JSON.stringify(definition)}, found ${JSON.stringify(found)}`)
    }
  }
  for (const name of actual.keys()) {
    if (!expected.has(name)) differences.push(`undeclared ${name}`)
  }
  return differences.sort()
}

const VERSION_1_SNAPSHOT = join(dirname(fileURLToPath(import.meta.url)), 'fixtures', 'initial_schema_v1.sql')

function openVersion1Install(): Database {
  const sqlite = new Database(':memory:')
  for (const statement of splitSqlStatements(readFileSync(VERSION_1_SNAPSHOT, 'utf-8'))) {
    sqlite.exec(statement)
  }
  return sqlite
}

/**
 * Production files that predate the versioned snapshot hold some schema.ts indexes under other
 * names, lack others, and have none of the indexes added later. Migration 011 renames the first
 * and adds the second. Each entry: production name (null when production lacks the index),
 * schema.ts name, and what the production index is on.
 */
const PRODUCTION_INDEX_NAMES: Array<[string | null, string, string]> = [
  ['idx_specimen_study_subject_id', 'specimen_study_subject_id_idx', 'specimen(study_subject_id)'],
  ['idx_specimen_control_batch_id', 'specimen_control_batch_id_idx', 'specimen(control_batch_id)'],
  ['idx_storage_container_specimen_id', 'storage_container_specimen_id_idx', 'storage_container(specimen_id)'],
  ['idx_study_short_code', 'study_short_code_idx', 'study(short_code)'],
  ['idx_study_subject_study_id', 'study_subject_study_id_idx', 'study_subject(study_id)'],
  ['idx_study_subject_name', 'study_subject_name_idx', 'study_subject(name)'],
  ['idx_location_new_parent_id', 'idx_location_parent_id', 'location(parent_id)'],
  ['idx_location_new_path', 'idx_location_path', 'location(path)'],
  [null, 'study_title_idx', ''],
  [null, 'control_batch_control_definition_id_idx', ''],
  [null, 'specimen_collection_date_idx', ''],
  [null, 'specimen_specimen_type_id_idx', ''],
  [null, 'micronix_plate_location_id_idx', ''],
  [null, 'cryovial_box_location_id_idx', ''],
  [null, 'bag_location_id_idx', ''],
]

/**
 * Indexes schema.ts declares that migrations leave off production files, because their data
 * breaks them: those files hold more than one Specimen for some collection events.
 */
const NOT_ADDED_TO_PRODUCTION = ['idx_specimen_study_subject_type_date', 'idx_specimen_control_batch_type_date']

/** A version 1 install with production's index names, at the version the production snapshot had. */
function openProductionShapedInstall(): Database {
  const sqlite = openVersion1Install()
  for (const [legacyName, schemaName, on] of PRODUCTION_INDEX_NAMES) {
    sqlite.exec(`DROP INDEX ${schemaName}`)
    if (legacyName) sqlite.exec(`CREATE INDEX ${legacyName} ON ${on}`)
  }
  for (const name of NOT_ADDED_TO_PRODUCTION) sqlite.exec(`DROP INDEX ${name}`)
  // Redundant with the unique study_subject_study_name_idx that migration 005 adds.
  sqlite.exec('CREATE INDEX idx_study_subject_study_name ON study_subject(study_id, name)')
  return sqlite
}

describe('indexes declared in schema.ts', () => {
  const declared = declaredIndexes()

  it('finds the declarations, including expression and partial indexes', () => {
    expect(declared.size).toBeGreaterThan(40)
    expect(declared.get('micronix_tube_barcode_folded_idx')).toEqual({
      table: 'micronix_tube',
      unique: false,
      keys: ['lower(trim(barcode))'],
      where: null,
    })
    expect(declared.get('sheet_box_name_idx')).toEqual({
      table: 'sheet',
      unique: true,
      keys: ['box_id', 'name'],
      where: 'box_id is not null',
    })
  })

  it('match a new install from initial_schema.sql', () => {
    const sqlite = new Database(':memory:')
    try {
      applyInitialSchema(sqlite)
      expect(getRecordedSchemaVersion(sqlite)).toBe(CURRENT_SCHEMA_VERSION)
      expect(indexDifferences(declared, databaseIndexes(sqlite))).toEqual([])
    } finally {
      sqlite.close()
    }
  })

  it('match a version 1 install after the migrations', () => {
    const sqlite = openVersion1Install()
    try {
      evolveOperationalSchema(sqlite)
      expect(getRecordedSchemaVersion(sqlite)).toBe(CURRENT_SCHEMA_VERSION)
      expect(indexDifferences(declared, databaseIndexes(sqlite))).toEqual([])
    } finally {
      sqlite.close()
    }
  })

  it('match a production file after the migrations, except the Specimen collection event indexes', () => {
    const sqlite = openProductionShapedInstall()
    try {
      expect(indexDifferences(declared, databaseIndexes(sqlite))).not.toEqual([])
      evolveOperationalSchema(sqlite)
      expect(getRecordedSchemaVersion(sqlite)).toBe(CURRENT_SCHEMA_VERSION)
      expect(indexDifferences(declared, databaseIndexes(sqlite))).toEqual(
        NOT_ADDED_TO_PRODUCTION.map((name) => `missing ${name}`).sort(),
      )
    } finally {
      sqlite.close()
    }
  })

  it('notice a missing, undeclared or changed index', () => {
    const sqlite = new Database(':memory:')
    try {
      applyInitialSchema(sqlite)
      sqlite.exec('DROP INDEX paper_sublabel_idx')
      sqlite.exec('CREATE INDEX paper_extra_idx ON paper(sublabel)')
      sqlite.exec('DROP INDEX cryovial_tube_barcode_folded_idx')
      sqlite.exec('CREATE INDEX cryovial_tube_barcode_folded_idx ON cryovial_tube(lower(barcode))')
      sqlite.exec('DROP INDEX sheet_box_name_idx')
      sqlite.exec('CREATE UNIQUE INDEX sheet_box_name_idx ON sheet(box_id, name)')
      sqlite.exec('DROP INDEX static_well_collection_id_idx')
      sqlite.exec('CREATE UNIQUE INDEX static_well_collection_id_idx ON static_well(collection_id)')
      expect(indexDifferences(declared, databaseIndexes(sqlite)).map((line) => line.split(':')[0])).toEqual([
        'cryovial_tube_barcode_folded_idx',
        'missing paper_sublabel_idx',
        'sheet_box_name_idx',
        'static_well_collection_id_idx',
        'undeclared paper_extra_idx',
      ])
    } finally {
      sqlite.close()
    }
  })
})
