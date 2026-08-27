import type { Database } from '../db/client'
import { micronixTube, cryovialTube, staticWell } from '../db/schema'
import { and, eq } from 'drizzle-orm'
import { normalizePosition } from './normalize-position'

export type OccupancyCollectionKind = 'micronix_plate' | 'cryovial_box'

export type OccupyingContainerType = 'micronix_tube' | 'cryovial_tube' | 'static_well'

export async function checkGridPositionOccupancy(
  database: Database,
  args: {
    collectionKind: OccupancyCollectionKind
    collectionId: number
    position: string | null
    excludeContainerIds?: number[]
  },
): Promise<{ occupied: boolean; containerId: number | null; occupyingType: OccupyingContainerType | null }> {
  const position = normalizePosition(args.position)
  if (!position) {
    return { occupied: false, containerId: null, occupyingType: null }
  }

  const exclude = args.excludeContainerIds ?? []

  if (args.collectionKind === 'micronix_plate') {
    const tubeRec = await database
      .select({ id: micronixTube.id })
      .from(micronixTube)
      .where(and(eq(micronixTube.collectionId, args.collectionId), eq(micronixTube.position, position)))
      .get()
    if (tubeRec && !exclude.includes(tubeRec.id)) {
      return { occupied: true, containerId: tubeRec.id, occupyingType: 'micronix_tube' }
    }

    const well = await database
      .select({ id: staticWell.id })
      .from(staticWell)
      .where(and(eq(staticWell.collectionId, args.collectionId), eq(staticWell.position, position)))
      .get()
    if (well && !exclude.includes(well.id)) {
      return { occupied: true, containerId: well.id, occupyingType: 'static_well' }
    }

    return { occupied: false, containerId: null, occupyingType: null }
  }

  const cryovial = await database
    .select({ id: cryovialTube.id })
    .from(cryovialTube)
    .where(and(eq(cryovialTube.collectionId, args.collectionId), eq(cryovialTube.position, position)))
    .get()
  if (cryovial && !exclude.includes(cryovial.id)) {
    return { occupied: true, containerId: cryovial.id, occupyingType: 'cryovial_tube' }
  }

  return { occupied: false, containerId: null, occupyingType: null }
}

export function occupiedGridPositionMessage(position: string, collectionKind: OccupancyCollectionKind): string {
  const place = collectionKind === 'cryovial_box' ? 'box' : 'plate'
  return `Position ${position} is already used in this ${place}. Use a different position or ${place}.`
}
