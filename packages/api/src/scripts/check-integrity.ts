#!/usr/bin/env bun

/**
 * Database Integrity Check Script
 * 
 * This script checks all foreign key relationships in the database to identify
 * orphaned records (records that reference non-existent parent records).
 * 
 * Usage:
 *   DATABASE_PATH=path/to/database.sqlite bun src/scripts/check-integrity.ts
 *   DATABASE_PATH=path/to/database.sqlite bun src/scripts/check-integrity.ts --export-csv
 *   DATABASE_PATH=path/to/database.sqlite bun src/scripts/check-integrity.ts --export-json
 */

import { openOperationalDatabase } from '../db/client'
import { writeFileSync } from 'fs'
import { join } from 'path'

interface IntegrityIssue {
  table: string
  column: string
  referencedTable: string
  referencedColumn: string
  orphanedCount: number
  orphanedIds: number[]
  description: string
}

interface IntegrityReport {
  timestamp: string
  databasePath: string
  totalIssues: number
  totalOrphanedRecords: number
  issues: IntegrityIssue[]
  summary: {
    [table: string]: {
      issues: number
      orphanedRecords: number
    }
  }
}

/**
 * Check a foreign key relationship for orphaned records
 */
function checkForeignKey(
  sqlite: any,
  table: string,
  column: string,
  referencedTable: string,
  referencedColumn: string = 'id',
  description: string
): IntegrityIssue | null {
  // Use LEFT JOIN to find records where the foreign key is not NULL
  // but the referenced record doesn't exist
  // For self-references (table === referencedTable), use table aliases
  const isSelfReference = table === referencedTable
  
  let query: string
  if (isSelfReference) {
    query = `
      SELECT COUNT(*) as count, GROUP_CONCAT(t1.id) as ids
      FROM ${table} t1
      LEFT JOIN ${referencedTable} t2 ON t1.${column} = t2.${referencedColumn}
      WHERE t1.${column} IS NOT NULL
        AND t2.${referencedColumn} IS NULL
    `
  } else {
    query = `
      SELECT COUNT(*) as count, GROUP_CONCAT(${table}.id) as ids
      FROM ${table}
      LEFT JOIN ${referencedTable} ON ${table}.${column} = ${referencedTable}.${referencedColumn}
      WHERE ${table}.${column} IS NOT NULL
        AND ${referencedTable}.${referencedColumn} IS NULL
    `
  }

  try {
    const result = sqlite.prepare(query).get() as { count: number; ids: string | null }
    const count = result.count || 0

    if (count > 0) {
      const orphanedIds = result.ids
        ? result.ids.split(',').map((id: string) => parseInt(id.trim(), 10)).filter((id: number) => !isNaN(id))
        : []

      return {
        table,
        column,
        referencedTable,
        referencedColumn,
        orphanedCount: count,
        orphanedIds: orphanedIds.slice(0, 100), // Limit to first 100 IDs for report
        description,
      }
    }
  } catch (error: any) {
    // Table or column might not exist, skip silently
    if (error.message?.includes('no such table') || error.message?.includes('no such column')) {
      return null
    }
    console.error(`Error checking ${table}.${column}: ${error.message}`)
  }

  return null
}

/**
 * Get all orphaned IDs for a relationship (for CSV export)
 */
