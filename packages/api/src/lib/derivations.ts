import { db } from '../db/client'
import {
  containerDerivation,
  cryovialBox,
  cryovialTube,
  micronixPlate,
  micronixTube,
  paper,
  sheet,
  specimen,
  specimenType,
  storageContainer,
  studySubject,
  controlBatch,
  unit,
} from '../db/schema'
import { and, eq, sql } from 'drizzle-orm'
import { resolveCollection, type CollectionType } from '../lib/collection-resolution'
import { validateContainerTypeForSpecimenType } from '../lib/validation'
import { getDefaultUnit } from './defaults'

export type DerivationType = string

export interface CreateDerivationInput {
  parentContainerId: number
  derivationType: DerivationType
  specimenTypeName: string
  containerType: 'micronix_tube' | 'cryovial_tube' | 'paper' | 'static_well'
  quantity?: number
  unitSymbol?: string
  quantityUsed?: number
  reduceParentQuantity?: boolean
  derivationDate?: string
  protocol?: string
  notes?: string
  properties?: Record<string, any>
  collectionId?: number
  collectionName?: string
  collectionType?: CollectionType
  collectionLocationId?: number
  containerBarcode?: string
  position?: string
  operatorId?: number
}

export interface DerivationWarning {
  code: 'INSUFFICIENT_PARENT_QUANTITY' | 'PARENT_QUANTITY_ZERO_OR_NEGATIVE' | 'INCOMPATIBLE_UNITS'
  message: string
}

export interface CreateDerivationResult {
  derivation: any
  parentContainer: any
  childContainer: any
  specimen: any
  warnings: DerivationWarning[]
}

async function findOrCreateDerivedSpecimen(
  parentSpecimenId: number,
  specimenTypeName: string,
): Promise<number> {
  const parentSpecimen = await db
    .select()
    .from(specimen)
    .where(eq(specimen.id, parentSpecimenId))
    .get()

  if (!parentSpecimen) {
    throw new Error('Parent specimen not found')
  }

  const type = await db
    .select()
    .from(specimenType)
    .where(eq(specimenType.name, specimenTypeName))
    .get()

  if (!type) {
    throw new Error(`Specimen type '${specimenTypeName}' not found`)
  }

  // Build match condition: same source (subject OR control batch) and same specimen type/date
  let where = eq(specimen.specimenTypeId, type.id) as any

  if (parentSpecimen.studySubjectId) {
    where = and(
      where,
      eq(specimen.studySubjectId, parentSpecimen.studySubjectId),
      sql`${specimen.controlBatchId} IS NULL`,
    ) as any
  } else if (parentSpecimen.controlBatchId) {
    where = and(
      where,
      eq(specimen.controlBatchId, parentSpecimen.controlBatchId),
      sql`${specimen.studySubjectId} IS NULL`,
    ) as any
  }

  if (parentSpecimen.collectionDate) {
    where = and(where, eq(specimen.collectionDate, parentSpecimen.collectionDate)) as any
  }

  const existing = await db
    .select()
    .from(specimen)
    .where(where)
    .get()

  if (existing) {
    return existing.id
  }

  const [created] = await db
    .insert(specimen)
    .values({
      studySubjectId: parentSpecimen.studySubjectId,
      controlBatchId: parentSpecimen.controlBatchId,
      specimenTypeId: type.id,
      collectionDate: parentSpecimen.collectionDate || null,
      created: new Date().toISOString(),
      lastUpdated: new Date().toISOString(),
    })
    .returning()

  return created.id
}

async function resolveUnitIdForChild(
  containerType: CreateDerivationInput['containerType'],
  unitSymbol?: string,
): Promise<number> {
  // If explicit symbol is provided, use it
  if (unitSymbol) {
    const u = await db
      .select()
      .from(unit)
      .where(eq(unit.symbol, unitSymbol))
      .get()
    if (!u) {
      throw new Error(`Unit with symbol '${unitSymbol}' not found`)
    }
    return u.id
  }

  // Use the default unit for the child container type
  return await getDefaultUnit(containerType)
}

