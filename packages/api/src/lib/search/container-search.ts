import type { Database } from '../../db/client'
import { micronixTube, cryovialTube, micronixPlate, cryovialBox } from '../../db/schema'
import { eq, like, sql } from 'drizzle-orm'
import {
  resolveContainerPlacements,
  type ContainerPlacement,
  type KnownContainerPlacement,
} from '../container-placement'
import type { SearchResult } from './types'

type ContainerSearchRow = {
  id: number
  title: string
  barcode?: string | null
  position?: string | null
  collectionLabel: 'Plate' | 'Box'
  collectionName?: string | null
  collectionId: number
  data: unknown
  idLookup?: boolean
}

function isKnownPlacement(
  placement: ContainerPlacement | undefined,
): placement is KnownContainerPlacement {
  return placement !== undefined && placement.containerType !== 'unknown'
}

function buildContainerSearchSubtitle(
  row: ContainerSearchRow,
  placement: ContainerPlacement | undefined,
): string {
  const known = isKnownPlacement(placement) ? placement : undefined

  if (row.idLookup) {
    if (row.barcode) {
      return known?.locationPath
        ? `Barcode: ${row.barcode} • ${known.locationPath}`
        : `Barcode: ${row.barcode}`
    }

    if (known?.collection) {
      const base = `${row.collectionLabel}: ${known.collection.name}`
      return known.locationPath ? `${base} • ${known.locationPath}` : base
    }

    return `${row.collectionLabel}: ${row.collectionId}`
  }

  const collectionName = known?.collection.name ?? row.collectionName ?? String(row.collectionId)
  const position = known?.collection.position ?? row.position ?? 'N/A'
  let subtitle = `${row.collectionLabel}: ${collectionName}, Position: ${position}`

  if (known?.locationPath) {
    subtitle = `${subtitle} • ${known.locationPath}`
  }

  return subtitle
}

function toSearchResult(row: ContainerSearchRow, placement: ContainerPlacement | undefined): SearchResult {
  const known = isKnownPlacement(placement) ? placement : undefined

  return {
    type: 'container',
    id: row.id,
    title: row.title,
    subtitle: buildContainerSearchSubtitle(row, placement),
    url: `/containers/${row.id}`,
    locationId: known?.location?.id ?? null,
    locationPath: known?.locationPath ?? known?.location?.path,
    data: row.data,
  }
}

/** Search containers by barcode or numeric container id. */
export async function searchContainers(database: Database, query: string): Promise<SearchResult[]> {
  const rows: ContainerSearchRow[] = []

  const micronixTubes = await database
    .select({
      id: micronixTube.id,
      barcode: micronixTube.barcode,
      position: micronixTube.position,
      plateId: micronixTube.collectionId,
      plateName: micronixPlate.name,
      type: sql<string>`'micronix_tube'`.as('type'),
    })
    .from(micronixTube)
    .leftJoin(micronixPlate, eq(micronixTube.collectionId, micronixPlate.id))
    .where(like(micronixTube.barcode, `%${query}%`))
    .limit(10)

  for (const tube of micronixTubes) {
    rows.push({
      id: tube.id,
      title: `Micronix Tube: ${tube.barcode}`,
      barcode: tube.barcode,
      position: tube.position,
      collectionLabel: 'Plate',
      collectionName: tube.plateName,
      collectionId: tube.plateId,
      data: tube,
    })
  }

  const cryovialTubes = await database
    .select({
      id: cryovialTube.id,
      barcode: cryovialTube.barcode,
      position: cryovialTube.position,
      boxId: cryovialTube.collectionId,
      boxName: cryovialBox.name,
      type: sql<string>`'cryovial_tube'`.as('type'),
    })
    .from(cryovialTube)
    .leftJoin(cryovialBox, eq(cryovialTube.collectionId, cryovialBox.id))
    .where(like(cryovialTube.barcode, `%${query}%`))
    .limit(10)

  for (const tube of cryovialTubes) {
    rows.push({
      id: tube.id,
      title: `Cryovial Tube: ${tube.barcode || 'No barcode'}`,
      barcode: tube.barcode,
      position: tube.position,
      collectionLabel: 'Box',
      collectionName: tube.boxName,
      collectionId: tube.boxId,
      data: tube,
    })
  }

  const queryNum = parseInt(query)
  if (!isNaN(queryNum)) {
    const micronixById = await database
      .select()
      .from(micronixTube)
      .where(eq(micronixTube.id, queryNum))
      .limit(1)

    if (micronixById.length > 0) {
      const tube = micronixById[0]
      rows.push({
        id: tube.id,
        title: `Micronix Tube #${tube.id}`,
        barcode: tube.barcode,
        collectionLabel: 'Plate',
        collectionId: tube.collectionId,
        data: tube,
        idLookup: true,
      })
    } else {
      const cryovialById = await database
        .select()
        .from(cryovialTube)
        .where(eq(cryovialTube.id, queryNum))
        .limit(1)

      if (cryovialById.length > 0) {
        const tube = cryovialById[0]
        rows.push({
          id: tube.id,
          title: `Cryovial Tube #${tube.id}`,
          barcode: tube.barcode,
          collectionLabel: 'Box',
          collectionId: tube.collectionId,
          data: tube,
          idLookup: true,
        })
      }
    }
  }

  if (rows.length === 0) {
    return []
  }

  const placementMap = await resolveContainerPlacements(
    database,
    rows.map((row) => row.id),
  )

  return rows.map((row) => toSearchResult(row, placementMap.get(row.id)))
}
