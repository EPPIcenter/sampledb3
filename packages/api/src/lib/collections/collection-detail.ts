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
import { formatLocationPath } from '../container-enrichment'
import { normalizePosition } from '../normalize-position'
import { enrichPaperContainers, enrichStorageContainers, attachTagsToEnrichedContainers } from './container-detail'

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

  const tubeContainersWithTags = await attachTagsToEnrichedContainers(
    database,
    tubeEntries.map((entry) => entry.container),
  )
  tubeEntries.forEach((entry, index) => {
    entry.container = tubeContainersWithTags[index]
  })

  const wellEntries = wells.map((w) => ({
    type: 'static_well' as const,
    id: w.id,
    position: w.position,
    container: enrichedById.get(w.id) ?? null,
  }))

  const wellContainersWithTags = await attachTagsToEnrichedContainers(
    database,
    wellEntries.map((entry) => entry.container),
  )
  wellEntries.forEach((entry, index) => {
    entry.container = wellContainersWithTags[index]
  })

  const wellsByPosition: Record<string, (typeof tubeEntries)[number] | (typeof wellEntries)[number]> = {}
  for (const entry of [...tubeEntries, ...wellEntries]) {
    wellsByPosition[entry.position || ''] = entry
  }

  return {
    plate: {
      ...plate,
      location: loc || null,
      locationPath: formatLocationPath(loc),
    },
    wells: wellsByPosition,
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

  const tubeContainersWithTags = await attachTagsToEnrichedContainers(
    database,
    tubeEntries.map((entry) => entry.container),
  )
  tubeEntries.forEach((entry, index) => {
    entry.container = tubeContainersWithTags[index]
  })

  const positions: Record<string, typeof tubeEntries> = {}
  for (const entry of tubeEntries) {
    const pos = normalizePosition(entry.position) ?? ''
    ;(positions[pos] ??= []).push(entry)
  }

  return {
    box: {
      ...boxRecord,
      location: loc || null,
      locationPath: formatLocationPath(loc),
    },
    positions,
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
