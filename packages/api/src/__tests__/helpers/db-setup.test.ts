import { describe, it, expect, afterEach } from 'vitest'
import { setupTestDatabase, cleanupTestDatabase } from './db-setup'

describe('setupTestDatabase', () => {
  let sqlite: Awaited<ReturnType<typeof setupTestDatabase>>['sqlite']

  afterEach(() => {
    if (sqlite) {
      cleanupTestDatabase(sqlite)
    }
  })

  it('applies initial_schema.sql so core tables exist', async () => {
    const setup = await setupTestDatabase()
    sqlite = setup.sqlite

    const tables = sqlite
      .prepare(`SELECT name FROM sqlite_master WHERE type='table' ORDER BY name`)
      .all() as Array<{ name: string }>
    const names = tables.map((t) => t.name)

    expect(names).toContain('study')
    expect(names).toContain('specimen')
    expect(names).toContain('storage_container')
    expect(names).toContain('settings')
    expect(names).toContain('users')
    expect(names).toContain('qpcr_experiment')
  })
})
