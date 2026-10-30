/** Carry out a registration plan that has no errors. Call inside a write transaction. */
import type { Database } from '../../db/client'
import { paper, sheet, specimen, storageContainer, type Specimen } from '../../db/schema'
import { utcNow } from '../datetime'
import { sqliteConstraintConflict } from '../error-handler'
import { insertedRow } from '../inserted-row'
import type { CollectionTarget, PlannedCollection } from './collections'
import type { RegistrationPlan } from './plan'
import { GRID_COLLECTION_TABLES, GRID_CONTAINER_TABLES, PARENT_COLLECTION_TABLES } from './tables'
import {
  SpecimenRegistrationError,
  type CreatedCollection,
  type RegisteredEntry,
  type RegistrationResult,
} from './types'

type ContainerRef = { entryIndex: number; containerIndex?: number }

/** The first container that needs each planned Collection: directly, or as its Sheet's box or bag. */
function collectionRequesters(plan: RegistrationPlan): ContainerRef[] {
  const requesters: Array<ContainerRef | undefined> = plan.collections.map(() => undefined)
  for (const { entryIndex, containerIndex, collection } of plan.containers) {
    let target: CollectionTarget | null = collection
    while (target && 'plannedIndex' in target) {
      requesters[target.plannedIndex] ??= { entryIndex, containerIndex }
      const planned: PlannedCollection = plan.collections[target.plannedIndex]
      target = planned.type === 'sheet' ? planned.parent : null
    }
  }
  return requesters.map((requester) => {
    if (!requester) throw new Error('Planned collection is not used by any container')
    return requester
  })
}

export async function writeRegistration(
  database: Database,
  plan: RegistrationPlan,
  userId: number | undefined,
): Promise<RegistrationResult> {
  const now = utcNow()
  const audit = { created: now, lastUpdated: now, createdBy: userId, updatedBy: userId }
  const requesters = collectionRequesters(plan)
  let current: ContainerRef = { entryIndex: 0 }

  try {
    const collectionIds: number[] = []
    const collectionsCreated: CreatedCollection[] = []
    const idOf = (target: CollectionTarget): number =>
      'existingId' in target ? target.existingId : collectionIds[target.plannedIndex]

    for (const [plannedIndex, planned] of plan.collections.entries()) {
      current = requesters[plannedIndex]
      let id: number
      switch (planned.type) {
        case 'micronix_plate':
        case 'cryovial_box': {
          const table = GRID_COLLECTION_TABLES[planned.type]
          const values = { name: planned.name, barcode: planned.barcode ?? null, locationId: planned.locationId, ...audit }
          id = insertedRow(await database.insert(table).values(values).returning({ id: table.id }), planned.type).id
          break
        }
        case 'box':
        case 'bag': {
          const table = PARENT_COLLECTION_TABLES[planned.type]
          const values = { name: planned.name, locationId: planned.locationId, ...audit }
          id = insertedRow(await database.insert(table).values(values).returning({ id: table.id }), planned.type).id
          break
        }
        case 'sheet': {
          const parentId = idOf(planned.parent)
          const values = {
            name: planned.name,
            boxId: planned.parentType === 'box' ? parentId : null,
            bagId: planned.parentType === 'bag' ? parentId : null,
            ...audit,
          }
          id = insertedRow(await database.insert(sheet).values(values).returning({ id: sheet.id }), 'sheet').id
          break
        }
      }
      collectionIds.push(id)
      collectionsCreated.push({ type: planned.type, id, name: planned.name })
    }

    const specimenRows: Array<Specimen | undefined> = []
    const entries: RegisteredEntry[] = []
    for (let entryIndex = 0; entryIndex < plan.specimenIndexOfEntry.length; entryIndex++) {
      current = { entryIndex }
      const index = plan.specimenIndexOfEntry[entryIndex]
      if (index === undefined) throw new Error('Registration plan has an entry without a specimen')
      const planned = plan.specimens[index]
      let row = specimenRows[index]
      let reused = true
      if (!row) {
        if (planned.existing) {
          row = planned.existing
        } else {
          const values = {
            studySubjectId: 'subjectId' in planned.source ? planned.source.subjectId : null,
            controlBatchId: 'controlBatchId' in planned.source ? planned.source.controlBatchId : null,
            specimenTypeId: planned.specimenTypeId,
            collectionDate: planned.collectionDate,
            ...audit,
          }
          row = insertedRow(await database.insert(specimen).values(values).returning(), 'specimen')
          reused = false
        }
        specimenRows[index] = row
      }
      entries.push({ specimen: row, reused, containerIds: [] })
    }

    for (const container of plan.containers) {
      current = { entryIndex: container.entryIndex, containerIndex: container.containerIndex }
      const entry = entries[container.entryIndex]
      const input = container.input
      const { id } = insertedRow(
        await database
          .insert(storageContainer)
          .values({
            specimenId: entry.specimen.id,
            unitId: container.unitId,
            totalQuantity: container.totalQuantity,
            remainingQuantity: container.remainingQuantity,
            comment: input.comment,
            ...audit,
          })
          .returning({ id: storageContainer.id }),
        'container',
      )
      const collectionId = idOf(container.collection)
      if (input.containerType === 'paper') {
        await database.insert(paper).values({ id, sheetId: collectionId, sublabel: input.sublabel?.trim() || null })
      } else {
        // The plan checked that a micronix tube has a barcode.
        const barcode = 'barcode' in input ? input.barcode?.trim() || null : null
        await database
          .insert(GRID_CONTAINER_TABLES[input.containerType])
          .values({ id, collectionId, position: container.position, ...(barcode !== null && { barcode }) })
      }
      entry.containerIds.push(id)
    }

    return { entries, collectionsCreated }
  } catch (error) {
    const conflict = error instanceof Error ? sqliteConstraintConflict(error) : null
    if (conflict) throw new SpecimenRegistrationError(409, [{ ...current, message: conflict }])
    throw error
  }
}
