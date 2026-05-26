import { eq, sql } from 'drizzle-orm'
import type { Database } from '../../db/client'
import { box, bag, sheet } from '../../db/schema'

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

export async function moveSheetsToCollection(
  database: Database,
  sheetIds: number[],
  targetCollectionId: number,
  targetCollectionType: 'box' | 'bag',
): Promise<{ moved: number }> {
  if (targetCollectionType === 'box') {
    const exists = await database.select().from(box).where(eq(box.id, targetCollectionId)).get()
    if (!exists) throw new SheetMoveTargetNotFoundError('box')
  } else {
    const exists = await database.select().from(bag).where(eq(bag.id, targetCollectionId)).get()
    if (!exists) throw new SheetMoveTargetNotFoundError('bag')
  }

  await database.transaction(async (tx) => {
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