function getOrphanedIds(
  sqlite: any,
  table: string,
  column: string,
  referencedTable: string,
  referencedColumn: string = 'id'
): Array<Record<string, any>> {
  // For self-references (table === referencedTable), use table aliases
  const isSelfReference = table === referencedTable
  
  let query: string
  if (isSelfReference) {
    query = `
      SELECT t1.*
      FROM ${table} t1
      LEFT JOIN ${referencedTable} t2 ON t1.${column} = t2.${referencedColumn}
      WHERE t1.${column} IS NOT NULL
        AND t2.${referencedColumn} IS NULL
      LIMIT 10000
    `
  } else {
    query = `
      SELECT ${table}.*
      FROM ${table}
      LEFT JOIN ${referencedTable} ON ${table}.${column} = ${referencedTable}.${referencedColumn}
      WHERE ${table}.${column} IS NOT NULL
        AND ${referencedTable}.${referencedColumn} IS NULL
      LIMIT 10000
    `
  }

  try {
    return sqlite.prepare(query).all() as Array<Record<string, any>>
  } catch (error: any) {
    if (error.message?.includes('no such table') || error.message?.includes('no such column')) {
      return []
    }
    console.error(`Error getting orphaned IDs for ${table}.${column}: ${error.message}`)
    return []
  }
}

/**
 * Main integrity check function
 */
