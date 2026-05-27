import { Database } from 'bun:sqlite'
import { existsSync, readFileSync } from 'fs'
import { dirname, join } from 'path'
import { fileURLToPath } from 'url'

const moduleDir = dirname(fileURLToPath(import.meta.url))

/**
 * Resolve packages/api/initial_schema.sql (Drizzle-generated DDL snapshot).
 */
export function resolveInitialSchemaPath(): string {
  const candidates = [
    join(moduleDir, '../../initial_schema.sql'),
    join(moduleDir, '../../../initial_schema.sql'),
  ]

  for (const path of candidates) {
    if (existsSync(path)) {
      return path
    }
  }

  throw new Error(`initial_schema.sql not found. Tried: ${candidates.join(', ')}`)
}

/**
 * Apply the canonical schema snapshot (same DDL production uses on empty databases).
 */
export function applyInitialSchema(sqlite: Database): void {
  const sql = readFileSync(resolveInitialSchemaPath(), 'utf-8')
  const statements = sql
    .split('--> statement-breakpoint')
    .map((s) => s.trim())
    .filter(Boolean)

  for (const statement of statements) {
    sqlite.exec(statement)
  }
}

/**
 * Run fn with foreign keys disabled (for tests that seed intentional orphan rows).
 * Restores foreign_keys=ON afterward.
 */
export async function withForeignKeysDisabled<T>(
  sqlite: Database,
  fn: () => T | Promise<T>,
): Promise<T> {
  sqlite.exec('PRAGMA foreign_keys=OFF')
  try {
    return await fn()
  } finally {
    sqlite.exec('PRAGMA foreign_keys=ON')
  }
}

/** Drop all user tables (for in-memory reset between tests). */
export function dropAllUserTables(sqlite: Database): void {
  const tables = sqlite
    .prepare(
      `SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'`,
    )
    .all() as Array<{ name: string }>

  for (const table of tables) {
    sqlite.exec(`DROP TABLE IF EXISTS ${table.name}`)
  }
}
