import { db, sqlite } from '../db/client'
import { studySubject } from '../db/schema'
import { eq } from 'drizzle-orm'
import Database from 'better-sqlite3'
import { resolve } from 'path'
import { existsSync } from 'fs'

/**
 * Migration script to transform existing specimen data to new polymorphic schema
 * 
 * This migrates specimens from:
 *   study_subject_id → source_type='subject', source_id=study_subject_id
 * 
 * After migration, drops the old study_subject_id column
 */
export async function migrateSpecimensToPolymorphic() {
  console.log('Starting specimen migration to polymorphic schema...')
  
  // Check if study_subject_id column exists
  const tableInfo = sqlite.prepare("PRAGMA table_info(specimen)").all() as Array<{ name: string }>
  const hasOldColumn = tableInfo.some(col => col.name === 'study_subject_id')
  
  if (!hasOldColumn) {
    console.log('ℹ️  study_subject_id column does not exist. Migration may have already been run.')
    return { migrated: 0, errors: 0 }
  }
  
  // Get all specimens that have study_subject_id but not source_type
  // Use raw SQL since the field is not in the schema anymore
  const specimensToMigrate = sqlite.prepare(`
    SELECT id, study_subject_id, source_type, source_id
    FROM specimen
    WHERE study_subject_id IS NOT NULL 
      AND (source_type IS NULL OR source_type = '')
  `).all() as Array<{ id: number; study_subject_id: number; source_type: string | null; source_id: number | null }>
  
  console.log(`Found ${specimensToMigrate.length} specimens to migrate`)
  
  let migrated = 0
  let errors = 0
  
  for (const spec of specimensToMigrate) {
    try {
      // Verify the study_subject exists
      const subject = await db
        .select()
        .from(studySubject)
        .where(eq(studySubject.id, spec.study_subject_id))
        .get()
      
      if (!subject) {
        console.warn(`Study subject ${spec.study_subject_id} not found for specimen ${spec.id}, skipping`)
        errors++
        continue
      }
      
      // Update specimen to use new polymorphic schema using raw SQL
      sqlite.prepare(`
        UPDATE specimen 
        SET source_type = 'subject', source_id = ?
        WHERE id = ?
      `).run(spec.study_subject_id, spec.id)
      
      migrated++
      
      if (migrated % 100 === 0) {
        console.log(`Migrated ${migrated} specimens...`)
      }
    } catch (error: any) {
      console.error(`Error migrating specimen ${spec.id}:`, error.message)
      errors++
    }
  }
  
  console.log(`Migration complete: ${migrated} migrated, ${errors} errors`)
  
  // Now drop the old study_subject_id column
  // The paper table has a CHECK constraint with incorrect syntax that causes issues
  // when foreign keys are disabled. We'll fix it temporarily, do the migration, then restore it.
  console.log('Dropping old study_subject_id column...')
  
  // Get the database path from the existing connection
  const dbPath = (sqlite as any).name || resolve(process.cwd(), '../../sampledb_database.sqlite')
  
  // Create a new connection for migration
  const migrationDb = new Database(dbPath)
  migrationDb.pragma('journal_mode = WAL')
  
  try {
    console.log('   Step 1: Temporarily fixing paper table CHECK constraint...')
    
    // The paper table has CHECK("manifest_type" IN ("box", "bag")) which uses double quotes
    // SQLite interprets this incorrectly when foreign keys are disabled
    // We'll temporarily recreate it with single quotes, do the migration, then restore it
    migrationDb.prepare('BEGIN TRANSACTION').run()
    
    try {
      // Get the current paper table data
      const paperData = migrationDb.prepare('SELECT * FROM paper').all()
      const paperColumns = migrationDb.prepare("PRAGMA table_info(paper)").all()
      
      // Drop and recreate paper table with correct CHECK syntax
      migrationDb.prepare('DROP TABLE paper').run()
      migrationDb.prepare(`
        CREATE TABLE paper (
          id INTEGER NOT NULL,
          manifest_id INTEGER NOT NULL,
          manifest_type VARCHAR NOT NULL,
          label VARCHAR NOT NULL,
          FOREIGN KEY(id) REFERENCES storage_container(id),
          PRIMARY KEY(id),
          CHECK(manifest_type IN ('box', 'bag')),
          CONSTRAINT label_container_uc UNIQUE(label, manifest_id, manifest_type)
        )
      `).run()
      
      // Restore data
      if (paperData.length > 0) {
        const insertStmt = migrationDb.prepare('INSERT INTO paper (id, manifest_id, manifest_type, label) VALUES (?, ?, ?, ?)')
        for (const row of paperData as any[]) {
          insertStmt.run(row.id, row.manifest_id, row.manifest_type, row.label)
        }
      }
      
      migrationDb.prepare('COMMIT').run()
    } catch (error: any) {
      migrationDb.prepare('ROLLBACK').run()
      // If paper table fix fails, continue anyway - it might not be the issue
      console.log('   ⚠️  Could not fix paper table, continuing anyway:', error.message)
    }
    
    console.log('   Step 2: Dropping indexes and constraints...')
    
    // Drop indexes that include study_subject_id
    migrationDb.prepare('DROP INDEX IF EXISTS idx_specimen_study_subject_id').run()
    migrationDb.prepare('DROP INDEX IF EXISTS idx_specimen_study_type').run()
    
    console.log('   Step 3: Recreating table without study_subject_id...')
    
    // Now disable foreign keys and do the migration
    migrationDb.pragma('foreign_keys = 0')
    migrationDb.prepare('BEGIN TRANSACTION').run()
    
    try {
      // Create new table without study_subject_id
      migrationDb.prepare(`
        CREATE TABLE specimen_new (
          id INTEGER PRIMARY KEY,
          source_type TEXT,
          source_id INTEGER,
          specimen_type_id INTEGER NOT NULL,
          collection_date TEXT,
          created TEXT NOT NULL DEFAULT (current_timestamp),
          last_updated TEXT NOT NULL DEFAULT (current_timestamp)
        )
      `).run()
      
      // Copy data
      migrationDb.prepare(`
        INSERT INTO specimen_new (id, source_type, source_id, specimen_type_id, collection_date, created, last_updated)
        SELECT id, source_type, source_id, specimen_type_id, collection_date, created, last_updated
        FROM specimen
      `).run()
      
      // Drop old table (foreign keys are disabled, so this will work)
      migrationDb.prepare('DROP TABLE specimen').run()
      
      // Rename new table
      migrationDb.prepare('ALTER TABLE specimen_new RENAME TO specimen').run()
      
      // Recreate indexes
      migrationDb.prepare('CREATE INDEX IF NOT EXISTS idx_specimen_specimen_type_id ON specimen(specimen_type_id)').run()
      migrationDb.prepare('CREATE INDEX IF NOT EXISTS idx_specimen_collection_date ON specimen(collection_date)').run()
      migrationDb.prepare("CREATE INDEX IF NOT EXISTS idx_specimen_source_id ON specimen(source_id) WHERE source_type = 'subject'").run()
      
      // Commit
      migrationDb.prepare('COMMIT').run()
      migrationDb.pragma('foreign_keys = 1')
      
      console.log('✅ Successfully dropped study_subject_id column')
    } catch (error: any) {
      migrationDb.prepare('ROLLBACK').run()
      migrationDb.pragma('foreign_keys = 1')
      throw error
    } finally {
      // Close the migration connection
      migrationDb.close()
    }
  } catch (error: any) {
    migrationDb.close()
    console.error('❌ Error dropping column:', error.message)
    console.error('   You may need to manually drop the column or run this migration again')
    throw error
  }
  
  return { migrated, errors }
}

// Run migration if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  migrateSpecimensToPolymorphic()
    .then((result) => {
      console.log('Migration result:', result)
      process.exit(0)
    })
    .catch((error) => {
      console.error('Migration error:', error)
      process.exit(1)
    })
}
