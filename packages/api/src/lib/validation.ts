import { db } from '../db/client'
import { studySubject, study, specimen, specimenType, controlBatch } from '../db/schema'
import { eq, and } from 'drizzle-orm'
import { resolveStudyByShortCode, resolveSubjectByNameAndStudy, resolveSpecimenTypeByName } from './identifier-resolution'

/**
 * Validate that a subject name is unique within a study
 */
export async function validateSubjectName(
  studyId: number,
  name: string
): Promise<{ valid: boolean; error?: string }> {
  const trimmedName = name.trim()
  
  if (trimmedName.length === 0) {
    return { valid: false, error: 'Subject name cannot be empty' }
  }
  
  if (trimmedName.length > 255) {
    return { valid: false, error: 'Subject name cannot exceed 255 characters' }
  }
  
  // Check for existing subject with same name in same study
  const existing = await db
    .select({ id: studySubject.id })
    .from(studySubject)
    .where(and(
      eq(studySubject.studyId, studyId),
      eq(studySubject.name, trimmedName)
    ) as any)
    .get()
  
  if (existing) {
    return { valid: false, error: `Subject name '${trimmedName}' already exists in this study` }
  }
  
  return { valid: true }
}

/**
 * Validate collection date
 */
export function validateCollectionDate(date: string | undefined): { valid: boolean; error?: string } {
  if (!date) {
    return { valid: true } // Optional field
  }
  
  const dateObj = new Date(date)
  
  if (isNaN(dateObj.getTime())) {
    return { valid: false, error: 'Invalid date format' }
  }
  
  const now = new Date()
  now.setHours(23, 59, 59, 999) // End of today
  
  if (dateObj > now) {
    return { valid: false, error: 'Collection date cannot be in the future' }
  }
  
  return { valid: true }
}

/**
 * Validate study short code exists
 */
export async function validateStudyShortCode(shortCode: string): Promise<{ valid: boolean; error?: string; studyId?: number }> {
  const studyId = await resolveStudyByShortCode(shortCode)
  
  if (!studyId) {
    return { valid: false, error: `Study short code '${shortCode}' not found` }
  }
  
  return { valid: true, studyId }
}

/**
 * Validate specimen data
 */
export async function validateSpecimenData(data: {
  sourceType: 'subject' | 'control'
  sourceId?: number
  studyShortCode?: string
  subjectName?: string
  specimenTypeName?: string
  specimenTypeId?: number
  collectionDate?: string
}): Promise<{ 
  valid: boolean; 
  error?: string; 
  resolved?: { 
    studySubjectId?: number; 
    controlBatchId?: number; 
    specimenTypeId: number 
  } 
}> {
  // Validate source
  let studySubjectId: number | undefined
  let controlBatchId: number | undefined
  
  if (data.sourceType === 'subject') {
    if (data.sourceId) {
      // Verify the subject exists
      const subject = await db.select({ id: studySubject.id }).from(studySubject).where(eq(studySubject.id, data.sourceId)).get()
      if (!subject) {
        return { valid: false, error: `Subject with ID ${data.sourceId} not found` }
      }
      studySubjectId = data.sourceId
    } else if (data.studyShortCode && data.subjectName) {
      // Use human-readable identifiers
      const studyValidation = await validateStudyShortCode(data.studyShortCode)
      if (!studyValidation.valid || !studyValidation.studyId) {
        return { valid: false, error: studyValidation.error || 'Invalid study' }
      }
      
      const id = await resolveSubjectByNameAndStudy(data.subjectName, studyValidation.studyId)
      if (!id) {
        return { valid: false, error: `Subject '${data.subjectName}' not found in study '${data.studyShortCode}'` }
      }
      studySubjectId = id
    } else {
      return { valid: false, error: 'Subject specimens require either sourceId or both study short code and subject name' }
    }
  } else if (data.sourceType === 'control') {
    if (!data.sourceId) {
      return { valid: false, error: 'Control Batch ID required for control specimens' }
    }
    // Verify control batch exists
    const batch = await db.select({ id: controlBatch.id }).from(controlBatch).where(eq(controlBatch.id, data.sourceId)).get()
    if (!batch) {
      return { valid: false, error: `Control Batch with ID ${data.sourceId} not found` }
    }
    controlBatchId = data.sourceId
  }
  
  // Validate specimen type
  let specimenTypeId: number | undefined = data.specimenTypeId
  
  if (data.specimenTypeName) {
    const resolvedId = await resolveSpecimenTypeByName(data.specimenTypeName)
    if (!resolvedId) {
      return { valid: false, error: `Specimen type '${data.specimenTypeName}' not found` }
    }
    specimenTypeId = resolvedId ?? undefined
  } else if (!specimenTypeId) {
    return { valid: false, error: 'Specimen type name or ID required' }
  }
  
  // Validate collection date
  const dateValidation = validateCollectionDate(data.collectionDate)
  if (!dateValidation.valid) {
    return { valid: false, error: dateValidation.error }
  }
  
  return {
    valid: true,
    resolved: {
      studySubjectId,
      controlBatchId,
      specimenTypeId: specimenTypeId!,
    },
  }
}

/**
 * Check for duplicate specimens in a batch
 */
export function checkDuplicateSpecimens(
  specimens: Array<{
    sourceType: string
    sourceId?: number
    studyShortCode?: string
    subjectName?: string
    specimenTypeId?: number
    specimenTypeName?: string
    collectionDate?: string
  }>
): Array<{ index: number; error: string }> {
  const errors: Array<{ index: number; error: string }> = []
  const seen = new Set<string>()
  
  for (let i = 0; i < specimens.length; i++) {
    const spec = specimens[i]
    const sourceKey = spec.sourceId || `${spec.studyShortCode}:${spec.subjectName}`
    const key = `${spec.sourceType}:${sourceKey}:${spec.specimenTypeId || spec.specimenTypeName}:${spec.collectionDate || ''}`
    
    if (seen.has(key)) {
      errors.push({
        index: i,
        error: 'Duplicate specimen entry',
      })
    }
    seen.add(key)
  }
  
  return errors
}
