import { eq } from 'drizzle-orm'
import type { Database } from '../../db/client'
import {
  micronixPlate,
  micronixTube,
  staticWell,
  cryovialBox,
  cryovialTube,
  box,
  bag,
  paper,
  sheet,
  location,
} from '../../db/schema'
import { gridPositionKey } from '@sampledb/contract'
import { formatLocationPath } from '../container-enrichment'
import { enrichPaperContainers, enrichStorageContainers } from './container-detail'

const naturalOrder = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' })

/** Unplaced entries by stored position (missing last), then barcode, then id. */
function sortUnplaced<T extends { id: number; position: string | null; barcode?: string | null }>(entries: T[]): T[] {
  return [...entries].sort((a, b) => {
    if (a.position !== b.position) {
      if (a.position == null) return 1
      if (b.position == null) return -1
      const byPosition = naturalOrder.compare(a.position, b.position)
      if (byPosition !== 0) return byPosition
    }
    const byBarcode = naturalOrder.compare(a.barcode ?? '', b.barcode ?? '')
    return byBarcode !== 0 ? byBarcode : a.id - b.id
  })
}

export async function getMicronixPlateDetail(database: Database, id: number) {
  const plate = await database.select().from(micronixPlate).where(eq(micronixPlate.id, id)).get()
  if (!plate) return null

  const [loc, tubes, wells] = await Promise.all([
    database.select().from(location).where(eq(location.id, plate.locationId)).get(),
    database.select().from(micronixTube).where(eq(micronixTube.collectionId, id)),
    database.select().from(staticWell).where(eq(staticWell.collectionId, id)),
  ])

  const enrichedById = await enrichStorageContainers(database, [
    ...tubes.map((t) => t.id),
    ...wells.map((w) => w.id),
  ])

  const tubeEntries = tubes.map((t) => ({
    type: 'micronix_tube' as const,
    id: t.id,
    barcode: t.barcode,
    position: t.position,
    container: enrichedById.get(t.id) ?? null,
  }))

  const wellEntries = wells.map((w) => ({
    type: 'static_well' as const,
    id: w.id,
    position: w.position,
    container: enrichedById.get(w.id) ?? null,
  }))

  // A Container whose position is missing or not a cell of the plate grid is
  // unplaced. A second Container normalizing to an occupied cell is also listed
  // as unplaced so that no Container drops out of the response.
  type PlateEntry = (typeof tubeEntries)[number] | (typeof wellEntries)[number]
  const wellsByPosition: Record<string, PlateEntry> = {}
  const unplaced: PlateEntry[] = []
  for (const entry of [...tubeEntries, ...wellEntries]) {
    const key = gridPositionKey(entry.position, 'micronix_plate')
    if (key != null && !(key in wellsByPosition)) wellsByPosition[key] = entry
    else unplaced.push(entry)
  }

  return {
    plate: {
      ...plate,
      location: loc || null,
      locationPath: formatLocationPath(loc),
    },
    wells: wellsByPosition,
    unplaced: sortUnplaced(unplaced),
  }
}

export async function getCryovialBoxDetail(database: Database, id: number) {
  const boxRecord = await database.select().from(cryovialBox).where(eq(cryovialBox.id, id)).get()
  if (!boxRecord) return null

  const loc = await database.select().from(location).where(eq(location.id, boxRecord.locationId)).get()
  const tubes = await database.select().from(cryovialTube).where(eq(cryovialTube.collectionId, id))

  const cryovialEnrichedById = await enrichStorageContainers(database, tubes.map((t) => t.id))
  const tubeEntries = tubes.map((t) => ({
    kind: 'cryovial_tube' as const,
    id: t.id,
    barcode: t.barcode,
    position: t.position,
    container: cryovialEnrichedById.get(t.id) ?? null,
  }))

  const positions: Record<string, typeof tubeEntries> = {}
  const unplaced: typeof tubeEntries = []
  for (const entry of tubeEntries) {
    const key = gridPositionKey(entry.position, 'cryovial_box')
    if (key == null) unplaced.push(entry)
    else (positions[key] ??= []).push(entry)
  }

  return {
    box: {
      ...boxRecord,
      location: loc || null,
      locationPath: formatLocationPath(loc),
    },
    positions,
    unplaced: sortUnplaced(unplaced),
  }
}

async function getSheetContentsForParent(database: Database, sheets: (typeof sheet.$inferSelect)[]) {
  return Promise.all(
    sheets.map(async (s) => {
      const papers = await database.select().from(paper).where(eq(paper.sheetId, s.id))
      const paperEntries = await enrichPaperContainers(database, papers)
      return { ...s, papers: paperEntries }
    }),
  )
}

export async function getGenericBoxDetail(database: Database, id: number) {
  const boxRecord = await database.select().from(box).where(eq(box.id, id)).get()
  if (!boxRecord) return null

  const loc = await database.select().from(location).where(eq(location.id, boxRecord.locationId)).get()
  const sheets = await database.select().from(sheet).where(eq(sheet.boxId, id))
  const sheetContents = await getSheetContentsForParent(database, sheets)

  return {
    box: {
      ...boxRecord,
      location: loc || null,
      locationPath: formatLocationPath(loc),
    },
    contents: { sheets: sheetContents },
  }
}

export async function getBagDetail(database: Database, id: number) {
  const bagRecord = await database.select().from(bag).where(eq(bag.id, id)).get()
  if (!bagRecord) return null

  const loc = await database.select().from(location).where(eq(location.id, bagRecord.locationId)).get()
  const sheets = await database.select().from(sheet).where(eq(sheet.bagId, id))
  const contents = await getSheetContentsForParent(database, sheets)

  return {
    bag: {
      ...bagRecord,
      location: loc || null,
      locationPath: formatLocationPath(loc),
    },
    contents: { sheets: contents },
  }
}

export async function getSheetDetail(database: Database, id: number) {
  const sheetRecord = await database.select().from(sheet).where(eq(sheet.id, id)).get()
  if (!sheetRecord) return null

  let locationInfo: typeof location.$inferSelect | null = null
  let locationPath: string | undefined
  let parentBox: { id: number; name: string } | null = null
  let parentBag: { id: number; name: string } | null = null

  if (sheetRecord.boxId) {
    const parent = await database
      .select({ box: box, location: location })
      .from(box)
      .leftJoin(location, eq(box.locationId, location.id))
      .where(eq(box.id, sheetRecord.boxId))
      .get()
    locationInfo = parent?.location ?? null
    locationPath = formatLocationPath(locationInfo)
    parentBox = parent?.box ? { id: parent.box.id, name: parent.box.name } : null
  } else if (sheetRecord.bagId) {
    const parent = await database
      .select({ bag: bag, location: location })
      .from(bag)
      .leftJoin(location, eq(bag.locationId, location.id))
      .where(eq(bag.id, sheetRecord.bagId))
      .get()
    locationInfo = parent?.location ?? null
    locationPath = formatLocationPath(locationInfo)
    parentBag = parent?.bag ? { id: parent.bag.id, name: parent.bag.name } : null
  }

  const papers = await database.select().from(paper).where(eq(paper.sheetId, id))
  const paperEntries = await enrichPaperContainers(database, papers)

  return {
    sheet: {
      ...sheetRecord,
      location: locationInfo,
      locationPath,
      box: parentBox,
      bag: parentBag,
    },
    papers: paperEntries,
  }
}
