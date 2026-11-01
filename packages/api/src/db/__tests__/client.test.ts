import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { Database } from 'bun:sqlite'
import { existsSync, unlinkSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import { openOperationalDatabase } from '../client'

describe('Database Client', () => {
  let testDbPath: string

  beforeEach(() => {
    // Create a unique test database path
    testDbPath = join(tmpdir(), `test-db-${Date.now()}-${Math.random().toString(36).substring(7)}.sqlite`)
  })

  afterEach(() => {
    // Clean up test database file if it exists
    if (existsSync(testDbPath)) {
      try {
        unlinkSync(testDbPath)
      } catch (error) {
        // Ignore cleanup errors
      }
    }
  })

  it('creates error_logs table when missing even if study and settings exist', () => {
    // Simulate database created before error_logs was added to schema
    const db = new Database(testDbPath)
    db.exec('CREATE TABLE study (id INTEGER PRIMARY KEY, title TEXT, short_code TEXT)')
    db.exec('CREATE TABLE settings (key TEXT, user_id INTEGER, value TEXT, PRIMARY KEY (key, user_id))')
    db.exec(`CREATE TABLE micronix_tube (id INTEGER PRIMARY KEY, collection_id INTEGER NOT NULL, barcode TEXT, position TEXT)`)
    db.exec(`CREATE TABLE cryovial_tube (id INTEGER PRIMARY KEY, collection_id INTEGER NOT NULL, barcode TEXT, position TEXT)`)
    db.exec(`CREATE TABLE static_well (id INTEGER PRIMARY KEY, collection_id INTEGER NOT NULL, position TEXT)`)
    db.exec(`CREATE TABLE study_subject (id INTEGER PRIMARY KEY, study_id INTEGER NOT NULL, name TEXT NOT NULL, last_updated TEXT)`)
    db.exec(`CREATE TABLE sheet (id INTEGER PRIMARY KEY, name TEXT NOT NULL, box_id INTEGER, bag_id INTEGER)`)
    db.exec(`CREATE TABLE specimen (id INTEGER PRIMARY KEY, study_subject_id INTEGER, control_batch_id INTEGER, specimen_type_id INTEGER NOT NULL, collection_date DATE, last_updated TEXT)`)
    // Tables migration 011 indexes
    db.exec(`CREATE TABLE storage_container (id INTEGER PRIMARY KEY, specimen_id INTEGER, comment TEXT, remaining_quantity REAL, last_updated TEXT)`)
    db.exec(`CREATE TABLE storage_container_tag (storage_container_id INTEGER, tag_id INTEGER)`)
    db.exec(`CREATE TABLE control_batch (id INTEGER PRIMARY KEY, control_definition_id INTEGER, properties TEXT)`)
    db.exec(`CREATE TABLE location (id INTEGER PRIMARY KEY, parent_id INTEGER, path TEXT)`)
    db.exec(`CREATE TABLE micronix_plate (id INTEGER PRIMARY KEY, location_id INTEGER, name TEXT)`)
    // Tables migration 013 reads or changes
    db.exec(`CREATE TABLE container_derivation (id INTEGER PRIMARY KEY, parent_container_id INTEGER, child_container_id INTEGER)`)
    db.exec(`CREATE TABLE qpcr_experiment_well (id INTEGER PRIMARY KEY, storage_container_id INTEGER, specimen_id INTEGER)`)
    db.exec(`CREATE TABLE cryovial_box (id INTEGER PRIMARY KEY, location_id INTEGER)`)
    db.exec(`CREATE TABLE bag (id INTEGER PRIMARY KEY, location_id INTEGER)`)
    // Intentionally omit paper — migration 003 preflight creates legacy stub
    // Intentionally do NOT create error_logs
    const before = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='error_logs'").get()
    expect(before).toBeNull()
    db.close()

    const { sqlite } = openOperationalDatabase(testDbPath)
    const after = sqlite.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='error_logs'").get()
    expect(after).toBeDefined()
    expect((after as { name: string }).name).toBe('error_logs')
    sqlite.close()
  })
})

