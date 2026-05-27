import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { eq } from 'drizzle-orm'
import type { Database } from '../../../db/client'
import { box, bag, sheet } from '../../../db/schema'
import { setupTestDatabase, cleanupTestDatabase } from '../../../__tests__/helpers/db-setup'
import { createTestLocation, createTestStorageType } from '../../../__tests__/helpers/factories'
import { utcNow } from '../../datetime'
import {
  moveSheetsToCollection,
  SheetMoveTargetNotFoundError,
  SheetNotFoundError,
} from '../sheet-move'

describe('sheet-move', () => {
  let testDb: Database
  let sqlite: Awaited<ReturnType<typeof setupTestDatabase>>['sqlite']

  beforeEach(async () => {
    const setup = await setupTestDatabase()
    testDb = setup.db
    sqlite = setup.sqlite
  })

  afterEach(() => {
    if (sqlite) cleanupTestDatabase(sqlite)
  })

  async function createBox(name: string) {
    const storageType = await createTestStorageType(testDb, { name: `Room-${name}-${Date.now()}` })
    const loc = await createTestLocation(testDb, {
      name: `Loc-${name}`,
      storageTypeId: String(storageType.id),
    })
    const now = utcNow()
    const [row] = await testDb
      .insert(box)
      .values({ name, locationId: loc.id, created: now, lastUpdated: now })
      .returning()
    return row!
  }

  async function createBag(name: string) {
    const storageType = await createTestStorageType(testDb, { name: `Archive-${name}-${Date.now()}` })
    const loc = await createTestLocation(testDb, {
      name: `Loc-${name}`,
      storageTypeId: String(storageType.id),
    })
    const now = utcNow()
    const [row] = await testDb
      .insert(bag)
      .values({ name, locationId: loc.id, created: now, lastUpdated: now })
      .returning()
    return row!
  }

  async function createSheetOnBox(boxId: number, name: string) {
    const now = utcNow()
    const [row] = await testDb
      .insert(sheet)
      .values({ name, boxId, created: now, lastUpdated: now })
      .returning()
    return row!
  }

  it('moves sheets from one box to another', async () => {
    const sourceBox = await createBox('Source')
    const targetBox = await createBox('Target')
    const sheetRow = await createSheetOnBox(sourceBox.id, 'Sheet A')

    const result = await moveSheetsToCollection(testDb, [sheetRow.id], targetBox.id, 'box')

    expect(result).toEqual({ moved: 1 })
    const updated = await testDb.select().from(sheet).where(eq(sheet.id, sheetRow.id)).get()
    expect(updated?.boxId).toBe(targetBox.id)
    expect(updated?.bagId).toBeNull()
  })

  it('moves sheets onto a bag and clears boxId', async () => {
    const sourceBox = await createBox('Source')
    const targetBag = await createBag('Target bag')
    const sheetRow = await createSheetOnBox(sourceBox.id, 'Sheet B')

    await moveSheetsToCollection(testDb, [sheetRow.id], targetBag.id, 'bag')

    const updated = await testDb.select().from(sheet).where(eq(sheet.id, sheetRow.id)).get()
    expect(updated?.bagId).toBe(targetBag.id)
    expect(updated?.boxId).toBeNull()
  })

  it('throws SheetMoveTargetNotFoundError when target box is missing', async () => {
    const sourceBox = await createBox('Source')
    const sheetRow = await createSheetOnBox(sourceBox.id, 'Sheet C')

    await expect(
      moveSheetsToCollection(testDb, [sheetRow.id], 99999, 'box')
    ).rejects.toBeInstanceOf(SheetMoveTargetNotFoundError)
  })

  it('throws SheetNotFoundError when a sheet id does not exist', async () => {
    const targetBox = await createBox('Target')

    await expect(moveSheetsToCollection(testDb, [99999], targetBox.id, 'box')).rejects.toBeInstanceOf(
      SheetNotFoundError
    )
  })
})