function checkDatabaseIntegrity(sqlite: any): IntegrityReport {
  const issues: IntegrityIssue[] = []
  const startTime = new Date().toISOString()

  console.log('🔍 Starting database integrity check...\n')

  // Specimen-related checks
  console.log('Checking specimen relationships...')
  const specimenIssues = [
    checkForeignKey(sqlite, 'specimen', 'study_subject_id', 'study_subject', 'id', 'Specimens with non-existent study_subject_id'),
    checkForeignKey(sqlite, 'specimen', 'control_batch_id', 'control_batch', 'id', 'Specimens with non-existent control_batch_id'),
    checkForeignKey(sqlite, 'specimen', 'specimen_type_id', 'specimen_type', 'id', 'Specimens with non-existent specimen_type_id'),
    checkForeignKey(sqlite, 'specimen', 'created_by', 'users', 'id', 'Specimens with non-existent created_by user'),
    checkForeignKey(sqlite, 'specimen', 'updated_by', 'users', 'id', 'Specimens with non-existent updated_by user'),
  ]
  issues.push(...specimenIssues.filter((issue): issue is IntegrityIssue => issue !== null))

  // Study Subject-related checks
  console.log('Checking study_subject relationships...')
  const studySubjectIssues = [
    checkForeignKey(sqlite, 'study_subject', 'study_id', 'study', 'id', 'Study subjects with non-existent study_id'),
    checkForeignKey(sqlite, 'study_subject', 'created_by', 'users', 'id', 'Study subjects with non-existent created_by user'),
    checkForeignKey(sqlite, 'study_subject', 'updated_by', 'users', 'id', 'Study subjects with non-existent updated_by user'),
  ]
  issues.push(...studySubjectIssues.filter((issue): issue is IntegrityIssue => issue !== null))

  // Storage Container-related checks
  console.log('Checking storage_container relationships...')
  const containerIssues = [
    checkForeignKey(sqlite, 'storage_container', 'specimen_id', 'specimen', 'id', 'Storage containers with non-existent specimen_id'),
    checkForeignKey(sqlite, 'storage_container', 'unit_id', 'unit', 'id', 'Storage containers with non-existent unit_id'),
    checkForeignKey(sqlite, 'storage_container', 'created_by', 'users', 'id', 'Storage containers with non-existent created_by user'),
    checkForeignKey(sqlite, 'storage_container', 'updated_by', 'users', 'id', 'Storage containers with non-existent updated_by user'),
  ]
  issues.push(...containerIssues.filter((issue): issue is IntegrityIssue => issue !== null))

  // Control-related checks
  console.log('Checking control_batch relationships...')
  const controlIssues = [
    checkForeignKey(sqlite, 'control_batch', 'control_definition_id', 'control_definition', 'id', 'Control batches with non-existent control_definition_id'),
    checkForeignKey(sqlite, 'control_batch', 'created_by', 'users', 'id', 'Control batches with non-existent created_by user'),
    checkForeignKey(sqlite, 'control_batch', 'updated_by', 'users', 'id', 'Control batches with non-existent updated_by user'),
  ]
  issues.push(...controlIssues.filter((issue): issue is IntegrityIssue => issue !== null))

  // Location-related checks
  console.log('Checking location relationships...')
  const locationIssues = [
    checkForeignKey(sqlite, 'location', 'parent_id', 'location', 'id', 'Locations with non-existent parent_id'),
    checkForeignKey(sqlite, 'location', 'storage_type_id', 'storage_type', 'id', 'Locations with non-existent storage_type_id'),
    checkForeignKey(sqlite, 'location', 'created_by', 'users', 'id', 'Locations with non-existent created_by user'),
    checkForeignKey(sqlite, 'location', 'updated_by', 'users', 'id', 'Locations with non-existent updated_by user'),
  ]
  issues.push(...locationIssues.filter((issue): issue is IntegrityIssue => issue !== null))

  // Collection-related checks
  console.log('Checking collection relationships...')
  const collectionIssues = [
    checkForeignKey(sqlite, 'micronix_plate', 'location_id', 'location', 'id', 'Micronix plates with non-existent location_id'),
    checkForeignKey(sqlite, 'micronix_plate', 'created_by', 'users', 'id', 'Micronix plates with non-existent created_by user'),
    checkForeignKey(sqlite, 'micronix_plate', 'updated_by', 'users', 'id', 'Micronix plates with non-existent updated_by user'),
    checkForeignKey(sqlite, 'micronix_tube', 'id', 'storage_container', 'id', 'Micronix tubes with non-existent storage_container id'),
    checkForeignKey(sqlite, 'micronix_tube', 'collection_id', 'micronix_plate', 'id', 'Micronix tubes with non-existent collection_id'),
    checkForeignKey(sqlite, 'cryovial_box', 'location_id', 'location', 'id', 'Cryovial boxes with non-existent location_id'),
    checkForeignKey(sqlite, 'cryovial_box', 'created_by', 'users', 'id', 'Cryovial boxes with non-existent created_by user'),
    checkForeignKey(sqlite, 'cryovial_box', 'updated_by', 'users', 'id', 'Cryovial boxes with non-existent updated_by user'),
    checkForeignKey(sqlite, 'cryovial_tube', 'id', 'storage_container', 'id', 'Cryovial tubes with non-existent storage_container id'),
    checkForeignKey(sqlite, 'cryovial_tube', 'collection_id', 'cryovial_box', 'id', 'Cryovial tubes with non-existent collection_id'),
    checkForeignKey(sqlite, 'box', 'location_id', 'location', 'id', 'Boxes with non-existent location_id'),
    checkForeignKey(sqlite, 'box', 'created_by', 'users', 'id', 'Boxes with non-existent created_by user'),
    checkForeignKey(sqlite, 'box', 'updated_by', 'users', 'id', 'Boxes with non-existent updated_by user'),
    checkForeignKey(sqlite, 'bag', 'location_id', 'location', 'id', 'Bags with non-existent location_id'),
    checkForeignKey(sqlite, 'bag', 'created_by', 'users', 'id', 'Bags with non-existent created_by user'),
    checkForeignKey(sqlite, 'bag', 'updated_by', 'users', 'id', 'Bags with non-existent updated_by user'),
    checkForeignKey(sqlite, 'sheet', 'box_id', 'box', 'id', 'Sheets with non-existent box_id'),
    checkForeignKey(sqlite, 'sheet', 'bag_id', 'bag', 'id', 'Sheets with non-existent bag_id'),
    checkForeignKey(sqlite, 'sheet', 'created_by', 'users', 'id', 'Sheets with non-existent created_by user'),
    checkForeignKey(sqlite, 'sheet', 'updated_by', 'users', 'id', 'Sheets with non-existent updated_by user'),
    checkForeignKey(sqlite, 'paper', 'id', 'storage_container', 'id', 'Papers with non-existent storage_container id'),
    checkForeignKey(sqlite, 'paper', 'sheet_id', 'sheet', 'id', 'Papers with non-existent sheet_id'),
    checkForeignKey(sqlite, 'static_well', 'id', 'storage_container', 'id', 'Static wells with non-existent storage_container id'),
    checkForeignKey(sqlite, 'static_well', 'collection_id', 'micronix_plate', 'id', 'Static wells with non-existent collection_id'),
  ]
  issues.push(...collectionIssues.filter((issue): issue is IntegrityIssue => issue !== null))

  // Junction table checks
  console.log('Checking junction table relationships...')
  const junctionIssues = [
    checkForeignKey(sqlite, 'storage_container_tag', 'storage_container_id', 'storage_container', 'id', 'Storage container tags with non-existent storage_container_id'),
    checkForeignKey(sqlite, 'storage_container_tag', 'tag_id', 'tag', 'id', 'Storage container tags with non-existent tag_id'),
    checkForeignKey(sqlite, 'specimen_type_container_type', 'specimen_type_id', 'specimen_type', 'id', 'Specimen type container types with non-existent specimen_type_id'),
    checkForeignKey(sqlite, 'container_type_unit', 'unit_id', 'unit', 'id', 'Container type units with non-existent unit_id'),
  ]
  issues.push(...junctionIssues.filter((issue): issue is IntegrityIssue => issue !== null))

  // Derivation-related checks
  console.log('Checking container_derivation relationships...')
  const derivationIssues = [
    checkForeignKey(sqlite, 'container_derivation', 'parent_container_id', 'storage_container', 'id', 'Container derivations with non-existent parent_container_id'),
    checkForeignKey(sqlite, 'container_derivation', 'child_container_id', 'storage_container', 'id', 'Container derivations with non-existent child_container_id'),
    checkForeignKey(sqlite, 'container_derivation', 'operator_id', 'users', 'id', 'Container derivations with non-existent operator_id'),
  ]
  issues.push(...derivationIssues.filter((issue): issue is IntegrityIssue => issue !== null))

  // Other checks
  console.log('Checking other relationships...')
  const otherIssues = [
    checkForeignKey(sqlite, 'sessions', 'user_id', 'users', 'id', 'Sessions with non-existent user_id'),
    checkForeignKey(sqlite, 'settings', 'user_id', 'users', 'id', 'Settings with non-existent user_id'),
    checkForeignKey(sqlite, 'study', 'created_by', 'users', 'id', 'Studies with non-existent created_by user'),
    checkForeignKey(sqlite, 'study', 'updated_by', 'users', 'id', 'Studies with non-existent updated_by user'),
  ]
  issues.push(...otherIssues.filter((issue): issue is IntegrityIssue => issue !== null))

  // Calculate summary
  const totalOrphanedRecords = issues.reduce((sum, issue) => sum + issue.orphanedCount, 0)
  const summary: { [table: string]: { issues: number; orphanedRecords: number } } = {}

  for (const issue of issues) {
    const entry = summary[issue.table] ??= { issues: 0, orphanedRecords: 0 }
    entry.issues++
    entry.orphanedRecords += issue.orphanedCount
  }

  const databasePath = process.env.DATABASE_PATH || 'sampledb_dev.sqlite'

  return {
    timestamp: startTime,
    databasePath,
    totalIssues: issues.length,
    totalOrphanedRecords,
    issues,
    summary,
  }
}

