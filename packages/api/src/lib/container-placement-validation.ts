/**
 * Barcode and well-position uniqueness checks for specimen containers in one request.
 * Shared by bulk-combined-import and POST /subjects/with-specimens.
 */
import type { Database } from '../db/client'
import { micronixTube, cryovialTube, staticWell } from '../db/schema'
import { eq, and } from 'drizzle-orm'
import { ValidationError } from './error-handler'
import { normalizePosition } from './normalize-position'

type PlacementContainer = {
  containerType: 'micronix_tube' | 'cryovial_tube' | 'paper' | 'static_well'
  collectionName?: string
  collectionBarcode?: string
  barcode?: string
  position?: string
}

export type ResolvedSpecimenForPlacement = {
  specimenTypeId: number
  collectionDate?: string
  container?: PlacementContainer
}

export async function validateContainerPlacementInPayload(
  database: Database,
  resolvedSpecimens: ResolvedSpecimenForPlacement[],
  collectionMap: Map<string, number>
): Promise<void> {
  const seenBarcodes = new Set<string>()
  const seenPositionByCollection = new Map<string, Set<string>>()

  for (let specimenIndex = 0; specimenIndex < resolvedSpecimens.length; specimenIndex++) {
    const spec = resolvedSpecimens[specimenIndex]
    if (!spec.container?.containerType) continue

    const container = spec.container
    const containerType = container.containerType
    const normalizedPosition = normalizePosition(container.position)

    let collectionKey = ''
    let collectionId: number | null = null
    if (containerType === 'cryovial_tube') {
      const identifier = container.collectionName || container.collectionBarcode
      if (identifier) {
        collectionKey = `cryovial_box-${identifier}`
        collectionId = collectionMap.get(collectionKey) ?? null
      }
    } else if (containerType === 'micronix_tube' || containerType === 'static_well') {
      const identifier = container.collectionName || container.collectionBarcode
      if (identifier) {
        collectionKey = `micronix_plate-${identifier}`
        collectionId = collectionMap.get(collectionKey) ?? null
      }
    }

    if (containerType === 'micronix_tube' || containerType === 'cryovial_tube') {
      const barcode = container.barcode?.trim()
      if (barcode) {
        if (seenBarcodes.has(barcode)) {
          throw new ValidationError(
            `Barcode '${barcode}' is used more than once in your file. Each barcode must be unique.`,
            { specimenIndex }
          )
        }
        seenBarcodes.add(barcode)
      }
    }

    if (
      normalizedPosition &&
      collectionId !== null &&
      (containerType === 'micronix_tube' || containerType === 'cryovial_tube' || containerType === 'static_well')
    ) {
      if (containerType === 'micronix_tube' || containerType === 'static_well') {
        const existingTube = await database
          .select({ id: micronixTube.id })
          .from(micronixTube)
          .where(and(eq(micronixTube.collectionId, collectionId), eq(micronixTube.position, normalizedPosition)))
          .get()
        const existingWell =
          containerType === 'static_well'
            ? await database
                .select({ id: staticWell.id })
                .from(staticWell)
                .where(and(eq(staticWell.collectionId, collectionId), eq(staticWell.position, normalizedPosition)))
                .get()
            : null
        if (existingTube || existingWell) {
          throw new ValidationError(
            `Position ${normalizedPosition} is already used in this plate. Use a different position or plate.`,
            { specimenIndex }
          )
        }
      } else {
        const existing = await database
          .select({ id: cryovialTube.id })
          .from(cryovialTube)
          .where(and(eq(cryovialTube.collectionId, collectionId), eq(cryovialTube.position, normalizedPosition)))
          .get()
        if (existing) {
          throw new ValidationError(
            `Position ${normalizedPosition} is already used in this box. Use a different position or box.`,
            { specimenIndex }
          )
        }
      }

      if (collectionKey) {
        let positionSet = seenPositionByCollection.get(collectionKey)
        if (!positionSet) {
          positionSet = new Set()
          seenPositionByCollection.set(collectionKey, positionSet)
        }
        if (positionSet.has(normalizedPosition)) {
          throw new ValidationError(
            `Position ${normalizedPosition} in this plate/box is used more than once in your file. Each position can only be used once.`,
            { specimenIndex }
          )
        }
        positionSet.add(normalizedPosition)
      }
    }
  }
}
