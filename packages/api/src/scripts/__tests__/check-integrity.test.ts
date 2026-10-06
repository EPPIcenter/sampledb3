import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import type { Database } from 'bun:sqlite'
import { setupTestDatabase, cleanupTestDatabase } from '../../__tests__/helpers/db-setup'
import { checkDatabaseIntegrity } from '../check-integrity'

describe('checkDatabaseIntegrity', () => {
  let sqlite: Database

  beforeEach(async () => {
    sqlite = (await setupTestDatabase()).sqlite
  })

  afterEach(() => {
    cleanupTestDatabase(sqlite)
  })

  it('reports a clean database as clean', () => {
    expect(checkDatabaseIntegrity(sqlite).totalIssues).toBe(0)
  })

  it('reports orphaned tag links, which have no id column', () => {
    sqlite.exec('PRAGMA foreign_keys = OFF')
    sqlite.exec('INSERT INTO storage_container_tag (storage_container_id, tag_id) VALUES (999, 998)')
    sqlite.exec('PRAGMA foreign_keys = ON')

    const tables = checkDatabaseIntegrity(sqlite).issues.map((issue) => `${issue.table}.${issue.column}`)
    expect(tables).toContain('storage_container_tag.storage_container_id')
    expect(tables).toContain('storage_container_tag.tag_id')
  })

  it('reports qPCR wells pointing at missing containers', () => {
    sqlite.exec('PRAGMA foreign_keys = OFF')
    sqlite.exec(`INSERT INTO qpcr_experiment_well (qpcr_experiment_id, well_position, storage_container_id) VALUES (999, 'A01', 998)`)
    sqlite.exec('PRAGMA foreign_keys = ON')

    const tables = checkDatabaseIntegrity(sqlite).issues.map((issue) => `${issue.table}.${issue.column}`)
    expect(tables).toContain('qpcr_experiment_well.qpcr_experiment_id')
    expect(tables).toContain('qpcr_experiment_well.storage_container_id')
  })
})