/**
 * Export issues to CSV files
 */
function exportToCSV(report: IntegrityReport, sqlite: any) {
  const exportDir = join(process.cwd(), 'integrity-reports')
  try {
    const { mkdirSync } = require('fs')
    mkdirSync(exportDir, { recursive: true })
  } catch (e) {
    // Directory might already exist
  }

  for (const issue of report.issues) {
    const orphanedRecords = getOrphanedIds(
      sqlite,
      issue.table,
      issue.column,
      issue.referencedTable,
      issue.referencedColumn
    )

    if (orphanedRecords.length > 0) {
      // Create CSV content
      const headers = Object.keys(orphanedRecords[0]).join(',')
      const rows = orphanedRecords.map(record =>
        Object.values(record).map(val => {
          const str = String(val ?? '')
          // Escape commas and quotes
          if (str.includes(',') || str.includes('"') || str.includes('\n')) {
            return `"${str.replace(/"/g, '""')}"`
          }
          return str
        }).join(',')
      )

      const csvContent = [headers, ...rows].join('\n')
      const filename = `${issue.table}_${issue.column}_orphaned.csv`
      const filepath = join(exportDir, filename)

      writeFileSync(filepath, csvContent, 'utf-8')
      console.log(`  📄 Exported ${orphanedRecords.length} records to ${filepath}`)
    }
  }
}

