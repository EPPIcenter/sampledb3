#!/usr/bin/env bun

/**
 * Restore Missing Study Subjects from Backup Database
 * 
 * This script restores missing study_subjects from the backup database
 * to fix the integrity issue where 1,547 specimens reference non-existent
 * study_subject_ids.
 * 
 * Usage:
 *   DATABASE_PATH=path/to/database.sqlite bun src/scripts/restore-missing-study-subjects.ts
 *   DATABASE_PATH=path/to/database.sqlite bun src/scripts/restore-missing-study-subjects.ts --dry-run
 */

import { openOperationalDatabase } from '../db/client'
import { Database as SQLiteDatabase } from 'bun:sqlite'
import { readFileSync, existsSync } from 'fs'
import { join } from 'path'

interface StudySubject {
  id: number
  study_id: number
  name: string
  created: string
  last_updated: string
}

/**
 * Read missing study_subjects from backup database
 */
function readMissingStudySubjects(backupDbPath: string): StudySubject[] {
  const sqlite = new SQLiteDatabase(backupDbPath)
  
  // Get orphaned IDs from current database
  const currentDbPath = process.env.DATABASE_PATH || join(process.cwd(), '../../sampledb_database.sqlite')
  const currentDb = new SQLiteDatabase(currentDbPath)
  
  const orphanedIds = currentDb
    .prepare(`
      SELECT DISTINCT study_subject_id 
      FROM specimen 
      WHERE study_subject_id IS NOT NULL 
        AND NOT EXISTS (
          SELECT 1 FROM study_subject 
          WHERE study_subject.id = specimen.study_subject_id
        )
      ORDER BY study_subject_id
    `)
    .all() as Array<{ study_subject_id: number }>
  
  const ids = orphanedIds.map(r => r.study_subject_id)
  
  if (ids.length === 0) {
    console.log('✅ No missing study_subjects found!')
    currentDb.close()
    sqlite.close()
    return []
  }
  
  // Build query with placeholders
  const placeholders = ids.map(() => '?').join(',')
  const query = `
    SELECT id, study_id, name, created, last_updated
    FROM study_subject
    WHERE id IN (${placeholders})
    ORDER BY id
  `
  
  const studySubjects = sqlite.prepare(query).all(...ids) as StudySubject[]
  
  currentDb.close()
  sqlite.close()
  
  return studySubjects
}

/**
 * Verify all referenced studies exist
 */
function verifyStudiesExist(sqlite: SQLiteDatabase, studySubjects: StudySubject[]): boolean {
  const studyIds = [...new Set(studySubjects.map(s => s.study_id))]
  const placeholders = studyIds.map(() => '?').join(',')
  
  const existingStudies = sqlite
    .prepare(`SELECT id FROM study WHERE id IN (${placeholders})`)
    .all(...studyIds) as Array<{ id: number }>
  
  const existingIds = new Set(existingStudies.map(s => s.id))
  const missingStudies = studyIds.filter(id => !existingIds.has(id))
  
  if (missingStudies.length > 0) {
    console.error(`❌ Missing studies: ${missingStudies.join(', ')}`)
    return false
  }
  
  return true
}

/**
 * Restore missing study_subjects
 */
function restoreStudySubjects(
  sqlite: SQLiteDatabase,
  studySubjects: StudySubject[],
  dryRun: boolean = false
): { inserted: number; skipped: number; errors: number } {
  const stats = { inserted: 0, skipped: 0, errors: 0 }
  
  const insertStmt = sqlite.prepare(`
    INSERT INTO study_subject (id, study_id, name, created, last_updated, created_by, updated_by)
    VALUES (?, ?, ?, ?, ?, NULL, NULL)
  `)
  
  const checkStmt = sqlite.prepare('SELECT id FROM study_subject WHERE id = ?')
  
  for (const subject of studySubjects) {
    // Check if already exists (shouldn't, but be safe)
    const existing = checkStmt.get(subject.id)
    if (existing) {
      console.log(`⏭️  Skipping study_subject ${subject.id} (${subject.name}) - already exists`)
      stats.skipped++
      continue
    }
    
    if (dryRun) {
      console.log(`[DRY RUN] Would insert: ${subject.id} | ${subject.name} | study_id: ${subject.study_id}`)
      stats.inserted++
    } else {
      try {
        insertStmt.run(
          subject.id,
          subject.study_id,
          subject.name,
          subject.created,
          subject.last_updated
        )
        stats.inserted++
        if (stats.inserted % 100 === 0) {
          console.log(`  Inserted ${stats.inserted}/${studySubjects.length}...`)
        }
      } catch (error: any) {
        console.error(`❌ Error inserting study_subject ${subject.id}: ${error.message}`)
        stats.errors++
      }
    }
  }
  
  return stats
}

