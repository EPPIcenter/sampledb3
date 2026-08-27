import type { ContainerWriteInput } from '@sampledb/contract'
import type { Database } from '../db/client'
import type { ExtractTablesWithRelations } from 'drizzle-orm'
import type { SQLiteTransaction } from 'drizzle-orm/sqlite-core'
import type * as schema from '../db/schema'
import {
  containerDerivation,
  specimen,
  specimenType,
  storageContainer,
  unit,
} from '../db/schema'
import { and, eq, sql } from 'drizzle-orm'
import { validateContainerTypeForSpecimenType } from '../lib/validation'
import { getDefaultUnit } from './defaults'
import { utcNow } from './datetime'
import { createContainerForSpecimen, pickContainerQuantity } from './container-creation'

export type DerivationType = string

export interface CreateDerivationInput {
  parentContainerId: number
  derivationType: DerivationType
  specimenTypeName: string
  container: ContainerWriteInput
  quantity?: number
  unitSymbol?: string
  quantityUsed?: number
  reduceParentQuantity?: boolean
  derivationDate?: string
  protocol?: string
  notes?: string
  properties?: Record<string, unknown>
  operatorId?: number
}

export interface DerivationWarning {
  code: 'INSUFFICIENT_PARENT_QUANTITY' | 'PARENT_QUANTITY_ZERO_OR_NEGATIVE' | 'INCOMPATIBLE_UNITS'
  message: string
}

export interface CreateDerivationResult {
  derivation: typeof containerDerivation.$inferSelect
  parentContainer: typeof storageContainer.$inferSelect
  childContainer: typeof storageContainer.$inferSelect
  specimen: typeof specimen.$inferSelect | undefined
  warnings: DerivationWarning[]
}

type DatabaseOrTransaction =
  | Database
  | SQLiteTransaction<'sync', void, typeof schema, ExtractTablesWithRelations<typeof schema>>

async function findOrCreateDerivedSpecimen(
  database: DatabaseOrTransaction,
  parentSpecimenId: number,
  specimenTypeName: string,
): Promise<number> {
  const parentSpecimen = await database
    .select()
    .from(specimen)
    .where(eq(specimen.id, parentSpecimenId))
    .get()

  if (!parentSpecimen) {
    throw new Error('Parent specimen not found')
  }

  const type = await database
    .select()
    .from(specimenType)
    .where(eq(specimenType.name, specimenTypeName))
    .get()

  if (!type) {
    throw new Error(`Specimen type '${specimenTypeName}' not found`)
  }

  let where = eq(specimen.specimenTypeId, type.id) as ReturnType<typeof and>

  if (parentSpecimen.studySubjectId) {
    where = and(
      where,
      eq(specimen.studySubjectId, parentSpecimen.studySubjectId),
      sql`${specimen.controlBatchId} IS NULL`,
    )!
  } else if (parentSpecimen.controlBatchId) {
    where = and(
      where,
      eq(specimen.controlBatchId, parentSpecimen.controlBatchId),
      sql`${specimen.studySubjectId} IS NULL`,
    )!
  }

  if (parentSpecimen.collectionDate) {
    where = and(where, eq(specimen.collectionDate, parentSpecimen.collectionDate))!
  }

  const existing = await database
    .select()
    .from(specimen)
    .where(where)
    .get()

  if (existing) {
    return existing.id
  }

  const [created] = await database
    .insert(specimen)
    .values({
      studySubjectId: parentSpecimen.studySubjectId,
      controlBatchId: parentSpecimen.controlBatchId,
      specimenTypeId: type.id,
      collectionDate: parentSpecimen.collectionDate || null,
      created: utcNow(),
      lastUpdated: utcNow(),
    })
    .returning()

  if (!created) throw new Error('Insert did not return specimen row')
  return created.id
}

async function resolveUnitIdForChild(
  database: DatabaseOrTransaction,
  containerType: ContainerWriteInput['containerType'],
  unitSymbol?: string,
): Promise<number> {
  if (unitSymbol) {
    const u = await database
      .select()
      .from(unit)
      .where(eq(unit.symbol, unitSymbol))
      .get()
    if (!u) {
      throw new Error(`Unit with symbol '${unitSymbol}' not found`)
    }
    return u.id
  }

  return getDefaultUnit(database as Database, containerType)
}

async function adjustParentQuantity(
  database: DatabaseOrTransaction,
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

  const newRemaining = Math.max(0, parent.remainingQuantity - quantityUsed)

  const [updated] = await database
    .update(storageContainer)
    .set({
      remainingQuantity: newRemaining,
      lastUpdated: utcNow(),
    })
    .where(eq(storageContainer.id, parent.id))
    .returning()

  return { updatedParent: updated, warnings }
}

export async function createDerivation(
  database: DatabaseOrTransaction,
  input: CreateDerivationInput,
): Promise<CreateDerivationResult> {
  const parent = await database
    .select()
    .from(storageContainer)
    .where(eq(storageContainer.id, input.parentContainerId))
    .get()

  if (!parent) {
    throw new Error('Parent container not found')
  }

  const derivedSpecimenId = await findOrCreateDerivedSpecimen(database, parent.specimenId, input.specimenTypeName)

  const specType = await database
    .select()
    .from(specimenType)
    .where(eq(specimenType.name, input.specimenTypeName))
    .get()

  if (!specType) {
    throw new Error(`Specimen type '${input.specimenTypeName}' not found`)
  }

  const containerTypeValidation = await validateContainerTypeForSpecimenType(
    database as Database,
    specType.id,
    input.container.containerType
  )

  if (!containerTypeValidation.valid) {
    throw new Error(containerTypeValidation.error || 'Container type not allowed for this specimen type')
  }

  const collectionMap = new Map<string, number>()
  const unitId = await resolveUnitIdForChild(database, input.container.containerType, input.unitSymbol)
  const quantity = input.quantity ?? 1.0

  const containerResult = await createContainerForSpecimen(derivedSpecimenId, input.container, database, {
    collectionMap,
    skipValidation: true,
    quantity: pickContainerQuantity({ unitId, totalQuantity: quantity, remainingQuantity: quantity }),
  })

  if (!containerResult.success || containerResult.containerId == null) {
    throw new Error(containerResult.error || 'Failed to create child container')
  }

  const child = await database
    .select()
    .from(storageContainer)
    .where(eq(storageContainer.id, containerResult.containerId))
    .get()

  if (!child) {
    throw new Error('Child container not found after creation')
  }

  const { updatedParent, warnings } = await adjustParentQuantity(
    database,
    parent,
    input.quantityUsed,
    input.reduceParentQuantity ?? true,
  )

  const now = utcNow()
  const [derivation] = await database
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

  const derivedSpec = await database
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
