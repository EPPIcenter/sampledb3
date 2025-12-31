import type { Database } from '../../db/client'
import { tag, storageType, specimenType, sampleType, strain, composition, storageContainer, location, compositionStrain, controlDefinition, specimen, unit, study, studySubject, controlBatch } from '../../db/schema'

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

export interface TestSampleType {
  name: string
  description?: string
  parentId?: number
}

export interface TestStrain {
  name: string
  description?: string
}

export interface TestComposition {
  index?: number
  label: string
  legacy?: number
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
 * Create a test sample type
 */
export async function createTestSampleType(db: Database, data: TestSampleType) {
  const [result] = await db.insert(sampleType).values(data).returning()
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
 * Create a test composition
 */
export async function createTestComposition(db: Database, data: TestComposition) {
  const [result] = await db.insert(composition).values({
    ...data,
    legacy: data.legacy ?? 0,
  }).returning()
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
 * Create a test location (for testing storage type "in use")
 */
export async function createTestLocation(db: Database, data: {
  locationRoot: string
  levelI: string
  levelII: string
  levelIII?: string
  storageTypeId: string
  description?: string
}) {
  const [result] = await db.insert(location).values(data).returning()
  return result
}

/**
 * Create a test composition-strain relationship
 */
export async function createTestCompositionStrain(db: Database, compositionId: number, strainId: number, percentage: number = 0.0) {
  await db.insert(compositionStrain).values({ compositionId, strainId, percentage })
}

/**
 * Create a test control definition (for testing composition "in use")
 */
export async function createTestControlDefinition(db: Database, compositionId: number) {
  const now = new Date().toISOString()
  const [result] = await db.insert(controlDefinition).values({
    name: `Control ${compositionId}`,
    controlType: 'blood',
    compositionId,
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

