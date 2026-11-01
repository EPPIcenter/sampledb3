import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { Database } from 'bun:sqlite'
import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join, resolve } from 'path'
import { applyInitialSchema } from '../../db/apply-initial-schema'

const SCRIPT = resolve(import.meta.dir, '../data-fix.ts')
const NOW = '2024-01-01 00:00:00'

function runCli(args: string[]): { exitCode: number; output: string } {
  const result = Bun.spawnSync(['bun', SCRIPT, ...args], { env: { ...process.env, DATABASE_PATH: '' } })
  return { exitCode: result.exitCode, output: result.stdout.toString() + result.stderr.toString() }
}

describe('data-fix script', () => {
  let dir: string
  let dbPath: string
  let fixPath: string

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'data-fix-cli-'))
    dbPath = join(dir, 'lab.sqlite')
    const sqlite = new Database(dbPath)
    applyInitialSchema(sqlite)
    sqlite.exec(`INSERT INTO study (id, title, short_code, is_longitudinal, lead_person, created, last_updated) VALUES
      (1, 'Pilot', 'PIL', 0, 'A', '${NOW}', '${NOW}')`)
    sqlite.close()
    fixPath = join(dir, '2026-11-01-rename.sql')
    writeFileSync(fixPath, `-- Rename the pilot\nUPDATE study SET title = 'Renamed' WHERE id = 1;`)
  })

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true })
  })

  function title(): string {
    const sqlite = new Database(dbPath, { readonly: true })
    const row = sqlite.prepare('SELECT title FROM study WHERE id = 1').get() as { title: string }
    sqlite.close()
    return row.title
  }

  it('prints what a dry run would change and leaves the database alone', () => {
    const { exitCode, output } = runCli([fixPath, `--db=${dbPath}`, '--dry-run'])

    expect(exitCode).toBe(0)
    expect(output).toContain('Dry run of data fix 2026-11-01-rename')
    expect(output).toMatch(/1\s+Rename the pilot\s+1 row/)
    expect(output).toContain('rolled back')
    expect(title()).toBe('Pilot')
  })

  it('applies the fix, then says it already ran', () => {
    const first = runCli([fixPath, `--db=${dbPath}`])
    const second = runCli([fixPath, `--db=${dbPath}`])

    expect(first.exitCode).toBe(0)
    expect(first.output).toContain('Applied data fix 2026-11-01-rename')
    expect(first.output).toContain(`${dbPath}.pre-data-fix-2026-11-01-rename-`)
    expect(second.exitCode).toBe(0)
    expect(second.output).toMatch(/Data fix 2026-11-01-rename already ran on \S+; nothing to do/)
    expect(title()).toBe('Renamed')
  })

  it('refuses a database file that does not exist, without creating one', () => {
    const missing = join(dir, 'missing.sqlite')

    const { exitCode, output } = runCli([fixPath, `--db=${missing}`])

    expect(exitCode).toBe(1)
    expect(output).toContain(`No database at ${missing}`)
    expect(existsSync(missing)).toBe(false)
  })

  it('exits 1 with the reason when the fix fails', () => {
    writeFileSync(fixPath, `UPDATE study SET title = NULL;`)

    const { exitCode, output } = runCli([fixPath, `--db=${dbPath}`])

    expect(exitCode).toBe(1)
    expect(output).toContain('NOT NULL constraint failed')
    expect(title()).toBe('Pilot')
  })

  it('prints usage without a fix file', () => {
    const { exitCode, output } = runCli([])

    expect(exitCode).toBe(2)
    expect(output).toContain('Usage: bun run data-fix <fix.sql>')
  })
})
