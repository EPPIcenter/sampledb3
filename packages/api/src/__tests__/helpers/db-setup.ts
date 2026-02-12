import { Database } from 'bun:sqlite'
import { drizzle } from 'drizzle-orm/bun-sqlite'
import * as schema from '../../db/schema'
import type { Database as DrizzleDatabase } from '../../db/client'

/**
 * Creates an in-memory SQLite database for testing
 * Assigns a unique _id so defaults/settings cache keys are distinct across test DBs (avoids cross-test contamination when running full suite).
 */
export function createTestDatabase(): { db: DrizzleDatabase; sqlite: Database } {
  const sqlite = new Database(':memory:')
  sqlite.exec('PRAGMA journal_mode = WAL')

  const db = drizzle(sqlite, { schema }) as DrizzleDatabase & { _id?: string }
  db._id = `test-db-${Date.now()}-${Math.random().toString(36).slice(2)}`

  return { db, sqlite }
}

/**
 * Creates the full database schema using SQL DDL statements
 * This recreates the schema from scratch without using migrations
 */
function createSchema(sqlite: Database) {
  // Drop all existing tables first to ensure clean state
  const tables = sqlite.prepare(`
    SELECT name FROM sqlite_master 
    WHERE type='table' AND name NOT LIKE 'sqlite_%'
  `).all() as Array<{ name: string }>

  for (const table of tables) {
    sqlite.exec(`DROP TABLE IF EXISTS ${table.name}`)
  }
  // Users and authentication
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY,
      email TEXT NOT NULL UNIQUE,
      username TEXT UNIQUE,
      name TEXT NOT NULL,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL,
      created TEXT NOT NULL DEFAULT (datetime('now')),
      last_login TEXT,
      deleted_at TEXT,
      approved_at TEXT
    )
  `)

  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id),
      expires_at INTEGER NOT NULL
    )
  `)

  // Tags and Units
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS tag (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE
    )
  `)

  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS unit (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      symbol TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      category TEXT NOT NULL
    )
  `)

  // Studies
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS study (
      id INTEGER PRIMARY KEY,
      title TEXT NOT NULL UNIQUE,
      description TEXT,
      short_code TEXT NOT NULL UNIQUE,
      is_longitudinal INTEGER NOT NULL,
      lead_person TEXT NOT NULL,
      created TEXT NOT NULL,
      last_updated TEXT NOT NULL,
      created_by INTEGER REFERENCES users(id),
      updated_by INTEGER REFERENCES users(id)
    )
  `)

  sqlite.exec(`CREATE INDEX IF NOT EXISTS study_title_idx ON study(title)`)
  sqlite.exec(`CREATE INDEX IF NOT EXISTS study_short_code_idx ON study(short_code)`)

  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS study_subject (
      id INTEGER PRIMARY KEY,
      study_id INTEGER NOT NULL REFERENCES study(id),
      name TEXT NOT NULL,
      created TEXT NOT NULL,
      last_updated TEXT NOT NULL,
      created_by INTEGER REFERENCES users(id),
      updated_by INTEGER REFERENCES users(id)
    )
  `)

  sqlite.exec(`CREATE INDEX IF NOT EXISTS study_subject_study_id_idx ON study_subject(study_id)`)
  sqlite.exec(`CREATE INDEX IF NOT EXISTS study_subject_name_idx ON study_subject(name)`)

  // Control definitions
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS control_definition (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      control_type TEXT NOT NULL CHECK (control_type IN ('blood', 'plasma_positive', 'plasma_negative', 'antibody', 'extraction', 'negative')),
      properties TEXT,
      created TEXT NOT NULL DEFAULT (datetime('now')),
      last_updated TEXT NOT NULL DEFAULT (datetime('now')),
      created_by INTEGER REFERENCES users(id),
      updated_by INTEGER REFERENCES users(id)
    )
  `)

  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS control_batch (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      control_definition_id INTEGER NOT NULL REFERENCES control_definition(id),
      name TEXT NOT NULL UNIQUE,
      production_date TEXT,
      properties TEXT,
      created TEXT NOT NULL DEFAULT (datetime('now')),
      last_updated TEXT NOT NULL DEFAULT (datetime('now')),
      created_by INTEGER REFERENCES users(id),
      updated_by INTEGER REFERENCES users(id)
    )
  `)

  sqlite.exec(`CREATE INDEX IF NOT EXISTS control_batch_control_definition_id_idx ON control_batch(control_definition_id)`)

  // Other source tables
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS reagent (
      id INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      reagent_type TEXT NOT NULL,
      vendor TEXT,
      catalog_number TEXT,
      lot_number TEXT,
      received_date TEXT,
      expiration_date TEXT,
      storage_temp TEXT,
      properties TEXT,
      created TEXT NOT NULL DEFAULT (datetime('now')),
      last_updated TEXT NOT NULL DEFAULT (datetime('now')),
      created_by INTEGER REFERENCES users(id),
      updated_by INTEGER REFERENCES users(id)
    )
  `)

  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS cell_line (
      id INTEGER PRIMARY KEY,
      name TEXT NOT NULL UNIQUE,
      species TEXT NOT NULL,
      strain TEXT,
      source TEXT,
      properties TEXT,
      created TEXT NOT NULL DEFAULT (datetime('now')),
      last_updated TEXT NOT NULL DEFAULT (datetime('now')),
      created_by INTEGER REFERENCES users(id),
      updated_by INTEGER REFERENCES users(id)
    )
  `)

  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS plasmid (
      id INTEGER PRIMARY KEY,
      name TEXT NOT NULL UNIQUE,
      backbone TEXT,
      insert_name TEXT,
      insert_size_bp INTEGER,
      resistance TEXT,
      source TEXT,
      properties TEXT,
      created TEXT NOT NULL DEFAULT (datetime('now')),
      last_updated TEXT NOT NULL DEFAULT (datetime('now')),
      created_by INTEGER REFERENCES users(id),
      updated_by INTEGER REFERENCES users(id)
    )
  `)

  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS standard (
      id INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      standard_type TEXT NOT NULL,
      manufacturer TEXT,
      catalog_number TEXT,
      lot_number TEXT,
      properties TEXT,
      created TEXT NOT NULL DEFAULT (datetime('now')),
      last_updated TEXT NOT NULL DEFAULT (datetime('now')),
      created_by INTEGER REFERENCES users(id),
      updated_by INTEGER REFERENCES users(id)
    )
  `)

  // Specimen types
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS specimen_type (
      id INTEGER PRIMARY KEY,
      name TEXT NOT NULL UNIQUE,
      created TEXT NOT NULL,
      last_updated TEXT NOT NULL
    )
  `)

  // Specimens
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS specimen (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      study_subject_id INTEGER REFERENCES study_subject(id),
      control_batch_id INTEGER REFERENCES control_batch(id),
      specimen_type_id INTEGER NOT NULL REFERENCES specimen_type(id),
      collection_date TEXT,
      created TEXT NOT NULL DEFAULT (datetime('now')),
      last_updated TEXT NOT NULL DEFAULT (datetime('now')),
      created_by INTEGER REFERENCES users(id),
      updated_by INTEGER REFERENCES users(id),
      CHECK ((study_subject_id IS NOT NULL AND control_batch_id IS NULL) OR
             (study_subject_id IS NULL AND control_batch_id IS NOT NULL))
    )
  `)

  sqlite.exec(`CREATE INDEX IF NOT EXISTS specimen_study_subject_id_idx ON specimen(study_subject_id)`)
  sqlite.exec(`CREATE INDEX IF NOT EXISTS specimen_control_batch_id_idx ON specimen(control_batch_id)`)
  sqlite.exec(`CREATE INDEX IF NOT EXISTS specimen_collection_date_idx ON specimen(collection_date)`)
  sqlite.exec(`CREATE INDEX IF NOT EXISTS specimen_specimen_type_id_idx ON specimen(specimen_type_id)`)
  sqlite.exec(`CREATE UNIQUE INDEX IF NOT EXISTS idx_specimen_study_subject_type_date ON specimen(study_subject_id, specimen_type_id, collection_date) WHERE study_subject_id IS NOT NULL`)
  sqlite.exec(`CREATE UNIQUE INDEX IF NOT EXISTS idx_specimen_control_batch_type_date ON specimen(control_batch_id, specimen_type_id, collection_date) WHERE control_batch_id IS NOT NULL`)

  // Storage containers
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS storage_container (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      specimen_id INTEGER NOT NULL REFERENCES specimen(id),
      comment TEXT,
      total_quantity REAL DEFAULT 1.0,
      remaining_quantity REAL DEFAULT 1.0,
      unit_id INTEGER NOT NULL REFERENCES unit(id),
      created TEXT NOT NULL DEFAULT (datetime('now')),
      last_updated TEXT NOT NULL DEFAULT (datetime('now')),
      created_by INTEGER REFERENCES users(id),
      updated_by INTEGER REFERENCES users(id)
    )
  `)

  sqlite.exec(`CREATE INDEX IF NOT EXISTS storage_container_specimen_id_idx ON storage_container(specimen_id)`)

  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS storage_container_tag (
      storage_container_id INTEGER NOT NULL REFERENCES storage_container(id),
      tag_id INTEGER NOT NULL REFERENCES tag(id),
      PRIMARY KEY (storage_container_id, tag_id)
    )
  `)

  // Locations
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS location (
      id INTEGER PRIMARY KEY,
      parent_id INTEGER REFERENCES location(id),
      name TEXT NOT NULL,
      storage_type_id TEXT,
      description TEXT,
      can_contain_collections INTEGER NOT NULL DEFAULT 0,
      path TEXT,
      created TEXT NOT NULL DEFAULT (datetime('now')),
      last_updated TEXT NOT NULL DEFAULT (datetime('now')),
      created_by INTEGER REFERENCES users(id),
      updated_by INTEGER REFERENCES users(id),
      UNIQUE (parent_id, name),
      CHECK ((parent_id IS NULL AND storage_type_id IS NOT NULL) OR
             (parent_id IS NOT NULL AND storage_type_id IS NULL))
    )
  `)

  sqlite.exec(`CREATE INDEX IF NOT EXISTS idx_location_parent_id ON location(parent_id)`)
  sqlite.exec(`CREATE INDEX IF NOT EXISTS idx_location_path ON location(path)`)

  // Container collections
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS micronix_plate (
      id INTEGER PRIMARY KEY,
      location_id INTEGER NOT NULL REFERENCES location(id),
      name TEXT NOT NULL UNIQUE,
      barcode TEXT UNIQUE,
      created TEXT NOT NULL DEFAULT (datetime('now')),
      last_updated TEXT NOT NULL DEFAULT (datetime('now')),
      created_by INTEGER REFERENCES users(id),
      updated_by INTEGER REFERENCES users(id)
    )
  `)

  sqlite.exec(`CREATE INDEX IF NOT EXISTS micronix_plate_location_id_idx ON micronix_plate(location_id)`)

  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS micronix_tube (
      id INTEGER PRIMARY KEY REFERENCES storage_container(id),
      collection_id INTEGER NOT NULL REFERENCES micronix_plate(id),
      barcode TEXT NOT NULL UNIQUE,
      position TEXT
    )
  `)

  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS cryovial_box (
      id INTEGER PRIMARY KEY,
      location_id INTEGER NOT NULL REFERENCES location(id),
      name TEXT NOT NULL UNIQUE,
      barcode TEXT UNIQUE,
      created TEXT NOT NULL DEFAULT (datetime('now')),
      last_updated TEXT NOT NULL DEFAULT (datetime('now')),
      created_by INTEGER REFERENCES users(id),
      updated_by INTEGER REFERENCES users(id)
    )
  `)

  sqlite.exec(`CREATE INDEX IF NOT EXISTS cryovial_box_location_id_idx ON cryovial_box(location_id)`)

  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS cryovial_tube (
      id INTEGER PRIMARY KEY REFERENCES storage_container(id),
      collection_id INTEGER NOT NULL REFERENCES cryovial_box(id),
      barcode TEXT,
      position TEXT
    )
  `)

  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS box (
      id INTEGER PRIMARY KEY,
      location_id INTEGER NOT NULL REFERENCES location(id),
      name TEXT NOT NULL UNIQUE,
      created TEXT NOT NULL,
      last_updated TEXT NOT NULL,
      created_by INTEGER REFERENCES users(id),
      updated_by INTEGER REFERENCES users(id)
    )
  `)

  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS bag (
      id INTEGER PRIMARY KEY,
      location_id INTEGER NOT NULL REFERENCES location(id),
      name TEXT NOT NULL UNIQUE,
      created TEXT NOT NULL,
      last_updated TEXT NOT NULL,
      created_by INTEGER REFERENCES users(id),
      updated_by INTEGER REFERENCES users(id)
    )
  `)

  sqlite.exec(`CREATE INDEX IF NOT EXISTS bag_location_id_idx ON bag(location_id)`)

  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS sheet (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      box_id INTEGER REFERENCES box(id),
      bag_id INTEGER REFERENCES bag(id),
      created TEXT NOT NULL DEFAULT (datetime('now')),
      last_updated TEXT NOT NULL DEFAULT (datetime('now')),
      created_by INTEGER REFERENCES users(id),
      updated_by INTEGER REFERENCES users(id),
      UNIQUE (name, box_id, bag_id),
      CHECK ((box_id IS NOT NULL AND bag_id IS NULL) OR
             (box_id IS NULL AND bag_id IS NOT NULL) OR
             (box_id IS NULL AND bag_id IS NULL))
    )
  `)

  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS paper (
      id INTEGER PRIMARY KEY REFERENCES storage_container(id),
      sheet_id INTEGER NOT NULL REFERENCES sheet(id),
      barcode TEXT,
      position TEXT
    )
  `)

  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS static_well (
      id INTEGER PRIMARY KEY REFERENCES storage_container(id),
      collection_id INTEGER NOT NULL REFERENCES micronix_plate(id),
      position TEXT
    )
  `)

  // Additional reference tables
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS strain (
      id INTEGER PRIMARY KEY,
      name TEXT NOT NULL UNIQUE,
      description TEXT
    )
  `)

  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS storage_type (
      id INTEGER PRIMARY KEY,
      name TEXT NOT NULL UNIQUE,
      description TEXT
    )
  `)

  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS version (
      name TEXT NOT NULL
    )
  `)

  // Settings table - this is the one that was missing user_id
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS settings (
      key TEXT NOT NULL,
      user_id INTEGER REFERENCES users(id),
      value TEXT NOT NULL,
      PRIMARY KEY (key, user_id)
    )
  `)

  sqlite.exec(`CREATE INDEX IF NOT EXISTS settings_user_id_idx ON settings(user_id)`)

  // Junction tables
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS specimen_type_container_type (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      specimen_type_id INTEGER NOT NULL REFERENCES specimen_type(id) ON DELETE CASCADE,
      container_type TEXT NOT NULL CHECK (container_type IN ('paper', 'cryovial_tube', 'micronix_tube', 'static_well')),
      created TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE (specimen_type_id, container_type)
    )
  `)

  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS container_type_unit (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      container_type TEXT NOT NULL CHECK (container_type IN ('paper', 'cryovial_tube', 'micronix_tube', 'static_well')),
      unit_id INTEGER NOT NULL REFERENCES unit(id) ON DELETE CASCADE,
      created TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE (container_type, unit_id)
    )
  `)

  // Container derivations
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS container_derivation (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      parent_container_id INTEGER NOT NULL REFERENCES storage_container(id),
      child_container_id INTEGER NOT NULL REFERENCES storage_container(id),
      derivation_type TEXT NOT NULL,
      derivation_date TEXT,
      operator_id INTEGER REFERENCES users(id),
      protocol TEXT,
      notes TEXT,
      properties TEXT,
      created TEXT NOT NULL DEFAULT (datetime('now')),
      CHECK (parent_container_id != child_container_id),
      UNIQUE (child_container_id)
    )
  `)

  sqlite.exec(`CREATE INDEX IF NOT EXISTS idx_container_derivation_parent ON container_derivation(parent_container_id)`)
  sqlite.exec(`CREATE INDEX IF NOT EXISTS idx_container_derivation_child ON container_derivation(child_container_id)`)
  sqlite.exec(`CREATE INDEX IF NOT EXISTS idx_container_derivation_type ON container_derivation(derivation_type)`)
  sqlite.exec(`CREATE INDEX IF NOT EXISTS idx_container_derivation_date ON container_derivation(derivation_date)`)

  // Error logging
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS error_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      timestamp TEXT NOT NULL DEFAULT (datetime('now')),
      source TEXT NOT NULL,
      level TEXT NOT NULL,
      message TEXT NOT NULL,
      error_code TEXT,
      stack TEXT,
      context TEXT,
      user_id INTEGER,
      url TEXT,
      user_agent TEXT,
      resolved INTEGER NOT NULL DEFAULT 0,
      resolved_at TEXT,
      resolved_by INTEGER
    )
  `)
  sqlite.exec(`CREATE INDEX IF NOT EXISTS error_logs_timestamp_idx ON error_logs(timestamp)`)
  sqlite.exec(`CREATE INDEX IF NOT EXISTS error_logs_source_idx ON error_logs(source)`)
  sqlite.exec(`CREATE INDEX IF NOT EXISTS error_logs_level_idx ON error_logs(level)`)
  sqlite.exec(`CREATE INDEX IF NOT EXISTS error_logs_resolved_idx ON error_logs(resolved)`)

  // qPCR experiments (template tests)
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS qpcr_experiment (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT,
      template_format TEXT NOT NULL,
      status TEXT NOT NULL,
      standard_layout TEXT,
      plate_barcode TEXT,
      instrument_type TEXT,
      created TEXT NOT NULL DEFAULT (datetime('now')),
      last_updated TEXT NOT NULL DEFAULT (datetime('now')),
      created_by INTEGER REFERENCES users(id),
      updated_by INTEGER REFERENCES users(id)
    )
  `)
  sqlite.exec(`CREATE INDEX IF NOT EXISTS qpcr_experiment_status_idx ON qpcr_experiment(status)`)

  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS qpcr_experiment_target (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      qpcr_experiment_id INTEGER NOT NULL REFERENCES qpcr_experiment(id) ON DELETE CASCADE,
      target_name TEXT NOT NULL,
      fluorophore TEXT,
      reporter TEXT,
      sort_order INTEGER NOT NULL DEFAULT 0,
      UNIQUE (qpcr_experiment_id, target_name)
    )
  `)
  sqlite.exec(`CREATE INDEX IF NOT EXISTS qpcr_experiment_target_experiment_idx ON qpcr_experiment_target(qpcr_experiment_id)`)

  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS qpcr_experiment_well (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      qpcr_experiment_id INTEGER NOT NULL REFERENCES qpcr_experiment(id) ON DELETE CASCADE,
      well_position TEXT NOT NULL,
      barcode TEXT,
      storage_container_id INTEGER REFERENCES storage_container(id),
      specimen_id INTEGER REFERENCES specimen(id),
      content_type TEXT,
      standard_density REAL,
      cq REAL,
      starting_quantity REAL,
      cq_mean REAL,
      raw_sample_name TEXT,
      UNIQUE (qpcr_experiment_id, well_position)
    )
  `)
  sqlite.exec(`CREATE INDEX IF NOT EXISTS qpcr_experiment_well_experiment_idx ON qpcr_experiment_well(qpcr_experiment_id)`)
  sqlite.exec(`CREATE INDEX IF NOT EXISTS qpcr_experiment_well_specimen_idx ON qpcr_experiment_well(specimen_id)`)
}

/**
 * Sets up a test database with full schema using SQL DDL
 * This recreates the schema from scratch without using migrations
 */
export async function setupTestDatabase(): Promise<{ db: DrizzleDatabase; sqlite: Database }> {
  const { db, sqlite } = createTestDatabase()
  
  // Create the schema using SQL DDL
  createSchema(sqlite)

  return { db, sqlite }
}

/**
 * Cleans up test database
 */
export function cleanupTestDatabase(sqlite: Database) {
  sqlite.close()
}

/**
 * Reset the test database by dropping all tables and recreating schema
 */
export async function resetTestDatabase(sqlite: Database, db: DrizzleDatabase) {
  // Get all table names
  const tables = sqlite.prepare(`
    SELECT name FROM sqlite_master 
    WHERE type='table' AND name NOT LIKE 'sqlite_%'
  `).all() as Array<{ name: string }>

  // Drop all tables
  for (const table of tables) {
    sqlite.exec(`DROP TABLE IF EXISTS ${table.name}`)
  }

  // Recreate schema
  createSchema(sqlite)
}

