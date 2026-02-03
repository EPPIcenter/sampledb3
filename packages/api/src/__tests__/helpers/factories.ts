import type { Database } from '../../db/client'
import { tag, storageType, specimenType, strain, storageContainer, location, controlDefinition, specimen, unit, study, studySubject, controlBatch, micronixPlate } from '../../db/schema'

/**
 * Test data factories for creating test entities
 */

// TestState removed - states deprecated in favor of tags
export interface TestTag {
  name: string
}

export interface TestStorageType {
  name: string
  description?: string
}

export interface TestSpecimenType {
  name: string
}

export interface TestStrain {
  name: string
  description?: string
}

/**
 * Create a test tag (replaces createTestState)
 */
export async function createTestTag(db: Database, data: TestTag) {
  const [result] = await db.insert(tag).values(data).returning()
  return result
}

/**
 * Create a test storage type
 */
export async function createTestStorageType(db: Database, data: TestStorageType) {
  const [result] = await db.insert(storageType).values(data).returning()
  return result
}

/**
 * Create a test specimen type
 */
export async function createTestSpecimenType(db: Database, data: TestSpecimenType) {
  const now = new Date().toISOString()
  const [result] = await db.insert(specimenType).values({
    ...data,
    created: now,
    lastUpdated: now,
  }).returning()
  return result
}

/**
 * Create a test strain
 */
export async function createTestStrain(db: Database, data: TestStrain) {
  const [result] = await db.insert(strain).values(data).returning()
  return result
}

/**
 * Create a test unit (required for storage containers)
 */
export async function createTestUnit(db: Database, data: {
  symbol: string
  name: string
  category: string
}) {
  const [result] = await db.insert(unit).values(data).returning()
  return result
}

/**
 * Create a test storage container (for testing "in use" scenarios)
 * Note: storageContainer requires specimenId and unitId
 * stateId removed - status is now derived from remainingQuantity
 */
export async function createTestStorageContainer(
  db: Database,
  options?: { specimenId?: number; unitId?: number }
) {
  // Create unit if not provided
  let unitId = options?.unitId
  if (!unitId) {
    const testUnit = await createTestUnit(db, {
      symbol: 'uL',
      name: 'microliter',
      category: 'volume',
    })
    unitId = testUnit.id as number
  }

  // Create specimen if not provided
  let specimenId = options?.specimenId
  if (!specimenId) {
    const testSpecimenType = await createTestSpecimenType(db, { name: 'Test Type' })
    const testSpecimen = await createTestSpecimen(db, testSpecimenType.id)
    specimenId = testSpecimen.id
  }

  const [result] = await db.insert(storageContainer).values({
    specimenId,
    unitId: unitId as number,
    totalQuantity: 1.0,
    remainingQuantity: 1.0,
  }).returning()
  return result
}

/**
 * Create a test micronix plate (for collections route tests)
 */
export async function createTestMicronixPlate(db: Database, data: {
  name: string
  locationId: number
  barcode?: string | null
}) {
  const now = new Date().toISOString()
  const [result] = await db.insert(micronixPlate).values({
    name: data.name,
    locationId: data.locationId,
    barcode: data.barcode ?? null,
    created: now,
    lastUpdated: now,
  }).returning()
  return result
}

/**
 * Create a test location (for testing storage type "in use")
 */
export async function createTestLocation(db: Database, data: {
  name: string
  parentId?: number | null
  storageTypeId?: string | null
  description?: string
  canContainCollections?: boolean
  path?: string
}) {
  const now = new Date().toISOString()
  const insertResult = await db.insert(location).values({
    name: data.name,
    parentId: data.parentId ?? null,
    storageTypeId: data.storageTypeId ?? null,
    description: data.description,
    canContainCollections: data.canContainCollections ?? false,
    path: data.path ?? data.name,
    created: now,
    lastUpdated: now,
  }).returning()
  
  const result = Array.isArray(insertResult) ? insertResult[0] : insertResult
  return result
}

/**
 * Create a test control definition
 */
export async function createTestControlDefinition(db: Database, data?: {
  name?: string
  controlType?: 'blood' | 'plasma_positive' | 'plasma_negative' | 'antibody' | 'extraction' | 'negative'
  properties?: any
}) {
  const now = new Date().toISOString()
  const [result] = await db.insert(controlDefinition).values({
    name: data?.name || `Control ${Date.now()}`,
    controlType: data?.controlType || 'blood',
    properties: data?.properties ? JSON.stringify(data.properties) : null,
    created: now,
    lastUpdated: now,
  }).returning()
  return result
}

/**
 * Create a test specimen (for testing specimen type "in use")
 */
/**
 * Create a test study
 */
export async function createTestStudy(db: Database, data: { title: string, shortCode: string, leadPerson?: string }) {
  const now = new Date().toISOString()
  const [result] = await db.insert(study).values({
    ...data,
    isLongitudinal: false,
    leadPerson: data.leadPerson ?? 'Test Person',
    created: now,
    lastUpdated: now,
  }).returning()
  return result
}

/**
 * Create a test study subject
 */
export async function createTestStudySubject(db: Database, data: { studyId: number, name: string }) {
  const now = new Date().toISOString()
  const [result] = await db.insert(studySubject).values({
    ...data,
    created: now,
    lastUpdated: now,
  }).returning()
  return result
}

/**
 * Create a test specimen (for testing specimen type "in use")
 */
export async function createTestSpecimen(
  db: Database,
  specimenTypeId: number,
  options: { studySubjectId?: number; controlBatchId?: number } = {}
) {
  const now = new Date().toISOString()
  let { studySubjectId, controlBatchId } = options

  // Default to study subject if neither provided
  if (!studySubjectId && !controlBatchId) {
    const testStudy = await createTestStudy(db, {
      title: `Study ${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      shortCode: `ST${Date.now()}-${Math.floor(Math.random() * 1000)}`
    });
    const testSubject = await createTestStudySubject(db, {
      studyId: testStudy.id,
      name: 'Subject 1'
    });
    studySubjectId = testSubject.id;
  }

  const [result] = await db.insert(specimen).values({
    specimenTypeId,
    studySubjectId,
    controlBatchId,
    created: now,
    lastUpdated: now,
  }).returning()
  return result
}

/**
 * Create a test control batch
 */
export async function createTestControlBatch(
  db: Database,
  controlDefinitionId: number,
  data?: { name?: string; productionDate?: string; properties?: any }
) {
  const now = new Date().toISOString()
  const [result] = await db.insert(controlBatch).values({
    controlDefinitionId,
    name: data?.name || `Batch ${Date.now()}`,
    productionDate: data?.productionDate,
    properties: data?.properties ? JSON.stringify(data.properties) : null,
    created: now,
    lastUpdated: now,
  }).returning()
  return result
}/**
 * Create a test study with default values
 */
export function createTestStudyData(overrides?: Partial<{ title: string; shortCode: string; leadPerson: string; isLongitudinal: boolean }>) {
  const timestamp = Date.now()
  return {
    title: `Test Study ${timestamp}`,
    shortCode: `TEST${timestamp}`,
    isLongitudinal: false,
    leadPerson: 'Test Person',
    ...overrides
  }
}/**
 * Create a test subject with default values
 */
export function createTestSubjectData(studyId: number, overrides?: Partial<{ name: string }>) {
  const timestamp = Date.now()
  return {
    studyId,
    name: `SUBJ-${timestamp}`,
    ...overrides
  }
}