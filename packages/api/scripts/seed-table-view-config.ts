/**
 * Seed default table view configuration for existing databases that were
 * created before the table view configurations feature.
 *
 * Idempotent: does nothing if table_view_configurations already exist.
 *
 * Usage (from repo root):
 *   DATABASE_PATH=/path/to/sampledb.sqlite bun --filter @sampledb/api run seed-table-view-config
 *
 * Or from packages/api:
 *   DATABASE_PATH=/path/to/sampledb.sqlite bun run scripts/seed-table-view-config.ts
 */
import { openOperationalDatabase } from '../src/db/client'
import {
  getSetting,
  setTableViewConfigurations,
  DEFAULT_TABLE_VIEW_CONFIGURATIONS,
  type TableViewConfigurations,
} from '../src/lib/settings'

async function main(): Promise<void> {
  const dbPath = process.env.DATABASE_PATH
  if (!dbPath?.trim()) {
    console.error('DATABASE_PATH is required (e.g. DATABASE_PATH=./sampledb.sqlite)')
    process.exit(1)
  }

  const { db } = openOperationalDatabase(dbPath.trim())
  const existing = await getSetting<TableViewConfigurations>(db, 'table_view_configurations', null)

  if (existing?.configurations?.length) {
    console.log('Table view configurations already present; nothing to do.')
    process.exit(0)
  }

  await setTableViewConfigurations(db, DEFAULT_TABLE_VIEW_CONFIGURATIONS)
  console.log('Seeded default table view configuration.')
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
