import type { Database } from '../../db/client'
import { micronixTube, cryovialTube, micronixPlate, cryovialBox } from '../../db/schema'
import { eq, like, sql } from 'drizzle-orm'
import type { SearchResult } from './types'

/** Search containers by barcode or numeric container id. */
export async function searchContainers(database: Database, query: string): Promise<SearchResult[]> {
  const results: SearchResult[] = []

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
    results.push({
      type: 'container',
      id: tube.id,
      title: `Micronix Tube: ${tube.barcode}`,
      subtitle: `Plate: ${tube.plateName || tube.plateId}, Position: ${tube.position || 'N/A'}`,
      url: `/containers/${tube.id}`,
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
    results.push({
      type: 'container',
      id: tube.id,
      title: `Cryovial Tube: ${tube.barcode || 'No barcode'}`,
      subtitle: `Box: ${tube.boxName || tube.boxId}, Position: ${tube.position || 'N/A'}`,
      url: `/containers/${tube.id}`,
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
      results.push({
        type: 'container',
        id: tube.id,
        title: `Micronix Tube #${tube.id}`,
        subtitle: tube.barcode ? `Barcode: ${tube.barcode}` : `Plate: ${tube.collectionId}`,
        url: `/containers/${tube.id}`,
        data: tube,
      })
    } else {
      const cryovialById = await database
        .select()
        .from(cryovialTube)
        .where(eq(cryovialTube.id, queryNum))
        .limit(1)

      if (cryovialById.length > 0) {
        const tube = cryovialById[0]
        results.push({
          type: 'container',
          id: tube.id,
          title: `Cryovial Tube #${tube.id}`,
          subtitle: tube.barcode ? `Barcode: ${tube.barcode}` : `Box: ${tube.collectionId}`,
          url: `/containers/${tube.id}`,
          data: tube,
        })
      }
    }
  }

  return results
}
