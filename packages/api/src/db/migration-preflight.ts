import { Database } from 'bun:sqlite'

function tableExists(sqlite: Database, name: string): boolean {
  const row = sqlite
    .prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name = ?`)
    .get(name)
  return row != null
}

/**
 * Migration 003 renames paper.barcode → sublabel. Ensure a legacy-shaped paper table
 * exists before running it on databases that predate paper storage (study/settings only).
 */
export function ensureLegacyPaperTableForMigration003(sqlite: Database): void {
  if (tableExists(sqlite, 'paper')) {
    return
  }

  if (!tableExists(sqlite, 'storage_container')) {
    sqlite.exec(`CREATE TABLE IF NOT EXISTS storage_container (
      id INTEGER PRIMARY KEY,
      specimen_id INTEGER,
      unit_id INTEGER,
      total_quantity REAL,
      remaining_quantity REAL,
      comment TEXT,
      created TEXT,
      last_updated TEXT
    )`)
  }

  if (!tableExists(sqlite, 'sheet')) {
    sqlite.exec(`CREATE TABLE IF NOT EXISTS sheet (
      id INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      box_id INTEGER,
      bag_id INTEGER,
      created TEXT,
      last_updated TEXT
    )`)
  }

  sqlite.exec(`CREATE TABLE paper (
    id INTEGER PRIMARY KEY REFERENCES storage_container(id),
    sheet_id INTEGER NOT NULL REFERENCES sheet(id),
    barcode TEXT,
    position TEXT
  )`)

  if (process.env.NODE_ENV !== 'production') {
    console.warn('⚠️  paper table was missing; created legacy stub before migration 003')
  }
}
