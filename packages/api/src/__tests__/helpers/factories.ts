import type { Database } from '../../db/client'
import {
  tag,
  storageType,
  specimenType,
  strain,
  storageContainer,
  location,
  controlDefinition,
  specimen,
  unit,
  study,
  studySubject,
  controlBatch,
  micronixPlate,
  cryovialBox,
  box,
  bag,
  sheet,
  micronixTube,
  cryovialTube,
  staticWell,
  paper,
  storageContainerTag,
  specimenTypeContainerType,
  containerTypeUnit,
} from '../../db/schema'
import type { ContainerType } from '../../lib/container-creation'
import { utcNow } from '../../lib/datetime'

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
  const now = utcNow()
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
 * Allow a container type for a specimen type (specimen_type_container_type)
 */
export async function createTestSpecimenTypeContainerType(db: Database, data: {
  specimenTypeId: number
  containerType: ContainerType
}) {
  const [result] = await db.insert(specimenTypeContainerType).values(data).returning()
  return result
}

/**
 * Allow a unit for a container type (container_type_unit)
 */
export async function createTestContainerTypeUnit(db: Database, data: {
  containerType: ContainerType
  unitId: number
}) {
  const [result] = await db.insert(containerTypeUnit).values(data).returning()
  return result
}

/**
 * Create a test storage container (for testing "in use" scenarios)
 * Note: storageContainer requires specimenId and unitId
 * stateId removed - status is now derived from remainingQuantity
 */
export async function createTestStorageContainer(
  db: Database,
  options?: { specimenId?: number; unitId?: number; created?: string }
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
    ...(options?.created ? { created: options.created } : {}),
  }).returning()
  return result
}

/**
 * Link Tags to a storage container
 */
export async function createTestContainerTags(db: Database, storageContainerId: number, tagIds: readonly number[]) {
  return db
    .insert(storageContainerTag)
    .values(tagIds.map((tagId) => ({ storageContainerId, tagId })))
    .returning()
}

/**
 * Create a test micronix plate (for collections route tests)
 */
export async function createTestMicronixPlate(db: Database, data: {
  name: string
  locationId: number
  barcode?: string | null
}) {
  const now = utcNow()
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
 * Create a test cryovial box
 */
export async function createTestCryovialBox(db: Database, data: {
  name: string
  locationId: number
  barcode?: string | null
}) {
  const now = utcNow()
  const [result] = await db.insert(cryovialBox).values({
    name: data.name,
    locationId: data.locationId,
    barcode: data.barcode ?? null,
    created: now,
    lastUpdated: now,
  }).returning()
  return result
}

/**
 * Create a test box (a paper Sheet parent)
 */
export async function createTestBox(db: Database, data: { name: string; locationId: number }) {
  const now = utcNow()
  const [result] = await db.insert(box).values({ ...data, created: now, lastUpdated: now }).returning()
  return result
}

/**
 * Create a test bag (a paper Sheet parent)
 */
export async function createTestBag(db: Database, data: { name: string; locationId: number }) {
  const now = utcNow()
  const [result] = await db.insert(bag).values({ ...data, created: now, lastUpdated: now }).returning()
  return result
}

/**
 * Create a test sheet in a box or a bag
 */
export async function createTestSheet(
  db: Database,
  data: { name: string } & ({ boxId: number; bagId?: never } | { bagId: number; boxId?: never }),
) {
  const [result] = await db.insert(sheet).values(data).returning()
  return result
}

/**
 * Make an existing storage container a micronix tube on a plate
 */
export async function createTestMicronixTube(db: Database, data: {
  containerId: number
  collectionId: number
  barcode: string
  position?: string | null
}) {
  const [result] = await db.insert(micronixTube).values({
    id: data.containerId,
    collectionId: data.collectionId,
    barcode: data.barcode,
    position: data.position ?? null,
  }).returning()
  return result
}

/**
 * Make an existing storage container a cryovial tube in a cryovial box
 */
export async function createTestCryovialTube(db: Database, data: {
  containerId: number
  collectionId: number
  barcode?: string | null
  position?: string | null
}) {
  const [result] = await db.insert(cryovialTube).values({
    id: data.containerId,
    collectionId: data.collectionId,
    barcode: data.barcode ?? null,
    position: data.position ?? null,
  }).returning()
  return result
}

/**
 * Make an existing storage container a static well on a plate
 */
export async function createTestStaticWell(db: Database, data: {
  containerId: number
  collectionId: number
  position?: string | null
}) {
  const [result] = await db.insert(staticWell).values({
    id: data.containerId,
    collectionId: data.collectionId,
    position: data.position ?? null,
  }).returning()
  return result
}

/**
 * Make an existing storage container a paper on a sheet
 */
export async function createTestPaper(db: Database, data: {
  containerId: number
  sheetId: number
  sublabel?: string | null
}) {
  const [result] = await db.insert(paper).values({
    id: data.containerId,
    sheetId: data.sheetId,
    sublabel: data.sublabel ?? null,
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
  const now = utcNow()
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
  const now = utcNow()
  const [result] = await db.insert(controlDefinition).values({
    name: data?.name || `Control ${Date.now()}`,
    controlType: data?.controlType || 'blood',
    properties: data?.properties ?? null,
    created: now,
    lastUpdated: now,
  }).returning()
  return result
}

/**
 * Create a test study
 */
export async function createTestStudy(db: Database, data: { title: string, shortCode: string, leadPerson?: string }) {
  const now = utcNow()
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
  const now = utcNow()
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
  options: { studySubjectId?: number; controlBatchId?: number; collectionDate?: string; created?: string } = {}
) {
  const now = utcNow()
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
    collectionDate: options.collectionDate,
    created: options.created ?? now,
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
  const now = utcNow()
  const [result] = await db.insert(controlBatch).values({
    controlDefinitionId,
    name: data?.name || `Batch ${Date.now()}`,
    productionDate: data?.productionDate,
    properties: data?.properties ?? null,
    created: now,
    lastUpdated: now,
  }).returning()
  return result
}

/**
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