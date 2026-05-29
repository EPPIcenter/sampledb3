import { Database } from 'bun:sqlite'
import { existsSync, readdirSync, readFileSync } from 'fs'
import { join } from 'path'
import { fileURLToPath } from 'url'
import { dirname } from 'path'
import { hasSchemaVersionTable } from './schema-evolution'

const moduleDir = dirname(fileURLToPath(import.meta.url))

export class SchemaMigrationError extends Error {
  readonly migrationVersion: number

  constructor(migrationVersion: number, cause: unknown) {
    const detail = cause instanceof Error ? cause.message : String(cause)
    super(`Schema migration ${migrationVersion} failed: ${detail}`)
    this.name = 'SchemaMigrationError'
    this.migrationVersion = migrationVersion
    if (cause instanceof Error && cause.stack) {
      this.cause = cause
    }
  }
}

export function splitSqlStatements(sql: string): string[] {
  return sql
    .split('--> statement-breakpoint')
    .map((s) => s.trim())
    .filter(Boolean)
}

export function resolveMigrationsDirectory(): string {
  return join(moduleDir, 'migrations')
}

export function listNumberedMigrations(): Array<{ version: number; path: string; basename: string }> {
  const dir = resolveMigrationsDirectory()
  if (!existsSync(dir)) {
    return []
  }
  return readdirSync(dir)
    .map((basename) => {
      const match = /^(\d{3})_.+\.sql$/.exec(basename)
      if (!match) return null
      return {
        version: Number.parseInt(match[1], 10),
        path: join(dir, basename),
        basename,
      }
    })
    .filter((entry): entry is { version: number; path: string; basename: string } => entry != null)
    .sort((a, b) => a.version - b.version)
}

function setSchemaVersion(sqlite: Database, version: number): void {
  if (hasSchemaVersionTable(sqlite)) {
    const count = sqlite.prepare('SELECT COUNT(*) AS c FROM schema_version').get() as { c: number }
    if (count.c === 0) {
      sqlite.prepare('INSERT INTO schema_version (version) VALUES (?)').run(version)
    } else {
      sqlite.prepare('UPDATE schema_version SET version = ?').run(version)
    }
  } else {
    sqlite.exec('CREATE TABLE IF NOT EXISTS schema_version (version INTEGER NOT NULL)')
    sqlite.prepare('INSERT INTO schema_version (version) VALUES (?)').run(version)
  }
}

/**
 * Run one migration file inside a transaction; bump schema_version on success.
 */
export function runSqlMigration(sqlite: Database, version: number, sqlPath: string): void {
  const sql = readFileSync(sqlPath, 'utf-8')
  runSqlMigrationStatements(sqlite, version, sql)
}

export function runSqlMigrationStatements(sqlite: Database, version: number, sql: string): void {
  const statements = splitSqlStatements(sql)
  sqlite.exec('BEGIN')
  try {
    for (const statement of statements) {
      sqlite.exec(statement)
    }
    setSchemaVersion(sqlite, version)
    sqlite.exec('COMMIT')
  } catch (error: unknown) {
    try {
      sqlite.exec('ROLLBACK')
    } catch {
      // ignore rollback errors
    }
    throw new SchemaMigrationError(version, error)
  }
}
