/**
 * Barcode, well-position, and sheet-name uniqueness checks for containers in one request.
 * Shared by bulk specimen validate, bulk-combined validate/import, and POST /subjects/with-specimens.
 */
import type { Database } from '../db/client'
import { micronixTube, cryovialTube } from '../db/schema'
import { eq } from 'drizzle-orm'
import { normalizePosition } from './normalize-position'
import { checkGridPositionOccupancy, occupiedGridPositionMessage } from './container-occupancy'

export type PlacementContainerType = 'micronix_tube' | 'cryovial_tube' | 'paper' | 'static_well'

export type ContainerPlacementCheckRow = {
  containerType: PlacementContainerType
  collectionId: number | null
  collectionKey: string
  normalizedPosition: string | null
  barcode: string | null
  boxKey?: string | null
  sheetName?: string | null
}

export type ContainerPlacementError = {
  rowIndex: number
  message: string
}

type PlacementContainer = {
  containerType: PlacementContainerType
  collectionName?: string
  collectionBarcode?: string
  barcode?: string
  position?: string
  sheetName?: string
  sublabel?: string
}

export function buildContainerPlacementCheckRow(
  container: PlacementContainer,
  collectionId: number | null,
  collectionKey: string
): ContainerPlacementCheckRow {
  const containerType = container.containerType
  return {
    containerType,
    collectionId,
    collectionKey,
    normalizedPosition: normalizePosition(container.position),
    barcode:
      containerType === 'paper'
        ? container.sublabel?.trim() || null
        : container.barcode?.trim() || null,
    boxKey: containerType === 'paper' ? collectionKey : null,
    sheetName: containerType === 'paper' ? (container.sheetName ?? 'Sheet-1').trim() : null,
  }
}

export async function collectContainerPlacementErrors(
  database: Database,
  rows: ContainerPlacementCheckRow[]
): Promise<ContainerPlacementError[]> {
  const errors: ContainerPlacementError[] = []
  const seenBarcodes = new Set<string>()
  const seenPositionByCollection = new Map<string, Set<string>>()
  const seenSheetByBox = new Map<string, Set<string>>()

  for (let rowIndex = 0; rowIndex < rows.length; rowIndex++) {
    const row = rows[rowIndex]
    const {
      containerType,
      collectionId,
      collectionKey,
      normalizedPosition,
      barcode,
      boxKey,
      sheetName,
    } = row

    if (containerType === 'micronix_tube' || containerType === 'cryovial_tube') {
      if (barcode) {
        const existingInDb =
          containerType === 'micronix_tube'
            ? await database
                .select({ id: micronixTube.id })
                .from(micronixTube)
                .where(eq(micronixTube.barcode, barcode))
                .get()
            : await database
                .select({ id: cryovialTube.id })
                .from(cryovialTube)
                .where(eq(cryovialTube.barcode, barcode))
                .get()
        if (existingInDb) {
          errors.push({
            rowIndex,
            message: `Barcode '${barcode}' already exists. Use a different barcode.`,
          })
        }
        if (seenBarcodes.has(barcode)) {
          errors.push({
            rowIndex,
            message: `Barcode '${barcode}' is used more than once in your file. Each barcode must be unique.`,
          })
        }
        seenBarcodes.add(barcode)
      }
    }

    if (
      normalizedPosition &&
      (containerType === 'micronix_tube' || containerType === 'cryovial_tube' || containerType === 'static_well')
    ) {
      if (collectionId !== null) {
        // Same rule as the write path: tubes and static wells share plate cells.
        const collectionKind = containerType === 'cryovial_tube' ? 'cryovial_box' : 'micronix_plate'
        const occupancy = await checkGridPositionOccupancy(database, {
          collectionKind,
          collectionId,
          position: normalizedPosition,
        })
        if (occupancy.occupied) {
          errors.push({
            rowIndex,
            message: occupiedGridPositionMessage(normalizedPosition, collectionKind),
          })
        }
      }

      let positionSet = seenPositionByCollection.get(collectionKey)
      if (!positionSet) {
        positionSet = new Set()
        seenPositionByCollection.set(collectionKey, positionSet)
      }
      if (positionSet.has(normalizedPosition)) {
        errors.push({
          rowIndex,
          message: `Position ${normalizedPosition} in this plate/box is used more than once in your file. Each position can only be used once.`,
        })
      }
      positionSet.add(normalizedPosition)
    }

    if (containerType === 'paper' && boxKey && sheetName) {
      let sheetSet = seenSheetByBox.get(boxKey)
      if (!sheetSet) {
        sheetSet = new Set()
        seenSheetByBox.set(boxKey, sheetSet)
      }
      if (sheetSet.has(sheetName)) {
        errors.push({
          rowIndex,
          message: `Sheet name '${sheetName}' in box is used more than once in your file.`,
        })
      }
      sheetSet.add(sheetName)
    }
  }

  return errors
}
