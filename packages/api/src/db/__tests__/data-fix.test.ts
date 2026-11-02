import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { Database } from 'bun:sqlite'
import { mkdtempSync, readdirSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { applyInitialSchema } from '../apply-initial-schema'
import { CURRENT_SCHEMA_VERSION } from '../schema-evolution'
import { DataFixError, runDataFix, type DataFix } from '../data-fix'

const NOW = '2024-01-01 00:00:00'

const renameStudies: DataFix = {
  name: '2026-11-01-rename-studies',
  sql: [
    '-- Header comment',
    "-- Rename the pilot study\nUPDATE study SET title = 'Pilot (renamed)' WHERE short_code = 'PIL'",
    "UPDATE study SET lead_person = 'Lab' WHERE short_code IN ('PIL', 'MAIN')",
    "CREATE TEMP TABLE __fix_scratch (id INTEGER);\n",
    'DROP TABLE __fix_scratch',
  ].join(';--> statement-breakpoint\n'),
}

function titles(sqlite: Database): string[] {
  return (sqlite.prepare('SELECT title FROM study ORDER BY id').all() as Array<{ title: string }>).map((r) => r.title)
}

describe('runDataFix', () => {
  let dir: string
  let sqlite: Database

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'data-fix-'))
    sqlite = new Database(join(dir, 'lab.sqlite'))
    sqlite.exec('PRAGMA foreign_keys = ON')
    applyInitialSchema(sqlite)
    sqlite.exec(`INSERT INTO study (id, title, short_code, is_longitudinal, lead_person, created, last_updated) VALUES
      (1, 'Pilot', 'PIL', 0, 'A', '${NOW}', '${NOW}'), (2, 'Main', 'MAIN', 0, 'B', '${NOW}', '${NOW}')`)
  })

  afterEach(() => {
    sqlite.close()
    rmSync(dir, { recursive: true, force: true })
  })

  it('applies the fix, reports the rows each statement changed, and records it', () => {
    const result = runDataFix(sqlite, renameStudies, { now: new Date('2026-11-01T12:00:00Z') })

    expect(result.status).toBe('applied')
    expect(result.statements).toEqual([
      { label: 'Rename the pilot study', changes: 1 },
      { label: "UPDATE study SET lead_person = 'Lab' WHERE short_code IN ('PIL', 'MAIN')", changes: 2 },
      { label: 'CREATE TEMP TABLE __fix_scratch (id INTEGER)', changes: 0 },
      { label: 'DROP TABLE __fix_scratch', changes: 0 },
    ])
    expect(titles(sqlite)).toEqual(['Pilot (renamed)', 'Main'])
    expect(sqlite.prepare('SELECT name, applied_at, checksum FROM data_fix_log').all()).toEqual([
      { name: '2026-11-01-rename-studies', applied_at: '2026-11-01T12:00:00.000Z', checksum: expect.stringMatching(/^[0-9a-f]{64}$/) },
    ])
  })

  it('does nothing the second time and says when it ran', () => {
    runDataFix(sqlite, renameStudies, { now: new Date('2026-11-01T12:00:00Z') })
    sqlite.exec(`UPDATE study SET title = 'Pilot' WHERE id = 1`)

    const again = runDataFix(sqlite, renameStudies)

    expect(again).toEqual({ status: 'already-applied', name: renameStudies.name, appliedAt: '2026-11-01T12:00:00.000Z' })
    expect(titles(sqlite)).toEqual(['Pilot', 'Main'])
  })

  it('refuses a fix whose file changed since it ran under the same name', () => {
    runDataFix(sqlite, renameStudies)

    expect(() => runDataFix(sqlite, { ...renameStudies, sql: `${renameStudies.sql};\nSELECT 1` })).toThrow(
      /2026-11-01-rename-studies already ran .* with different contents/,
    )
  })

  it('copies the database before changing it, naming the copy for the fix', () => {
    const result = runDataFix(sqlite, renameStudies, { now: new Date('2026-11-01T12:00:00Z') })

    expect(result.status === 'applied' && result.backupPath).toBe(
      join(dir, 'lab.sqlite.pre-data-fix-2026-11-01-rename-studies-20261101T120000000Z.bak'),
    )
    const copy = new Database(join(dir, 'lab.sqlite.pre-data-fix-2026-11-01-rename-studies-20261101T120000000Z.bak'), { readonly: true })
    expect(titles(copy)).toEqual(['Pilot', 'Main'])
    copy.close()
  })

  it('in a dry run reports the counts, rolls everything back and records nothing', () => {
    const result = runDataFix(sqlite, renameStudies, { dryRun: true })

    expect(result.status).toBe('dry-run')
    expect(result.status === 'dry-run' && result.statements.map((s) => s.changes)).toEqual([1, 2, 0, 0])
    expect(titles(sqlite)).toEqual(['Pilot', 'Main'])
    expect(sqlite.prepare(`SELECT name FROM sqlite_master WHERE name = 'data_fix_log'`).all()).toEqual([])
    expect(readdirSync(dir).filter((f) => f.endsWith('.bak'))).toEqual([])
  })

  it('in a dry run of a fix that already ran says so', () => {
    runDataFix(sqlite, renameStudies, { now: new Date('2026-11-01T12:00:00Z') })

    expect(runDataFix(sqlite, renameStudies, { dryRun: true }).status).toBe('already-applied')
  })

  it('refuses a database that is not at the current schema version, changing nothing', () => {
    sqlite.exec(`UPDATE schema_version SET version = ${CURRENT_SCHEMA_VERSION - 1}`)

    expect(() => runDataFix(sqlite, renameStudies)).toThrow(
      new RegExp(`schema version ${CURRENT_SCHEMA_VERSION - 1}.*needs ${CURRENT_SCHEMA_VERSION}`),
    )
    expect(titles(sqlite)).toEqual(['Pilot', 'Main'])
    expect(readdirSync(dir).filter((f) => f.endsWith('.bak'))).toEqual([])
  })

  it('rolls back every statement when one fails, names it, and records nothing', () => {
    const failing: DataFix = {
      name: 'failing',
      sql: `UPDATE study SET title = title || ' (changed)';--> statement-breakpoint\nUPDATE study SET short_code = 'MAIN' WHERE id = 1`,
    }

    expect(() => runDataFix(sqlite, failing)).toThrow(DataFixError)
    expect(() => runDataFix(sqlite, failing)).toThrow(/statement 2 .*UNIQUE constraint failed/)
    expect(titles(sqlite)).toEqual(['Pilot', 'Main'])
    expect(sqlite.prepare(`SELECT name FROM sqlite_master WHERE name = 'data_fix_log'`).all()).toEqual([])
  })
})
