/** Carry out a registration plan that has no errors. Call inside a write transaction. */
import type { Database } from '../../db/client'
import {
  bag,
  box,
  cryovialBox,
  cryovialTube,
  micronixPlate,
  micronixTube,
  paper,
  sheet,
  specimen,
  staticWell,
  storageContainer,
  type Specimen,
} from '../../db/schema'
import { utcNow } from '../datetime'
import { sqliteConstraintConflict } from '../error-handler'
import type { CollectionTarget } from './collections'
import type { RegistrationPlan } from './plan'
import {
  SpecimenRegistrationError,
  type CreatedCollection,
  type RegisteredEntry,
  type RegistrationResult,
} from './types'

function only<T>(rows: T[], what: string): T {
  const row = rows.at(0)
  if (row === undefined) throw new Error(`Insert did not return ${what} row`)
  return row
}

export async function writeRegistration(
  database: Database,
  plan: RegistrationPlan,
  userId: number | undefined,
): Promise<RegistrationResult> {
  const now = utcNow()
  const audit = { created: now, lastUpdated: now, createdBy: userId, updatedBy: userId }
  let current: { entryIndex: number; containerIndex?: number } = { entryIndex: 0 }

  try {
    const collectionIds: number[] = []
    const collectionsCreated: CreatedCollection[] = []
    const idOf = (target: CollectionTarget): number =>
      'existingId' in target ? target.existingId : collectionIds[target.plannedIndex]

    for (const planned of plan.collections) {
      let id: number
      switch (planned.type) {
        case 'micronix_plate':
        case 'cryovial_box': {
          const table = planned.type === 'micronix_plate' ? micronixPlate : cryovialBox
          const values = { name: planned.name, barcode: planned.barcode ?? null, locationId: planned.locationId, ...audit }
          id = only(await database.insert(table).values(values).returning({ id: table.id }), planned.type).id
          break
        }
        case 'box':
        case 'bag': {
          const table = planned.type === 'box' ? box : bag
          const values = { name: planned.name, locationId: planned.locationId, ...audit }
          id = only(await database.insert(table).values(values).returning({ id: table.id }), planned.type).id
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
          id = only(await database.insert(sheet).values(values).returning({ id: sheet.id }), 'sheet').id
          break
        }
      }
      collectionIds.push(id)
      collectionsCreated.push({ type: planned.type, id, name: planned.name })
    }

    const specimenRows: Array<Specimen | undefined> = []
    const entries: RegisteredEntry[] = []
    for (let entryIndex = 0; entryIndex < plan.entrySpecimen.length; entryIndex++) {
      current = { entryIndex }
      const index = plan.entrySpecimen[entryIndex]
      const planned = plan.specimens[index]
      let row = specimenRows[index]
      let reused = true
      if (!row) {
        if (planned.existing) {
          row = planned.existing
        } else {
          const { existing: _existing, ...values } = planned
          row = only(await database.insert(specimen).values({ ...values, ...audit }).returning(), 'specimen')
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
      const { id } = only(
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
      switch (input.containerType) {
        case 'micronix_tube':
          await database.insert(micronixTube).values({ id, collectionId, barcode: input.barcode.trim(), position: container.position })
          break
        case 'cryovial_tube':
          await database
            .insert(cryovialTube)
            .values({ id, collectionId, barcode: input.barcode?.trim() || null, position: container.position })
          break
        case 'static_well':
          await database.insert(staticWell).values({ id, collectionId, position: container.position })
          break
        case 'paper':
          await database.insert(paper).values({ id, sheetId: collectionId, sublabel: input.sublabel?.trim() || null })
          break
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