/**
 * Main execution
 */
function main() {
  const args = process.argv.slice(2)
  const exportCsv = args.includes('--export-csv')
  const exportJson = args.includes('--export-json')

  try {
    // Connect to database
    const { sqlite } = openOperationalDatabase()

    // Run integrity checks
    const report = checkDatabaseIntegrity(sqlite)

    // Print summary
    console.log('\n' + '='.repeat(80))
    console.log('📊 INTEGRITY CHECK SUMMARY')
    console.log('='.repeat(80))
    console.log(`Database: ${report.databasePath}`)
    console.log(`Timestamp: ${report.timestamp}`)
    console.log(`Total Issues Found: ${report.totalIssues}`)
    console.log(`Total Orphaned Records: ${report.totalOrphanedRecords}`)
    console.log('')

    if (report.totalIssues === 0) {
      console.log('✅ No integrity issues found! Database is clean.')
    } else {
      console.log('⚠️  Integrity issues found:\n')

      // Group by table
      const byTable: { [table: string]: IntegrityIssue[] } = {}
      for (const issue of report.issues) {
        (byTable[issue.table] ??= []).push(issue)
      }

      // Print detailed report
      for (const [table, tableIssues] of Object.entries(byTable)) {
        console.log(`📋 ${table}:`)
        for (const issue of tableIssues) {
          console.log(`  ❌ ${issue.description}`)
          console.log(`     Orphaned records: ${issue.orphanedCount}`)
          if (issue.orphanedIds.length > 0 && issue.orphanedIds.length <= 20) {
            console.log(`     IDs: ${issue.orphanedIds.join(', ')}`)
          } else if (issue.orphanedIds.length > 20) {
            console.log(`     First 20 IDs: ${issue.orphanedIds.slice(0, 20).join(', ')}...`)
          }
          console.log('')
        }
      }

      // Summary by table
      console.log('\n📊 Summary by Table:')
      for (const [table, stats] of Object.entries(report.summary)) {
        console.log(`  ${table}: ${stats.issues} issue(s), ${stats.orphanedRecords} orphaned record(s)`)
      }
    }

    // Export to JSON if requested
    if (exportJson) {
      const jsonPath = join(process.cwd(), 'integrity-report.json')
      writeFileSync(jsonPath, JSON.stringify(report, null, 2), 'utf-8')
      console.log(`\n📄 Full report exported to: ${jsonPath}`)
    }

    // Export to CSV if requested
    if (exportCsv) {
      console.log('\n📄 Exporting detailed CSV files...')
      exportToCSV(report, sqlite)
    }

    console.log('\n' + '='.repeat(80))
    console.log('✅ Integrity check complete!')
    console.log('='.repeat(80) + '\n')

    // Close database connection
    sqlite.close()

    // Exit with error code if issues found
    if (report.totalIssues > 0) {
      process.exit(1)
    }
  } catch (error: any) {
    console.error('❌ Error running integrity check:', error.message)
    console.error(error.stack)
    process.exit(1)
  }
}

// Run if executed directly
if (import.meta.main) {
  main()
}
