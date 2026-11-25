import type { Database } from 'bun:sqlite'
import { createHash } from 'crypto'
import { readFileSync } from 'fs'
import { basename } from 'path'
import { databaseCopyPath, writeDatabaseCopy } from './migration-backup'
import { splitSqlStatements } from './migration-runner'
import { CURRENT_SCHEMA_VERSION, getRecordedSchemaVersion } from './schema-evolution'

/**
 * A one-time data fix: SQL one site runs by hand against its own database (README, "One-time
 * data fixes"). Unlike a numbered migration it ships to no other install, so it may name that
 * site's rows. Statements are separated with `--> statement-breakpoint`, as in migrations.
 */
export interface DataFix {
  /** Recorded in `data_fix_log`; the file name without `.sql`. */
  name: string
  sql: string
}

export interface DataFixStatementResult {
  /** The first line of the comment block just above the statement, or the statement's first line. */
  label: string
  /** Rows inserted, updated or deleted, including by triggers and foreign key actions. */
  changes: number
}

export type DataFixResult =
  | { status: 'applied'; name: string; backupPath: string | null; statements: DataFixStatementResult[] }
  | { status: 'dry-run'; name: string; statements: DataFixStatementResult[] }
  | { status: 'already-applied'; name: string; appliedAt: string }

export interface RunDataFixOptions {
  /** Run the fix in a transaction that is rolled back, and report what it would change. */
  dryRun?: boolean
  now?: Date
}

export class DataFixError extends Error {
  constructor(message: string, cause?: unknown) {
    super(message)
    this.name = 'DataFixError'
    if (cause instanceof Error) this.cause = cause
  }
}

const LOG_TABLE = 'data_fix_log'

export function loadDataFix(path: string): DataFix {
  return { name: basename(path).replace(/\.sql$/i, ''), sql: readFileSync(path, 'utf-8') }
}

function checksum(sql: string): string {
  return createHash('sha256').update(sql).digest('hex')
}

interface Statement {
  sql: string
  label: string
}

/** The fix's statements; a chunk holding only comments (such as the file header) is skipped. */
function statementsOf(sql: string): Statement[] {
  const statements: Statement[] = []
  for (const chunk of splitSqlStatements(sql)) {
    const lines = chunk.split('\n').map((line) => line.trim())
    const firstSql = lines.findIndex((line) => line !== '' && !line.startsWith('--'))
    if (firstSql === -1 || lines.slice(firstSql).join('').replace(/;/g, '').trim() === '') continue
    let commentStart = firstSql
    while (commentStart > 0 && lines[commentStart - 1]!.startsWith('--')) commentStart--
    const comment = commentStart < firstSql ? lines[commentStart]!.replace(/^--\s*/, '') : undefined
    const label = comment || lines[firstSql]!.replace(/;$/, '')
    statements.push({ sql: chunk, label: label.length > 120 ? `${label.slice(0, 117)}...` : label })
  }
  return statements
}

function loggedRun(sqlite: Database, name: string): { checksum: string; applied_at: string } | null {
  const table = sqlite.prepare(`SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?`).get(LOG_TABLE)
  if (!table) return null
  return sqlite.prepare(`SELECT checksum, applied_at FROM ${LOG_TABLE} WHERE name = ?`).get(name) as {
    checksum: string
    applied_at: string
  } | null
}

function totalChanges(sqlite: Database): number {
  return (sqlite.prepare('SELECT total_changes() AS n').get() as { n: number }).n
}

/** Run every statement inside an open transaction, counting the rows each one changed. */
function runStatements(sqlite: Database, fix: DataFix): DataFixStatementResult[] {
  const results: DataFixStatementResult[] = []
  statementsOf(fix.sql).forEach((statement, index) => {
    const before = totalChanges(sqlite)
    try {
      sqlite.exec(statement.sql)
    } catch (error: unknown) {
      const detail = error instanceof Error ? error.message : String(error)
      throw new DataFixError(
        `Data fix ${fix.name} failed at statement ${index + 1} (${statement.label}): ${detail}. ` +
          'Every statement was rolled back; the database is unchanged.',
        error,
      )
    }
    results.push({ label: statement.label, changes: totalChanges(sqlite) - before })
  })
  return results
}

/**
 * Run a one-time data fix against a database at CURRENT_SCHEMA_VERSION, in one write
 * transaction, and record it in `data_fix_log` so a second run does nothing. A real run first
 * copies the database next to its file. Throws DataFixError, with the database unchanged, when
 * the schema version differs, the same name ran with different contents, the copy fails, or a
 * statement fails.
 */
export function runDataFix(sqlite: Database, fix: DataFix, options: RunDataFixOptions = {}): DataFixResult {
  const now = options.now ?? new Date()
  const version = getRecordedSchemaVersion(sqlite)
  if (version !== CURRENT_SCHEMA_VERSION) {
    throw new DataFixError(
      `The database is at schema version ${version ?? 'none'}, and data fix ${fix.name} needs ${CURRENT_SCHEMA_VERSION}. ` +
        'Start this version of SampleDB on the database once so it migrates, stop it, then run the fix.',
    )
  }

  const sum = checksum(fix.sql)
  const previous = loggedRun(sqlite, fix.name)
  if (previous) {
    if (previous.checksum !== sum) {
      throw new DataFixError(
        `Data fix ${fix.name} already ran on ${previous.applied_at} with different contents ` +
          `(checksum ${previous.checksum}, the file now has ${sum}). Nothing was run. ` +
          'Put further changes in a new data fix with its own name.',
      )
    }
    return { status: 'already-applied', name: fix.name, appliedAt: previous.applied_at }
  }

  if (options.dryRun) {
    sqlite.exec('BEGIN IMMEDIATE')
    try {
      return { status: 'dry-run', name: fix.name, statements: runStatements(sqlite, fix) }
    } finally {
      sqlite.exec('ROLLBACK')
    }
  }

  const backupPath = databaseCopyPath(sqlite, `pre-data-fix-${fix.name}`, now)
  if (backupPath != null) {
    try {
      writeDatabaseCopy(sqlite, backupPath)
    } catch (error: unknown) {
      const detail = error instanceof Error ? error.message : String(error)
      throw new DataFixError(
        `Could not copy ${sqlite.filename} to ${backupPath} before data fix ${fix.name}: ${detail}. ` +
          'Nothing was run. Make the directory writable (and check free space), then run it again.',
        error,
      )
    }
  }

  sqlite.exec('BEGIN IMMEDIATE')
  try {
    const statements = runStatements(sqlite, fix)
    // The runner's own record, not part of the operational schema: only databases a fix ran on
    // have it. Created in the fix's transaction, so a failed first fix leaves no trace.
    sqlite.exec(`CREATE TABLE IF NOT EXISTS ${LOG_TABLE} (
      name TEXT PRIMARY KEY NOT NULL,
      checksum TEXT NOT NULL,
      applied_at TEXT NOT NULL
    )`)
    sqlite.prepare(`INSERT INTO ${LOG_TABLE} (name, checksum, applied_at) VALUES (?, ?, ?)`).run(fix.name, sum, now.toISOString())
    sqlite.exec('COMMIT')
    return { status: 'applied', name: fix.name, backupPath, statements }
  } catch (error: unknown) {
    sqlite.exec('ROLLBACK')
    throw error
  }
}
