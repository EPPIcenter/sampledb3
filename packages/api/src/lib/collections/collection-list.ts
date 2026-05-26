import { eq, inArray, sql } from 'drizzle-orm'
import type { Database } from '../../db/client'
import {
  micronixPlate,
  micronixTube,
  staticWell,
  cryovialBox,
  cryovialTube,
  box,
  bag,
  sheet,
  paper,
  location,
} from '../../db/schema'
import { formatLocationPath } from '../container-enrichment'
import type { CollectionListAllEntry, CollectionListEntry, CollectionType } from './types'

function toLocationSummary(loc: typeof location.$inferSelect | null): CollectionListEntry['location'] {
  if (!loc) return null
  return { id: loc.id, path: formatLocationPath(loc) }
}

async function listMicronixPlates(database: Database): Promise<CollectionListEntry[]> {
  const platesData = await database
    .select({ plate: micronixPlate, location: location })
    .from(micronixPlate)
    .leftJoin(location, eq(micronixPlate.locationId, location.id))

  const plateIds = platesData.map((p) => p.plate.id)
  const [tubeCounts, wellCounts] =
    plateIds.length > 0
      ? await Promise.all([
          database
            .select({
              collectionId: micronixTube.collectionId,
              count: sql<number>`COUNT(*)`.as('count'),
            })
            .from(micronixTube)
            .where(inArray(micronixTube.collectionId, plateIds))
            .groupBy(micronixTube.collectionId),
          database
            .select({
              collectionId: staticWell.collectionId,
              count: sql<number>`COUNT(*)`.as('count'),
            })
            .from(staticWell)
            .where(inArray(staticWell.collectionId, plateIds))
            .groupBy(staticWell.collectionId),
        ])
      : [[], []]

  const tubeCountMap = new Map(tubeCounts.map((t) => [t.collectionId, t.count]))
  const wellCountMap = new Map(wellCounts.map((w) => [w.collectionId, w.count]))

  return platesData.map((r) => ({
    id: r.plate.id,
    name: r.plate.name,
    barcode: r.plate.barcode,
    locationId: r.plate.locationId,
    itemCount: (tubeCountMap.get(r.plate.id) || 0) + (wellCountMap.get(r.plate.id) || 0),
    location: toLocationSummary(r.location),
  }))
}

async function listCryovialBoxes(database: Database): Promise<CollectionListEntry[]> {
  const boxesData = await database
    .select({ box: cryovialBox, location: location })
    .from(cryovialBox)
    .leftJoin(location, eq(cryovialBox.locationId, location.id))

  const boxIds = boxesData.map((b) => b.box.id)
  const tubeCounts =
    boxIds.length > 0
      ? await database
          .select({
            collectionId: cryovialTube.collectionId,
            count: sql<number>`COUNT(*)`.as('count'),
          })
          .from(cryovialTube)
          .where(inArray(cryovialTube.collectionId, boxIds))
          .groupBy(cryovialTube.collectionId)
      : []

  const tubeCountMap = new Map(tubeCounts.map((t) => [t.collectionId, t.count]))

  return boxesData.map((r) => ({
    id: r.box.id,
    name: r.box.name,
    barcode: r.box.barcode,
    locationId: r.box.locationId,
    itemCount: tubeCountMap.get(r.box.id) || 0,
    location: toLocationSummary(r.location),
  }))
}

async function listGenericBoxes(database: Database): Promise<CollectionListEntry[]> {
  const boxesData = await database
    .select({ box: box, location: location })
    .from(box)
    .leftJoin(location, eq(box.locationId, location.id))

  const boxIds = boxesData.map((b) => b.box.id)
  const sheetCounts =
    boxIds.length > 0
      ? await database
          .select({
            boxId: sheet.boxId,
            count: sql<number>`COUNT(*)`.as('count'),
          })
          .from(sheet)
          .where(inArray(sheet.boxId, boxIds))
          .groupBy(sheet.boxId)
      : []

  const sheetCountMap = new Map(sheetCounts.map((s) => [s.boxId, s.count]))

  return boxesData.map((r) => ({
    id: r.box.id,
    name: r.box.name,
    barcode: null,
    locationId: r.box.locationId,
    itemCount: sheetCountMap.get(r.box.id) || 0,
    location: toLocationSummary(r.location),
  }))
}

