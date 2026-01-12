import { db } from '../db/client'
import type { Database } from '../db/client'
import { studySubject, study, specimen, specimenType, controlBatch, controlDefinition, specimenTypeContainerType, containerTypeUnit, unit } from '../db/schema'
import { eq, and, like, sql } from 'drizzle-orm'
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
 * Generate a unique batch name using algorithm: definition_name + production_date, or definition_name + production_date + increment
 */
export async function generateUniqueBatchName(
  definitionName: string,
  productionDate?: string | null,
  excludeId?: number
): Promise<string> {
  // Generate base name: definition_name + production_date (or today's date if not provided)
  let datePart: string
  if (productionDate) {
    // Extract just the date part (YYYY-MM-DD)
    datePart = productionDate.split(' ')[0].split('T')[0]
  } else {
    // Use today's date
    datePart = new Date().toISOString().split('T')[0]
  }
  
  const baseName = `${definitionName} ${datePart}`
  
  // Check if base name is available
  let where = eq(controlBatch.name, baseName) as any
  if (excludeId) {
    where = and(eq(controlBatch.name, baseName), sql`${controlBatch.id} != ${excludeId}`) as any
  }
  
  const existing = await db
    .select({ id: controlBatch.id })
    .from(controlBatch)
    .where(where)
    .get()
  
  if (!existing) {
    return baseName
  }
  
  // If base name exists, find all existing names with this base and extract increments
  // Pattern: "Base Name (N)" where N is a number
  const escapedBaseName = baseName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const pattern = new RegExp(`^${escapedBaseName} \\((\\d+)\\)$`)
  const likePattern = `${baseName} (%)`
  
  let wherePattern = like(controlBatch.name, likePattern) as any
  if (excludeId) {
    wherePattern = and(like(controlBatch.name, likePattern), sql`${controlBatch.id} != ${excludeId}`) as any
  }
  
  const existingNames = await db
    .select({ name: controlBatch.name })
    .from(controlBatch)
    .where(wherePattern)
    .all()
  
  // Extract all increments from existing names
  const increments = existingNames
    .map(row => {
      const match = row.name.match(pattern)
      return match ? parseInt(match[1], 10) : null
    })
    .filter((n): n is number => n !== null)
    .sort((a, b) => b - a) // Sort descending
  
  // Start from the highest increment + 1, or 1 if no increments found
  let increment = increments.length > 0 ? increments[0] + 1 : 1
  let candidateName = `${baseName} (${increment})`
  
  // Double-check the candidate name is available (in case of gaps)
  while (true) {
    let whereIncrement = eq(controlBatch.name, candidateName) as any
    if (excludeId) {
      whereIncrement = and(eq(controlBatch.name, candidateName), sql`${controlBatch.id} != ${excludeId}`) as any
    }
    
    const existingIncrement = await db
      .select({ id: controlBatch.id })
      .from(controlBatch)
      .where(whereIncrement)
      .get()
    
    if (!existingIncrement) {
      return candidateName
    }
    
    increment++
    candidateName = `${baseName} (${increment})`
    
    // Safety check to prevent infinite loop
    if (increment > 10000) {
      throw new Error('Unable to generate unique batch name after 10000 attempts')
    }
  }
}

/**
 * Validate that a control batch name is unique
 */
export async function validateControlBatchName(
  name: string,
  excludeId?: number
): Promise<{ valid: boolean; error?: string; suggestion?: string }> {
  const trimmedName = name.trim()
  
  if (trimmedName.length === 0) {
    return { valid: false, error: 'Batch name cannot be empty' }
  }
  
  if (trimmedName.length > 255) {
    return { valid: false, error: 'Batch name cannot exceed 255 characters' }
  }
  
  // Check for existing batch with same name
  let where = eq(controlBatch.name, trimmedName) as any
  if (excludeId) {
    where = and(eq(controlBatch.name, trimmedName), sql`${controlBatch.id} != ${excludeId}`) as any
  }
  
  const existing = await db
    .select({ id: controlBatch.id })
    .from(controlBatch)
    .where(where)
    .get()
  
  if (existing) {
    // Try to generate a suggestion
    // Extract definition name and date from the name if possible
    const dateMatch = trimmedName.match(/(\d{4}-\d{2}-\d{2})/)
    const datePart = dateMatch ? dateMatch[1] : new Date().toISOString().split('T')[0]
    const definitionPart = trimmedName.replace(/\s+\d{4}-\d{2}-\d{2}.*$/, '').trim()
    
    let suggestion: string | undefined
    try {
      if (definitionPart) {
        suggestion = await generateUniqueBatchName(definitionPart, datePart, excludeId)
      } else {
        suggestion = `${trimmedName}-${datePart}`
      }
    } catch (e) {
      // If suggestion generation fails, use simple fallback
      suggestion = `${trimmedName} (${new Date().toISOString().split('T')[0]})`
    }
    
    return {
      valid: false,
      error: `Batch name '${trimmedName}' already exists`,
      suggestion,
    }
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
}, database: Database = db): Promise<{ 
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
      const subject = await database.select({ id: studySubject.id }).from(studySubject).where(eq(studySubject.id, data.sourceId)).get()
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
    const batch = await database.select({ id: controlBatch.id }).from(controlBatch).where(eq(controlBatch.id, data.sourceId)).get()
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
    specimenTypeId = resolvedId
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

/**
 * Validate that a container type is allowed for a specimen type
 */
export async function validateContainerTypeForSpecimenType(
  specimenTypeId: number,
  containerType: 'paper' | 'cryovial_tube' | 'micronix_tube' | 'static_well',
  database: Database = db
): Promise<{ valid: boolean; error?: string }> {
  // Check if relationship exists
  const relationship = await database
    .select()
    .from(specimenTypeContainerType)
    .where(
      and(
        eq(specimenTypeContainerType.specimenTypeId, specimenTypeId),
        eq(specimenTypeContainerType.containerType, containerType)
      ) as any
    )
    .get()

  if (!relationship) {
    // Get specimen type name for error message
    const specType = await database.select().from(specimenType).where(eq(specimenType.id, specimenTypeId)).get()
    const specTypeName = specType?.name || `ID ${specimenTypeId}`
    
    return {
      valid: false,
      error: `Container type '${containerType}' is not allowed for specimen type '${specTypeName}'. Please configure allowed container types for this specimen type.`
    }
  }

  return { valid: true }
}

/**
 * Validate that a unit is allowed for a container type
 */
export async function validateUnitForContainerType(
  containerType: 'paper' | 'cryovial_tube' | 'micronix_tube' | 'static_well',
  unitId: number
): Promise<{ valid: boolean; error?: string }> {
  // Check if relationship exists
  const relationship = await db
    .select()
    .from(containerTypeUnit)
    .where(
      and(
        eq(containerTypeUnit.containerType, containerType),
        eq(containerTypeUnit.unitId, unitId)
      ) as any
    )
    .get()

  if (!relationship) {
    // Get unit symbol for error message
    const unitRecord = await db.select().from(unit).where(eq(unit.id, unitId)).get()
    const unitSymbol = unitRecord?.symbol || `ID ${unitId}`
    
    return {
      valid: false,
      error: `Unit '${unitSymbol}' is not allowed for container type '${containerType}'. Please configure allowed units for this container type.`
    }
  }

  return { valid: true }
}
