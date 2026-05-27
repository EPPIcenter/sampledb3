import type { Database } from '../../db/client'
import { study } from '../../db/schema'
import { eq } from 'drizzle-orm'
import type { ContainerExportData, ExportSummary, StudyRecord } from './types'

export async function buildExportSummary(
  enrichedData: ContainerExportData[],
  requestedSubjectNames: string[],
  subjectNameToId: Map<string, number>,
  subjectIdToName: Map<number, string>
): Promise<ExportSummary> {
  const summary: ExportSummary = {
    total_containers: enrichedData.length,
    subjects_with_results: [],
    subjects_no_results: [],
    subjects_not_found: [],
  }

  // Count containers per subject
  const subjectCounts = new Map<number, number>()
  for (const container of enrichedData) {
    if (container.subject_id) {
      const count = subjectCounts.get(container.subject_id) || 0
      subjectCounts.set(container.subject_id, count + 1)
    }
  }

  // Build subjects_with_results
  for (const [subjectId, count] of subjectCounts.entries()) {
    const subjectName = subjectIdToName.get(subjectId)
    if (subjectName) {
      summary.subjects_with_results.push({ name: subjectName, count })
    }
  }

  // Identify subjects not found
  for (const subjectName of requestedSubjectNames) {
    if (!subjectNameToId.has(subjectName)) {
      summary.subjects_not_found.push(subjectName)
    }
  }

  // Identify subjects with no results (found but no containers)
  for (const subjectName of requestedSubjectNames) {
    const subjectId = subjectNameToId.get(subjectName)
    if (subjectId && !subjectCounts.has(subjectId)) {
      summary.subjects_no_results.push(subjectName)
    }
  }

  return summary
}

// Validate study codes
export async function validateStudyCodes(database: Database, studyCodes: string[]): Promise<{
  valid: Map<string, number>  // studyCode -> studyId
  invalid: string[]  // Invalid study codes
  studies: Map<number, StudyRecord>  // studyId -> study record
}> {
  const uniqueCodes = [...new Set(studyCodes)]
  const valid = new Map<string, number>()
  const invalid: string[] = []
  const studies = new Map<number, StudyRecord>()
  
  for (const code of uniqueCodes) {
    const studyRecord = await database
      .select()
      .from(study)
      .where(eq(study.shortCode, code))
      .get()
    
    if (studyRecord) {
      valid.set(code, studyRecord.id)
      studies.set(studyRecord.id, studyRecord)
    } else {
      invalid.push(code)
    }
  }
  
  return { valid, invalid, studies }
}