async function listBags(database: Database): Promise<CollectionListEntry[]> {
  const bagsData = await database
    .select({ bag: bag, location: location })
    .from(bag)
    .leftJoin(location, eq(bag.locationId, location.id))

  const bagIds = bagsData.map((b) => b.bag.id)
  const sheetCounts =
    bagIds.length > 0
      ? await database
          .select({
            bagId: sheet.bagId,
            count: sql<number>`COUNT(*)`.as('count'),
          })
          .from(sheet)
          .where(inArray(sheet.bagId, bagIds))
          .groupBy(sheet.bagId)
      : []

  const sheetCountMap = new Map(sheetCounts.map((s) => [s.bagId, s.count]))

  return bagsData.map((r) => ({
    id: r.bag.id,
    name: r.bag.name,
    barcode: null,
    locationId: r.bag.locationId,
    itemCount: sheetCountMap.get(r.bag.id) || 0,
    location: toLocationSummary(r.location),
  }))
}

export async function listAllCollections(database: Database): Promise<CollectionListAllEntry[]> {
  const [plates, cryovialBoxes, boxes, bags] = await Promise.all([
    listMicronixPlates(database),
    listCryovialBoxes(database),
    listGenericBoxes(database),
    listBags(database),
  ])

  return [
    ...plates.map((p) => ({ ...p, type: 'micronix_plate' as const })),
    ...cryovialBoxes.map((b) => ({ ...b, type: 'cryovial_box' as const })),
    ...boxes.map((b) => ({ ...b, type: 'box' as const })),
    ...bags.map((b) => ({ ...b, type: 'bag' as const })),
  ]
}

export async function listCollectionsByType(database: Database, type: CollectionType) {
  switch (type) {
    case 'micronix_plate':
      return listMicronixPlates(database)
    case 'cryovial_box': {
      const boxes = await database
        .select({
          box: cryovialBox,
          location: location,
          tubeCount: sql<number>`(SELECT COUNT(*) FROM ${cryovialTube} WHERE ${cryovialTube.collectionId} = ${cryovialBox.id})`,
        })
        .from(cryovialBox)
        .leftJoin(location, eq(cryovialBox.locationId, location.id))
      return boxes.map((r) => ({
        id: r.box.id,
        name: r.box.name,
        barcode: r.box.barcode,
        locationId: r.box.locationId,
        itemCount: r.tubeCount || 0,
        location: toLocationSummary(r.location),
      }))
    }
    case 'box': {
      const boxes = await database
        .select({
          box: box,
          location: location,
          sheetCount: sql<number>`(SELECT COUNT(*) FROM ${sheet} WHERE ${sheet.boxId} = ${box.id})`,
        })
        .from(box)
        .leftJoin(location, eq(box.locationId, location.id))
      return boxes.map((r) => ({
        id: r.box.id,
        name: r.box.name,
        locationId: r.box.locationId,
        itemCount: r.sheetCount || 0,
        location: toLocationSummary(r.location),
      }))
    }
    case 'bag': {
      const bags = await database
        .select({
          bag: bag,
          location: location,
          sheetCount: sql<number>`(SELECT COUNT(*) FROM ${sheet} WHERE ${sheet.bagId} = ${bag.id})`,
        })
        .from(bag)
        .leftJoin(location, eq(bag.locationId, location.id))
      return bags.map((r) => ({
        id: r.bag.id,
        name: r.bag.name,
        locationId: r.bag.locationId,
        itemCount: r.sheetCount || 0,
        location: toLocationSummary(r.location),
      }))
    }
    case 'sheet': {
      const sheets = await database
        .select({
          sheet: sheet,
          paperCount: sql<number>`(SELECT COUNT(*) FROM ${paper} WHERE ${paper.sheetId} = ${sheet.id})`,
        })
        .from(sheet)
      return sheets.map((r) => ({
        id: r.sheet.id,
        name: r.sheet.name,
        itemCount: r.paperCount || 0,
      }))
    }
    default:
      return []
  }
}
