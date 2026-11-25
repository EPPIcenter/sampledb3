#!/usr/bin/env bun

/**
 * Run a one-time data fix against a database by hand (src/db/README.md, "One-time data fixes").
 *
 * Usage:
 *   bun run data-fix <fix.sql> [--db=path/to/database.sqlite] [--dry-run]
 *
 * Without --db it uses DATABASE_PATH, then the dev default, as the app does.
 */

import { Database } from 'bun:sqlite'
import { existsSync } from 'fs'
import { DataFixError, loadDataFix, runDataFix, type DataFixStatementResult } from '../db/data-fix'
import { resolveOperationalDatabasePath } from '../db/open'

const USAGE = 'Usage: bun run data-fix <fix.sql> [--db=path/to/database.sqlite] [--dry-run]'

function printStatements(statements: DataFixStatementResult[]): void {
  const width = String(statements.length).length
  statements.forEach((statement, index) => {
    const rows = `${statement.changes} row${statement.changes === 1 ? '' : 's'}`
    console.log(`  ${String(index + 1).padStart(width)}  ${statement.label}  ${rows}`)
  })
}

function main(args: string[]): number {
  const dryRun = args.includes('--dry-run')
  const dbArg = args.find((arg) => arg.startsWith('--db='))?.slice('--db='.length)
  const files = args.filter((arg) => !arg.startsWith('--'))
  if (files.length !== 1 || args.some((arg) => arg.startsWith('--') && arg !== '--dry-run' && !arg.startsWith('--db='))) {
    console.error(USAGE)
    return 2
  }
  const fixPath = files[0]!
  if (!existsSync(fixPath)) {
    console.error(`No data fix file at ${fixPath}.`)
    return 1
  }
  const databasePath = resolveOperationalDatabasePath(dbArg)
  if (!existsSync(databasePath)) {
    console.error(`No database at ${databasePath}. Pass --db=<path> or set DATABASE_PATH.`)
    return 1
  }

  const fix = loadDataFix(fixPath)
  // Opened directly, not with openOperationalDatabase: a data fix must not migrate the database,
  // and refuses one that is not already at the current schema version.
  const sqlite = new Database(databasePath, { readwrite: true, create: false })
  try {
    sqlite.exec('PRAGMA foreign_keys = ON')
    sqlite.exec('PRAGMA busy_timeout = 5000')
    console.log(`Database: ${databasePath}`)
    const result = runDataFix(sqlite, fix, { dryRun })
    switch (result.status) {
      case 'already-applied':
        console.log(`Data fix ${result.name} already ran on ${result.appliedAt}; nothing to do.`)
        break
      case 'dry-run':
        console.log(`Dry run of data fix ${result.name}. Rows each statement would change:`)
        printStatements(result.statements)
        console.log('Dry run: every change was rolled back and nothing was recorded.')
        break
      case 'applied':
        if (result.backupPath) console.log(`Copied the database to ${result.backupPath}`)
        console.log(`Applied data fix ${result.name}. Rows each statement changed:`)
        printStatements(result.statements)
        break
    }
    return 0
  } catch (error: unknown) {
    if (error instanceof DataFixError) {
      console.error(error.message)
      return 1
    }
    throw error
  } finally {
    sqlite.close()
  }
}

if (import.meta.main) {
  process.exit(main(process.argv.slice(2)))
}