async function adjustParentQuantity(
  parent: typeof storageContainer.$inferSelect,
  quantityUsed?: number,
  reduceParentQuantity?: boolean,
): Promise<{ updatedParent: typeof storageContainer.$inferSelect; warnings: DerivationWarning[] }> {
  const warnings: DerivationWarning[] = []

  if (!reduceParentQuantity || quantityUsed == null) {
    return { updatedParent: parent, warnings }
  }

  if (parent.remainingQuantity == null) {
    return { updatedParent: parent, warnings }
  }

  if (parent.remainingQuantity <= 0) {
    warnings.push({
      code: 'PARENT_QUANTITY_ZERO_OR_NEGATIVE',
      message: 'Parent container remaining quantity is zero or negative; quantity reduction will be clamped.',
    })
  } else if (parent.remainingQuantity < quantityUsed) {
    warnings.push({
      code: 'INSUFFICIENT_PARENT_QUANTITY',
      message: 'Parent container remaining quantity is less than quantity used; quantity reduction will proceed and be clamped at zero.',
    })
  }

  const newRemaining = Math.max(0, (parent.remainingQuantity ?? 0) - quantityUsed)

  const [updated] = await db
    .update(storageContainer)
    .set({
      remainingQuantity: newRemaining,
      lastUpdated: new Date().toISOString(),
    })
    .where(eq(storageContainer.id, parent.id))
    .returning()

  return { updatedParent: updated, warnings }
}

export async function createDerivation(
  input: CreateDerivationInput,
): Promise<CreateDerivationResult> {
  const parent = await db
    .select()
    .from(storageContainer)
    .where(eq(storageContainer.id, input.parentContainerId))
    .get()

  if (!parent) {
    throw new Error('Parent container not found')
  }

  const derivedSpecimenId = await findOrCreateDerivedSpecimen(parent.specimenId, input.specimenTypeName)

  // Validate container type is allowed for the specimen type
  const specType = await db
    .select()
    .from(specimenType)
    .where(eq(specimenType.name, input.specimenTypeName))
    .get()

  if (!specType) {
    throw new Error(`Specimen type '${input.specimenTypeName}' not found`)
  }

  const containerTypeValidation = await validateContainerTypeForSpecimenType(
    specType.id,
    input.containerType
  )

  if (!containerTypeValidation.valid) {
    throw new Error(containerTypeValidation.error || 'Container type not allowed for this specimen type')
  }

  const unitId = await resolveUnitIdForChild(input.containerType, input.unitSymbol)
  const quantity = input.quantity ?? 1.0

  // Resolve collection if only name/type provided
  let collectionId = input.collectionId
  if (!collectionId && input.collectionName && input.collectionType) {
    const resolved = await resolveCollection(input.collectionName, input.collectionType as CollectionType)
    if (!resolved) {
      throw new Error(`Collection '${input.collectionName}' (${input.collectionType}) not found`)
    }
    collectionId = resolved
  }

  const now = new Date().toISOString()
  const [child] = await db
    .insert(storageContainer)
    .values({
      specimenId: derivedSpecimenId,
      unitId,
      totalQuantity: quantity,
      remainingQuantity: quantity,
      created: now,
      lastUpdated: now,
    })
    .returning()

  // Link to physical subtype table
  switch (input.containerType) {
    case 'micronix_tube': {
      if (!collectionId) throw new Error('collectionId is required for micronix_tube derivations')
      await db.insert(micronixTube).values({
        id: child.id,
        collectionId: collectionId,
        barcode: input.containerBarcode!,
        position: input.position ?? null,
      })
      break
    }
    case 'cryovial_tube': {
      if (!collectionId) throw new Error('collectionId is required for cryovial_tube derivations')
      await db.insert(cryovialTube).values({
        id: child.id,
        collectionId: collectionId,
        barcode: input.containerBarcode || null,
        position: input.position ?? null,
      })
      break
    }
    case 'paper': {
      if (!collectionId) throw new Error('collectionId (sheetId) is required for paper derivations')
      await db.insert(paper).values({
        id: child.id,
        sheetId: collectionId,
        barcode: input.containerBarcode || null,
        position: input.position ?? null,
      })
      break
    }
    case 'static_well': {
      // For now, we treat static wells like micronix_plate-based wells
      await db.insert(sheet).values // placeholder to satisfy type imports; no-op for now
      throw new Error('static_well derivations are not yet implemented')
    }
    default:
      throw new Error(`Unsupported container type: ${input.containerType}`)
  }

  const { updatedParent, warnings } = await adjustParentQuantity(
    parent,
    input.quantityUsed,
    input.reduceParentQuantity ?? true,
  )

  const [derivation] = await db
    .insert(containerDerivation)
    .values({
      parentContainerId: parent.id,
      childContainerId: child.id,
      derivationType: input.derivationType,
      derivationDate: input.derivationDate ?? now,
      operatorId: input.operatorId ?? null,
      protocol: input.protocol ?? null,
      notes: input.notes ?? null,
      properties: input.properties ?? null,
      created: now,
    })
    .returning()

  const derivedSpec = await db
    .select()
    .from(specimen)
    .where(eq(specimen.id, derivedSpecimenId))
    .get()

  return {
    derivation,
    parentContainer: updatedParent,
    childContainer: child,
    specimen: derivedSpec,
    warnings,
  }
}


