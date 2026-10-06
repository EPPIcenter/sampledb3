import { eq, inArray, sql } from 'drizzle-orm'
import type { Database } from '../../db/client'
import { box, bag, sheet } from '../../db/schema'
import { withWriteTransaction } from '../../db/write-transaction'

export class SheetMoveTargetNotFoundError extends Error {
  constructor(targetType: 'box' | 'bag') {
    super(`Target ${targetType} not found`)
    this.name = 'SheetMoveTargetNotFoundError'
  }
}

export class SheetNotFoundError extends Error {
  constructor(sheetId: number) {
    super(`Sheet not found: ${sheetId}`)
    this.name = 'SheetNotFoundError'
  }
}

export class SheetNameConflictError extends Error {
  constructor(name: string) {
    super(`The target box already has a sheet named '${name}'. Rename one of them first.`)
    this.name = 'SheetNameConflictError'
  }
}

export async function moveSheetsToCollection(
  database: Database,
  sheetIds: number[],
  targetCollectionId: number,
  targetCollectionType: 'box' | 'bag',
): Promise<{ moved: number }> {
  if (targetCollectionType === 'box') {
    const exists = await database.select().from(box).where(eq(box.id, targetCollectionId)).get()
    if (!exists) throw new SheetMoveTargetNotFoundError('box')
    // Sheet names are unique within a box (bags still allow repeated legacy names).
    const moving = sheetIds.length > 0
      ? await database.select({ id: sheet.id, name: sheet.name }).from(sheet).where(inArray(sheet.id, sheetIds))
      : []
    const staying = await database
      .select({ id: sheet.id, name: sheet.name })
      .from(sheet)
      .where(eq(sheet.boxId, targetCollectionId))
    const movingIds = new Set(moving.map((s) => s.id))
    const taken = new Set(staying.filter((s) => !movingIds.has(s.id)).map((s) => s.name))
    for (const s of moving) {
      if (taken.has(s.name)) throw new SheetNameConflictError(s.name)
      taken.add(s.name)
    }
  } else {
    const exists = await database.select().from(bag).where(eq(bag.id, targetCollectionId)).get()
    if (!exists) throw new SheetMoveTargetNotFoundError('bag')
  }

  await withWriteTransaction(database, async (tx) => {
    for (const sheetId of sheetIds) {
      const updated =
        targetCollectionType === 'box'
          ? await tx
              .update(sheet)
              .set({
                boxId: targetCollectionId,
                bagId: null,
                lastUpdated: sql`current_timestamp`,
              })
              .where(eq(sheet.id, sheetId))
              .returning()
          : await tx
              .update(sheet)
              .set({
                bagId: targetCollectionId,
                boxId: null,
                lastUpdated: sql`current_timestamp`,
              })
              .where(eq(sheet.id, sheetId))
              .returning()
      if (updated.length === 0) {
        throw new SheetNotFoundError(sheetId)
      }
    }
  })

  return { moved: sheetIds.length }
}