/**
 * Main execution
 */
async function main() {
  const args = process.argv.slice(2)
  const dryRun = args.includes('--dry-run')
  
  try {
    const backupDbPath = join(process.cwd(), '../../sampledb_database_bk.sqlite')
    
    if (!existsSync(backupDbPath)) {
      console.error(`❌ Backup database not found: ${backupDbPath}`)
      process.exit(1)
    }
    
    console.log('📖 Reading missing study_subjects from backup database...')
    const missingSubjects = readMissingStudySubjects(backupDbPath)
    
    if (missingSubjects.length === 0) {
      console.log('✅ No missing study_subjects to restore!')
      return
    }
    
    console.log(`📊 Found ${missingSubjects.length} missing study_subjects to restore\n`)
    
    // Connect to current database
    const { sqlite } = openOperationalDatabase()
    
    // Verify studies exist
    console.log('🔍 Verifying referenced studies exist...')
    if (!verifyStudiesExist(sqlite, missingSubjects)) {
      console.error('❌ Cannot proceed: Some referenced studies are missing')
      sqlite.close()
      process.exit(1)
    }
    console.log('✅ All referenced studies exist\n')
    
    // Show sample
    console.log('📋 Sample of study_subjects to restore:')
    missingSubjects.slice(0, 10).forEach(s => {
      console.log(`  ${s.id} | ${s.name} | study_id: ${s.study_id}`)
    })
    if (missingSubjects.length > 10) {
      console.log(`  ... and ${missingSubjects.length - 10} more\n`)
    } else {
      console.log('')
    }
    
    if (dryRun) {
      console.log('🔍 DRY RUN MODE - No changes will be made\n')
    } else {
      console.log('⚠️  This will modify the database. Proceeding in 3 seconds...')
      console.log('   (Press Ctrl+C to cancel)\n')
      await new Promise(resolve => setTimeout(resolve, 3000))
    }
    
    // Restore study_subjects
    console.log('💾 Restoring study_subjects...')
    const stats = restoreStudySubjects(sqlite, missingSubjects, dryRun)
    
    console.log('\n' + '='.repeat(80))
    console.log('📊 RESTORATION SUMMARY')
    console.log('='.repeat(80))
    console.log(`Inserted: ${stats.inserted}`)
    console.log(`Skipped: ${stats.skipped}`)
    console.log(`Errors: ${stats.errors}`)
    console.log('='.repeat(80) + '\n')
    
    if (!dryRun && stats.inserted > 0) {
      console.log('✅ Restoration complete!')
      console.log('🔍 Running integrity check to verify...\n')
      
      // Run integrity check
      const { execSync } = await import('child_process')
      try {
        execSync(
          `DATABASE_PATH=${process.env.DATABASE_PATH || '../../sampledb_database.sqlite'} bun src/scripts/check-integrity.ts`,
          { cwd: join(process.cwd(), '..'), stdio: 'inherit' }
        )
      } catch (e) {
        console.error('⚠️  Integrity check failed or found remaining issues')
      }
    }
    
    sqlite.close()
  } catch (error: any) {
    console.error('❌ Error:', error.message)
    console.error(error.stack)
    process.exit(1)
  }
}

// Run if executed directly
if (import.meta.main) {
  main()
}
