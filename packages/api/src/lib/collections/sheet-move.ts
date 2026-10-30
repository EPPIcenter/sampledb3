import { eq, inArray, sql } from 'drizzle-orm'
import type { Database } from '../../db/client'
import { box, bag, sheet } from '../../db/schema'
import { withWriteTransaction } from '../../db/write-transaction'
import { ConflictError } from '../error-handler'

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

export class SheetNameConflictError extends ConflictError {
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
  // Checks and updates run synchronously inside the transaction: with no await between
  // them, a concurrent move cannot slip in, so its loser gets SheetNameConflictError
  // rather than the UNIQUE constraint error.
  await withWriteTransaction(database, async (tx) => {
    const target =
      targetCollectionType === 'box'
        ? tx.select({ id: box.id }).from(box).where(eq(box.id, targetCollectionId)).get()
        : tx.select({ id: bag.id }).from(bag).where(eq(bag.id, targetCollectionId)).get()
    if (!target) throw new SheetMoveTargetNotFoundError(targetCollectionType)

    if (targetCollectionType === 'box') {
      // Sheet names are unique within a box (bags still allow repeated legacy names).
      const moving =
        sheetIds.length > 0
          ? tx.select({ id: sheet.id, name: sheet.name }).from(sheet).where(inArray(sheet.id, sheetIds)).all()
          : []
      const staying = tx
        .select({ id: sheet.id, name: sheet.name })
        .from(sheet)
        .where(eq(sheet.boxId, targetCollectionId))
        .all()
      const movingIds = new Set(moving.map((s) => s.id))
      const taken = new Set(staying.filter((s) => !movingIds.has(s.id)).map((s) => s.name))
      for (const s of moving) {
        if (taken.has(s.name)) throw new SheetNameConflictError(s.name)
        taken.add(s.name)
      }
    }

    for (const sheetId of sheetIds) {
      const updated = tx
        .update(sheet)
        .set({
          boxId: targetCollectionType === 'box' ? targetCollectionId : null,
          bagId: targetCollectionType === 'bag' ? targetCollectionId : null,
          lastUpdated: sql`current_timestamp`,
        })
        .where(eq(sheet.id, sheetId))
        .returning({ id: sheet.id })
        .all()
      if (updated.length === 0) {
        throw new SheetNotFoundError(sheetId)
      }
    }
  })

  return { moved: sheetIds.length }
}
